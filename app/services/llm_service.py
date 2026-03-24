import asyncio
import base64
import logging
from datetime import datetime, timezone

import httpx

from app.database import SessionLocal
from app.models import ConversionJob, Document, File, LLMConfig, MarkdownContent
from app.services.crypto_service import decrypt_api_key
from app.services.minio_service import minio_service

logger = logging.getLogger(__name__)

CONVERSION_PROMPT = (
    "Convert this financial report page to well-structured Markdown. "
    "Preserve all tables, numbers, headings, and text exactly as shown. "
    "Use proper Markdown tables with | alignment. "
    "For Vietnamese text, keep the original language. "
    "Do not add commentary or interpretation. "
    "Output only the Markdown content."
)


class LLMService:
    def __init__(self):
        self._running_jobs: dict[str, asyncio.Task] = {}

    @property
    def active_count(self) -> int:
        return len(self._running_jobs)

    def is_job_active(self, job_id: str) -> bool:
        return job_id in self._running_jobs

    def start_conversion(
        self, db, document_id: str, llm_config_id: str | None = None
    ) -> ConversionJob:
        from app.config import settings

        max_concurrent = getattr(settings, "max_concurrent_conversions", 3)
        if self.active_count >= max_concurrent:
            raise RuntimeError("Maximum concurrent conversion jobs reached")

        doc = db.query(Document).get(document_id)
        if not doc:
            raise ValueError(f"Document {document_id} not found")
        if not doc.file_id:
            raise ValueError(f"Document {document_id} has no attached file")

        # Resolve LLM config
        config = None
        if llm_config_id:
            config = db.query(LLMConfig).get(llm_config_id)
            if not config:
                raise ValueError(f"LLM config {llm_config_id} not found")
        else:
            config = (
                db.query(LLMConfig)
                .filter(LLMConfig.is_default == True, LLMConfig.config_type == "vision")
                .first()
            )
            if not config:
                raise ValueError("No default vision LLM config found. Create one in Settings.")

        job = ConversionJob(
            document_id=document_id,
            llm_config_id=config.id,
            status="pending",
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        task = asyncio.create_task(self._run_conversion(job.id))
        self._running_jobs[job.id] = task
        task.add_done_callback(lambda _: self._running_jobs.pop(job.id, None))

        return job

    async def _run_conversion(self, job_id: str):
        db = SessionLocal()
        try:
            job = db.query(ConversionJob).get(job_id)
            job.status = "running"
            job.started_at = datetime.now(timezone.utc)
            db.commit()

            doc = db.query(Document).get(job.document_id)
            config = db.query(LLMConfig).get(job.llm_config_id)
            api_key = decrypt_api_key(config.api_key_encrypted)

            # Fetch PDF from MinIO
            file_rec = db.query(File).get(doc.file_id)
            response = minio_service.get_object(file_rec.path, bucket=file_rec.bucket)
            pdf_bytes = response.read()
            response.close()
            response.release_conn()

            # Convert PDF pages to images and process with LLM
            import fitz  # PyMuPDF

            pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            job.total_pages = len(pdf_doc)
            db.commit()

            page_markdowns = []
            async with httpx.AsyncClient(timeout=120.0) as client:
                for page_num in range(len(pdf_doc)):
                    page = pdf_doc[page_num]
                    pix = page.get_pixmap(dpi=150)
                    img_bytes = pix.tobytes("jpeg", jpg_quality=85)
                    b64_img = base64.b64encode(img_bytes).decode()

                    md_text = await self._call_llm(
                        client, config.base_url, api_key, config.model_name,
                        b64_img, config.max_tokens
                    )
                    page_markdowns.append(md_text)

                    job.pages_processed = page_num + 1
                    db.commit()

            pdf_doc.close()

            # Concatenate pages with separators
            full_markdown = "\n\n---\n\n".join(page_markdowns)

            # Upsert MarkdownContent
            existing = (
                db.query(MarkdownContent)
                .filter(MarkdownContent.document_id == doc.id)
                .first()
            )
            if existing:
                existing.content = full_markdown
                existing.page_count = len(page_markdowns)
                existing.model_name = config.model_name
                existing.conversion_job_id = job.id
            else:
                mc = MarkdownContent(
                    document_id=doc.id,
                    conversion_job_id=job.id,
                    content=full_markdown,
                    page_count=len(page_markdowns),
                    model_name=config.model_name,
                )
                db.add(mc)

            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)
            db.commit()

            # Auto-embed if configured
            self._auto_embed(db, doc.id)

        except Exception as e:
            logger.exception("Conversion job %s failed", job_id)
            try:
                job = db.query(ConversionJob).get(job_id)
                if job:
                    job.status = "failed"
                    job.error_message = str(e)
                    job.completed_at = datetime.now(timezone.utc)
                    db.commit()
            except Exception:
                pass
        finally:
            db.close()

    def _auto_embed(self, db, document_id: str):
        """Trigger auto-embedding if configured."""
        from app.config import settings
        if not settings.auto_embed_after_conversion:
            return
        try:
            from app.services.embedding_service import embedding_service
            embedding_service.start_embedding(db, document_id)
            logger.info("Auto-embed triggered for document %s", document_id)
        except Exception as e:
            logger.warning("Auto-embed failed for document %s: %s", document_id, e)

    async def _call_llm(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        api_key: str,
        model: str,
        b64_image: str,
        max_tokens: int,
    ) -> str:
        """Call an OpenAI-compatible vision API with a base64 image."""
        base = base_url.rstrip("/")
        if base.endswith("/chat/completions"):
            url = base
        else:
            url = f"{base}/chat/completions"
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": CONVERSION_PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{b64_image}",
                            },
                        },
                    ],
                }
            ],
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        max_retries = 3
        for attempt in range(max_retries):
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code >= 500 and attempt < max_retries - 1:
                wait = 2 ** attempt
                logger.warning(
                    "LLM server error %s (attempt %d/%d), retrying in %ds. Body: %s",
                    resp.status_code, attempt + 1, max_retries, wait,
                    resp.text[:500],
                )
                await asyncio.sleep(wait)
                continue
            if resp.status_code >= 400:
                logger.error(
                    "LLM request failed %s. Body: %s", resp.status_code, resp.text[:500]
                )
            resp.raise_for_status()
            break

        data = resp.json()
        msg = data["choices"][0]["message"]
        content = msg.get("content") or msg.get("reasoning_content") or ""
        if not content:
            raise ValueError("LLM returned empty content")
        return content

    def cleanup_orphans(self, db):
        """Mark unfinished conversion jobs as failed (e.g., after server restart)."""
        from sqlalchemy import or_

        orphans = (
            db.query(ConversionJob)
            .filter(or_(ConversionJob.status == "pending", ConversionJob.status == "running"))
            .all()
        )
        for job in orphans:
            job.status = "failed"
            job.error_message = "Server restarted while job was running"
            job.completed_at = datetime.now(timezone.utc)
        if orphans:
            db.commit()


llm_service = LLMService()
