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
        self._processing_queue = False

    @property
    def active_count(self) -> int:
        return len(self._running_jobs)

    def is_job_active(self, job_id: str) -> bool:
        return job_id in self._running_jobs

    def start_conversion(
        self, db, document_id: str, llm_config_id: str | None = None, resume: bool = False
    ) -> ConversionJob:
        from app.config import settings

        doc = db.query(Document).get(document_id)
        if not doc:
            raise ValueError(f"Document {document_id} not found")
        if not doc.file_id:
            raise ValueError(f"Document {document_id} has no attached file")

        # Prevent duplicate active conversions for same document
        active = (
            db.query(ConversionJob)
            .filter(
                ConversionJob.document_id == document_id,
                ConversionJob.status.in_(["pending", "running"]),
            )
            .first()
        )
        if active:
            raise ValueError("Document already has an active conversion job")

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
            resume=resume,
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        # Start immediately if under concurrency limit, otherwise queue
        max_concurrent = settings.max_concurrent_conversions
        if self.active_count < max_concurrent:
            self._start_task(job.id, job.resume)
        else:
            logger.info(
                "Conversion job %s queued (active: %d/%d)",
                job.id, self.active_count, max_concurrent,
            )

        return job

    def _start_task(self, job_id: str, resume: bool = False):
        """Start an asyncio task for a conversion job."""
        task = asyncio.create_task(self._run_conversion(job_id, resume=resume))
        self._running_jobs[job_id] = task
        task.add_done_callback(lambda _: self._on_task_done(job_id))

    def _on_task_done(self, job_id: str):
        """Remove finished task and start next queued job."""
        self._running_jobs.pop(job_id, None)
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._process_queue())
        except RuntimeError:
            logger.warning("No running event loop in _on_task_done for job %s", job_id)

    async def _process_queue(self):
        """Start pending conversion jobs if slots are available."""
        from app.config import settings

        max_concurrent = settings.max_concurrent_conversions
        if self.active_count >= max_concurrent:
            return

        # Guard against concurrent _process_queue calls
        if self._processing_queue:
            return
        self._processing_queue = True

        db = SessionLocal()
        try:
            q = db.query(ConversionJob).filter(ConversionJob.status == "pending")
            running_ids = list(self._running_jobs.keys())
            if running_ids:
                q = q.filter(~ConversionJob.id.in_(running_ids))
            pending_jobs = (
                q.order_by(ConversionJob.created_at.asc())
                .limit(max_concurrent - self.active_count)
                .all()
            )
            for job in pending_jobs:
                if self.active_count >= max_concurrent:
                    break
                self._start_task(job.id, job.resume)
                logger.info(
                    "Dequeued conversion job %s (active: %d/%d)",
                    job.id, self.active_count, max_concurrent,
                )
        finally:
            self._processing_queue = False
            db.close()

    PAGE_SEPARATOR = "\n\n---\n\n"

    async def _run_conversion(self, job_id: str, resume: bool = False):
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

            if not pdf_bytes:
                raise ValueError(
                    f"File '{file_rec.path}' is empty (0 bytes) in MinIO. "
                    "Re-scrape the document with downloads enabled to fix."
                )

            import fitz  # PyMuPDF

            pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            job.total_pages = len(pdf_doc)
            db.commit()

            # Upsert MarkdownContent and determine start page
            mc = (
                db.query(MarkdownContent)
                .filter(MarkdownContent.document_id == doc.id)
                .first()
            )
            if mc:
                if resume and mc.content and mc.page_count > 0:
                    start_page = mc.page_count
                    logger.info(
                        "Resuming conversion for document %s from page %d/%d",
                        doc.id, start_page, len(pdf_doc),
                    )
                else:
                    # Fresh conversion — clear existing content
                    mc.content = ""
                    mc.page_count = 0
                    start_page = 0
            else:
                mc = MarkdownContent(
                    document_id=doc.id,
                    content="",
                    page_count=0,
                    model_name=config.model_name,
                    conversion_job_id=job.id,
                )
                db.add(mc)
                start_page = 0

            mc.conversion_job_id = job.id
            mc.model_name = config.model_name
            job.pages_processed = start_page
            db.commit()

            if start_page >= len(pdf_doc):
                logger.info("All pages already converted for document %s", doc.id)
                job.status = "completed"
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
                pdf_doc.close()
                self._auto_embed(db, doc.id)
                return

            # Process pages incrementally
            async with httpx.AsyncClient(timeout=120.0) as client:
                for page_num in range(start_page, len(pdf_doc)):
                    page = pdf_doc[page_num]
                    pix = page.get_pixmap(dpi=150)
                    img_bytes = pix.tobytes("jpeg", jpg_quality=85)
                    b64_img = base64.b64encode(img_bytes).decode()

                    md_text = await self._call_llm(
                        client, config.base_url, api_key, config.model_name,
                        b64_img, config.max_tokens
                    )

                    # Append incrementally
                    if mc.content:
                        mc.content = mc.content + self.PAGE_SEPARATOR + md_text
                    else:
                        mc.content = md_text

                    mc.page_count = page_num + 1
                    job.pages_processed = page_num + 1
                    db.commit()

            pdf_doc.close()

            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)
            db.commit()

            # Auto-embed only after full completion
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
        from app.services import build_openai_url
        url = build_openai_url(base_url, "/chat/completions")
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "stream": False,
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
            if (resp.status_code >= 500 or resp.status_code == 429) and attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)  # 2s, 4s, 8s
                if resp.status_code == 429:
                    retry_after = resp.headers.get("retry-after")
                    if retry_after:
                        wait = min(int(retry_after), 30)
                logger.warning(
                    "LLM request error %s (attempt %d/%d), retrying in %ds. Body: %s",
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
        """Handle unfinished conversion jobs after server restart.

        Running jobs are truly orphaned (their asyncio task is gone) so mark
        them as failed.  Pending jobs were queued and can be restarted, so
        leave them as pending and schedule queue processing.
        """
        # Running jobs lost their task — mark failed
        running = (
            db.query(ConversionJob)
            .filter(ConversionJob.status == "running")
            .all()
        )
        for job in running:
            job.status = "failed"
            job.error_message = "Server restarted while job was running"
            job.completed_at = datetime.now(timezone.utc)
        if running:
            db.commit()
            logger.info("Marked %d orphaned running jobs as failed", len(running))

        # Pending jobs stay pending — schedule queue processing to pick them up
        pending_count = (
            db.query(ConversionJob)
            .filter(ConversionJob.status == "pending")
            .count()
        )
        if pending_count:
            logger.info("Found %d pending queued jobs, will process after startup", pending_count)
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self._process_queue())
            except RuntimeError:
                logger.warning("No running event loop during cleanup_orphans — pending jobs won't auto-start")


llm_service = LLMService()
