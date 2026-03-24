import asyncio
import logging
from datetime import datetime, timezone

import httpx

from app.database import SessionLocal
from app.models import Document, DocumentChunk, EmbeddingJob, LLMConfig, MarkdownContent
from app.services.chunking_service import chunk_markdown
from app.services.crypto_service import decrypt_api_key

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self):
        self._running_jobs: dict[str, asyncio.Task] = {}

    @property
    def active_count(self) -> int:
        return len(self._running_jobs)

    def start_embedding(
        self, db, document_id: str, llm_config_id: str | None = None
    ) -> EmbeddingJob:
        """Start embedding a document's markdown chunks."""
        doc = db.query(Document).get(document_id)
        if not doc:
            raise ValueError(f"Document {document_id} not found")

        mc = (
            db.query(MarkdownContent)
            .filter(MarkdownContent.document_id == document_id)
            .first()
        )
        if not mc:
            raise ValueError(f"Document {document_id} has no markdown content")

        # Resolve embedding config
        config = None
        if llm_config_id:
            config = db.query(LLMConfig).get(llm_config_id)
        else:
            config = (
                db.query(LLMConfig)
                .filter(LLMConfig.is_default == True, LLMConfig.config_type == "embedding")
                .first()
            )
        if not config:
            raise ValueError("No embedding LLM config found. Create one in Settings.")

        job = EmbeddingJob(
            document_id=document_id,
            llm_config_id=config.id,
            status="pending",
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        task = asyncio.create_task(self._run_embedding(job.id))
        self._running_jobs[job.id] = task
        task.add_done_callback(lambda _: self._running_jobs.pop(job.id, None))

        return job

    async def _run_embedding(self, job_id: str):
        db = SessionLocal()
        try:
            job = db.query(EmbeddingJob).get(job_id)
            job.status = "running"
            job.started_at = datetime.now(timezone.utc)
            db.commit()

            doc = db.query(Document).get(job.document_id)
            config = db.query(LLMConfig).get(job.llm_config_id)
            api_key = decrypt_api_key(config.api_key_encrypted)

            mc = (
                db.query(MarkdownContent)
                .filter(MarkdownContent.document_id == doc.id)
                .first()
            )

            # Chunk the markdown
            chunks = chunk_markdown(mc.content)
            job.total_chunks = len(chunks)
            db.commit()

            # Delete existing chunks for this document
            db.query(DocumentChunk).filter(
                DocumentChunk.document_id == doc.id
            ).delete()
            db.commit()

            # Batch embed chunks
            batch_size = 20
            all_chunk_records = []

            async with httpx.AsyncClient(timeout=60.0) as client:
                for i in range(0, len(chunks), batch_size):
                    batch = chunks[i : i + batch_size]
                    texts = [c["text"] for c in batch]

                    embeddings = await self._call_embedding_api(
                        client, config.base_url, api_key, config.model_name, texts
                    )

                    for j, (chunk_data, embedding) in enumerate(zip(batch, embeddings)):
                        chunk_rec = DocumentChunk(
                            document_id=doc.id,
                            markdown_content_id=mc.id,
                            chunk_index=chunk_data["index"],
                            chunk_text=chunk_data["text"],
                            chunk_heading=chunk_data["heading"],
                            token_count=chunk_data["token_count"],
                        )
                        db.add(chunk_rec)
                        db.flush()

                        # Store embedding using raw SQL (pgvector)
                        from sqlalchemy import text as sql_text
                        embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
                        db.execute(
                            sql_text(
                                "UPDATE document_chunks SET embedding = :emb::vector WHERE id = :id"
                            ),
                            {"emb": embedding_str, "id": chunk_rec.id},
                        )
                        all_chunk_records.append(chunk_rec)

                    job.chunks_processed = min(i + batch_size, len(chunks))
                    db.commit()

            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)
            db.commit()

        except Exception as e:
            logger.exception("Embedding job %s failed", job_id)
            try:
                job = db.query(EmbeddingJob).get(job_id)
                if job:
                    job.status = "failed"
                    job.error_message = str(e)
                    job.completed_at = datetime.now(timezone.utc)
                    db.commit()
            except Exception:
                pass
        finally:
            db.close()

    async def _call_embedding_api(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        api_key: str,
        model: str,
        texts: list[str],
    ) -> list[list[float]]:
        """Call OpenAI-compatible embedding API."""
        base = base_url.rstrip("/")
        url = base if base.endswith("/embeddings") else f"{base}/embeddings"
        payload = {
            "model": model,
            "input": texts,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

        # Sort by index to maintain order
        sorted_data = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in sorted_data]

    def cleanup_orphans(self, db):
        """Mark unfinished embedding jobs as failed."""
        from sqlalchemy import or_

        orphans = (
            db.query(EmbeddingJob)
            .filter(or_(EmbeddingJob.status == "pending", EmbeddingJob.status == "running"))
            .all()
        )
        for job in orphans:
            job.status = "failed"
            job.error_message = "Server restarted while job was running"
            job.completed_at = datetime.now(timezone.utc)
        if orphans:
            db.commit()


embedding_service = EmbeddingService()
