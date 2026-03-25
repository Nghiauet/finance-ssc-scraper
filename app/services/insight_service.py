import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Company, CompanyInsight, LLMConfig
from app.services.crypto_service import decrypt_api_key
from app.services.knowledge_service import knowledge_service

logger = logging.getLogger(__name__)


class InsightService:
    def __init__(self) -> None:
        self._running_insights: dict[str, asyncio.Task] = {}

    def get_insight(self, db: Session, ticker: str) -> CompanyInsight | None:
        return db.query(CompanyInsight).filter(CompanyInsight.ticker == ticker.upper()).first()

    def generate_insight(
        self,
        db: Session,
        ticker: str,
        llm_config_id: str | None = None,
        force: bool = False,
    ) -> CompanyInsight:
        company = db.query(Company).filter(Company.symbol == ticker.upper()).first()
        if not company:
            raise ValueError(f"Company not found: {ticker}")

        insight = db.query(CompanyInsight).filter(CompanyInsight.ticker == ticker.upper()).first()

        if insight:
            if insight.status in ("pending", "running"):
                return insight
            if insight.status == "completed" and not force:
                return insight
            # force==True or status=="failed": reset
            insight.status = "pending"
            insight.error_message = None
        else:
            insight = CompanyInsight(
                company_id=company.id,
                ticker=ticker.upper(),
                status="pending",
            )
            db.add(insight)

        if llm_config_id is not None:
            insight.llm_config_id = llm_config_id

        db.commit()
        db.refresh(insight)

        task = asyncio.create_task(self._run_insight(insight.id, ticker.upper()))
        self._running_insights[insight.id] = task
        task.add_done_callback(lambda _: self._running_insights.pop(insight.id, None))

        return insight

    async def _run_insight(self, insight_id: str, ticker: str) -> None:
        db = SessionLocal()
        try:
            # Re-fetch insight to get llm_config_id set by caller
            insight = db.query(CompanyInsight).get(insight_id)
            insight.status = "running"
            db.commit()

            # Resolve chat LLM config (use caller-specified if set, else default vision)
            if insight.llm_config_id:
                chat_config = db.query(LLMConfig).get(insight.llm_config_id)
                if not chat_config:
                    raise ValueError(f"LLM config {insight.llm_config_id} not found")
            else:
                chat_config = (
                    db.query(LLMConfig)
                    .filter(LLMConfig.is_default == True, LLMConfig.config_type == "vision")
                    .first()
                )
            if not chat_config:
                raise ValueError("No default vision LLM config found. Create one in Settings.")

            # Run 4 targeted searches in parallel
            results_list = await asyncio.gather(
                knowledge_service.hybrid_search(
                    db,
                    "doanh thu lợi nhuận kết quả kinh doanh tăng trưởng",
                    ticker=ticker,
                    limit=10,
                ),
                knowledge_service.hybrid_search(
                    db,
                    "tổng tài sản vốn chủ sở hữu nợ vay cân đối kế toán",
                    ticker=ticker,
                    limit=10,
                ),
                knowledge_service.hybrid_search(
                    db,
                    "điểm mạnh rủi ro cơ hội thách thức cạnh tranh",
                    ticker=ticker,
                    limit=10,
                ),
                knowledge_service.hybrid_search(
                    db,
                    "sự kiện chiến lược kế hoạch dự án quan trọng",
                    ticker=ticker,
                    limit=10,
                ),
            )

            # Deduplicate by chunk_text, keep top 35 by score
            seen_texts: set[str] = set()
            all_chunks = []
            for results in results_list:
                for chunk in results:
                    if chunk["chunk_text"] not in seen_texts:
                        seen_texts.add(chunk["chunk_text"])
                        all_chunks.append(chunk)

            all_chunks.sort(key=lambda x: x["score"], reverse=True)
            all_chunks = all_chunks[:35]

            if not all_chunks:
                raise ValueError(
                    f"No embedded documents found for ticker {ticker}. "
                    "Please convert and embed reports first."
                )

            # Build numbered context
            context_parts = []
            for i, chunk in enumerate(all_chunks, 1):
                source = f"[{i}] {chunk['ticker']} - {chunk['report_name']}"
                if chunk.get("section_heading"):
                    source += f" > {chunk['section_heading']}"
                context_parts.append(f"{source}\n{chunk['chunk_text']}")
            context = "\n\n---\n\n".join(context_parts)

            # Call LLM
            api_key = decrypt_api_key(chat_config.api_key_encrypted)
            from app.services import build_openai_url
            url = build_openai_url(chat_config.base_url, "/chat/completions")

            system_prompt = (
                "Bạn là chuyên gia phân tích tài chính Việt Nam. Dựa trên các đoạn trích từ báo cáo tài chính "
                f"của công ty {ticker}, hãy viết phân tích ngắn gọn, dễ hiểu bằng tiếng Việt.\n\n"
                "Xác định 4–6 khía cạnh quan trọng và phù hợp nhất với loại hình doanh nghiệp này "
                "(ví dụ: ngân hàng, sản xuất, bán lẻ, bất động sản...). Tự do đặt tên mục.\n"
                "Mỗi mục: tiêu đề ngắn (3–6 từ) + nội dung 2–3 câu, ngôn ngữ đơn giản.\n\n"
                "Trả về JSON hợp lệ (không có markdown code fence):\n"
                '{"sections": [{"title": "...", "content": "..."}, ...]}'
            )

            payload = {
                "model": chat_config.model_name,
                "max_tokens": chat_config.max_tokens,
                "stream": False,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": f"Ngữ cảnh:\n{context}\n\nHãy phân tích công ty {ticker}.",
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

            raw_answer = data["choices"][0]["message"]["content"]

            # Parse JSON — strip markdown code fences if present
            cleaned = raw_answer.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                lines = lines[1:]  # drop opening ```
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]  # drop closing ```
                cleaned = "\n".join(lines).strip()

            parsed = json.loads(cleaned)
            if "sections" not in parsed or not isinstance(parsed["sections"], list):
                raise ValueError("LLM returned invalid JSON structure: missing 'sections' list")

            insight.content = parsed
            insight.status = "completed"
            insight.generated_at = datetime.now(timezone.utc)
            db.commit()

        except Exception as e:
            logger.exception("Insight job %s failed", insight_id)
            try:
                insight = db.query(CompanyInsight).get(insight_id)
                if insight:
                    insight.status = "failed"
                    insight.error_message = str(e)
                    db.commit()
            except Exception:
                pass
        finally:
            db.close()

    def cleanup_orphans(self, db) -> None:
        from sqlalchemy import or_

        orphans = (
            db.query(CompanyInsight)
            .filter(
                or_(
                    CompanyInsight.status == "pending",
                    CompanyInsight.status == "running",
                )
            )
            .all()
        )
        for insight in orphans:
            insight.status = "failed"
            insight.error_message = "Server restarted while job was running"
        if orphans:
            db.commit()


insight_service = InsightService()
