import logging

import httpx
from sqlalchemy import func, text as sql_text
from sqlalchemy.orm import Session

from app.models import Company, Document, DocumentChunk, LLMConfig, MarkdownContent
from app.services.crypto_service import decrypt_api_key

logger = logging.getLogger(__name__)


class KnowledgeService:
    async def hybrid_search(
        self,
        db: Session,
        query: str,
        *,
        ticker: str | None = None,
        year: int | None = None,
        report_type: str | None = None,
        report_period: str | None = None,
        limit: int = 10,
        embedding_config: LLMConfig | None = None,
    ) -> list[dict]:
        """Hybrid search: vector similarity + full-text, merged with RRF."""
        if not embedding_config:
            embedding_config = (
                db.query(LLMConfig)
                .filter(LLMConfig.is_default == True, LLMConfig.config_type == "embedding")
                .first()
            )
        if not embedding_config:
            # Fall back to any embedding config if no default is set
            embedding_config = (
                db.query(LLMConfig)
                .filter(LLMConfig.config_type == "embedding")
                .first()
            )
        if not embedding_config:
            raise ValueError("No embedding LLM config found. Create one in Settings.")

        # Get query embedding
        api_key = decrypt_api_key(embedding_config.api_key_encrypted)
        query_embedding = await self._embed_query(
            embedding_config.base_url, api_key, embedding_config.model_name, query
        )

        # Build params — always pass all filter params (NULL means "no filter")
        embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
        params = {
            "ticker": ticker or None,
            "year": year or None,
            "report_type": report_type or None,
            "report_period": report_period or None,
            "query_embedding": embedding_str,
            "query_text": query,
            "limit": min(limit, 50),
            "rrf_k": 60,
        }

        # Hybrid search with Reciprocal Rank Fusion (RRF)
        # Filters use (:param IS NULL OR col = :param) to avoid f-string SQL interpolation
        sql = sql_text("""
            WITH vector_ranked AS (
                SELECT
                    dc.id AS chunk_id,
                    dc.chunk_text,
                    dc.chunk_heading,
                    dc.document_id,
                    d.ticker,
                    d.report_name,
                    d.year,
                    d.report_type,
                    d.report_period,
                    c.name AS company_name,
                    ROW_NUMBER() OVER (ORDER BY dc.embedding <=> CAST(:query_embedding AS vector)) AS vector_rank
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                LEFT JOIN companies c ON d.company_id = c.id
                WHERE (:ticker IS NULL OR d.ticker = :ticker)
                  AND (:year IS NULL OR d.year = :year)
                  AND (:report_type IS NULL OR d.report_type = :report_type)
                  AND (:report_period IS NULL OR d.report_period = :report_period)
                  AND dc.embedding IS NOT NULL
                ORDER BY dc.embedding <=> CAST(:query_embedding AS vector)
                LIMIT 100
            ),
            fulltext_ranked AS (
                SELECT
                    dc.id AS chunk_id,
                    ROW_NUMBER() OVER (
                        ORDER BY ts_rank(
                            to_tsvector('simple', dc.chunk_text),
                            plainto_tsquery('simple', :query_text)
                        ) DESC
                    ) AS ft_rank
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                WHERE (:ticker IS NULL OR d.ticker = :ticker)
                  AND (:year IS NULL OR d.year = :year)
                  AND (:report_type IS NULL OR d.report_type = :report_type)
                  AND (:report_period IS NULL OR d.report_period = :report_period)
                  AND to_tsvector('simple', dc.chunk_text) @@ plainto_tsquery('simple', :query_text)
                LIMIT 100
            )
            SELECT
                vr.chunk_id,
                vr.chunk_text,
                vr.chunk_heading,
                vr.document_id,
                vr.ticker,
                vr.report_name,
                vr.year,
                vr.report_type,
                vr.report_period,
                vr.company_name,
                (1.0 / (:rrf_k + vr.vector_rank)) + COALESCE(1.0 / (:rrf_k + fr.ft_rank), 0) AS rrf_score
            FROM vector_ranked vr
            LEFT JOIN fulltext_ranked fr ON vr.chunk_id = fr.chunk_id
            ORDER BY rrf_score DESC
            LIMIT :limit
        """)

        result = db.execute(sql, params)
        rows = result.fetchall()

        return [
            {
                "chunk_text": row.chunk_text,
                "document_id": row.document_id,
                "ticker": row.ticker,
                "report_name": row.report_name,
                "section_heading": row.chunk_heading,
                "score": float(row.rrf_score),
                "year": row.year,
                "report_type": row.report_type,
                "report_period": row.report_period,
                "company_name": row.company_name,
            }
            for row in rows
        ]

    async def ask(
        self,
        db: Session,
        query: str,
        *,
        ticker: str | None = None,
        year: int | None = None,
        report_type: str | None = None,
        report_period: str | None = None,
        llm_config_id: str | None = None,
    ) -> dict:
        """RAG: retrieve relevant chunks and generate answer with LLM."""
        # Get search results
        results = await self.hybrid_search(
            db, query,
            ticker=ticker,
            year=year,
            report_type=report_type,
            report_period=report_period,
            limit=10,
        )

        if not results:
            return {
                "answer": "No relevant documents found for your query.",
                "sources": [],
            }

        # Get chat LLM config
        chat_config = None
        if llm_config_id:
            chat_config = db.query(LLMConfig).get(llm_config_id)
        else:
            chat_config = (
                db.query(LLMConfig)
                .filter(LLMConfig.is_default == True, LLMConfig.config_type == "vision")
                .first()
            )
        if not chat_config:
            raise ValueError("No chat LLM config found for answer generation")

        api_key = decrypt_api_key(chat_config.api_key_encrypted)

        # Build context from retrieved chunks
        context_parts = []
        for i, r in enumerate(results, 1):
            ticker_label = r['ticker']
            if r.get('company_name'):
                ticker_label += f" ({r['company_name']})"
            source = f"[Source {i}: {ticker_label} - {r['report_name']}"
            meta_parts = []
            if r.get('year'):
                meta_parts.append(f"Year: {r['year']}")
            if r.get('report_type'):
                meta_parts.append(f"Type: {r['report_type']}")
            if r.get('report_period'):
                meta_parts.append(f"Period: {r['report_period']}")
            if meta_parts:
                source += f" | {', '.join(meta_parts)}"
            if r.get("section_heading"):
                source += f" > {r['section_heading']}"
            source += "]"
            context_parts.append(f"{source}\n{r['chunk_text']}")

        context = "\n\n---\n\n".join(context_parts)

        system_prompt = (
            "You are a financial analyst assistant. Answer the user's question based on the provided "
            "document excerpts from Vietnamese financial reports. "
            "Cite your sources using [Source N] notation. "
            "If the documents don't contain enough information, say so. "
            "Respond in the same language as the question."
        )

        # Call chat completion
        from app.services import build_openai_url
        url = build_openai_url(chat_config.base_url, "/chat/completions")
        payload = {
            "model": chat_config.model_name,
            "max_tokens": chat_config.max_tokens,
            "stream": False,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Context:\n{context}\n\nQuestion: {query}",
                },
            ],
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        answer = data["choices"][0]["message"]["content"]

        return {
            "answer": answer,
            "sources": results,
        }

    async def _embed_query(
        self, base_url: str, api_key: str, model: str, text: str
    ) -> list[float]:
        """Embed a single query text."""
        from app.services import build_openai_url
        url = build_openai_url(base_url, "/embeddings")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        is_ollama_native = "/api/embeddings" in url and "/v1/" not in url

        async with httpx.AsyncClient(timeout=30.0) as client:
            if is_ollama_native:
                resp = await client.post(
                    url, json={"model": model, "prompt": text}, headers=headers
                )
                resp.raise_for_status()
                data = resp.json()
                if "embedding" in data:
                    return data["embedding"]
                elif "embeddings" in data:
                    return data["embeddings"][0]
                raise ValueError(f"Unexpected Ollama response keys: {list(data.keys())}")

            resp = await client.post(
                url, json={"model": model, "input": [text]}, headers=headers
            )
            resp.raise_for_status()
            data = resp.json()

        if not data.get("data"):
            raise ValueError("Embedding API returned no data")
        return data["data"][0]["embedding"]

    def get_stats(self, db: Session) -> dict:
        """Get embedding coverage statistics."""
        total_docs = db.query(func.count(Document.id)).scalar() or 0

        embedded_docs = (
            db.query(func.count(func.distinct(DocumentChunk.document_id)))
            .scalar() or 0
        )

        total_chunks = db.query(func.count(DocumentChunk.id)).scalar() or 0

        by_ticker_rows = (
            db.query(Document.ticker, func.count(func.distinct(DocumentChunk.document_id)))
            .join(DocumentChunk, DocumentChunk.document_id == Document.id)
            .group_by(Document.ticker)
            .all()
        )
        by_ticker = {row[0]: row[1] for row in by_ticker_rows}

        return {
            "total_documents": total_docs,
            "embedded_documents": embedded_docs,
            "total_chunks": total_chunks,
            "by_ticker": by_ticker,
        }


knowledge_service = KnowledgeService()
