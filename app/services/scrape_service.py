import asyncio
import os
import re
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Company, Document, File, ScrapeJob
from app.schemas.scrape_job import ScrapeJobCreate
from app.services.minio_service import minio_service


def normalize_report_name(report_name: str | None) -> str:
    return " ".join((report_name or "").split()).casefold()


def parse_report_classification(report_name: str) -> tuple[str | None, str | None]:
    """Parse report type and period from Vietnamese report name."""
    name = report_name.lower()
    report_type = None
    report_period = None

    if "hợp nhất" in name:
        report_type = "hop_nhat"
    elif "riêng" in name:
        report_type = "rieng"
    elif "mẹ" in name or "me" in name:
        report_type = "me"
    elif "tổng hợp" in name:
        report_type = "tong_hop"

    if "năm" in name or "- năm" in name:
        report_period = "nam"
    elif "bán niên" in name:
        report_period = "ban_nien"
    elif "quý" in name or "- quý" in name:
        report_period = "quy"

    return report_type, report_period


def parse_year_quarter(summary: str) -> tuple[int | None, int | None]:
    """Extract year and quarter from summary text."""
    year = None
    quarter = None

    year_match = re.search(r"20[12]\d", summary)
    if year_match:
        year = int(year_match.group())

    quarter_match = re.search(r"[Qq](\d)", summary)
    if quarter_match:
        quarter = int(quarter_match.group(1))

    return year, quarter


def parse_date(date_str: str):
    """Parse dd/mm/yyyy to date object."""
    try:
        return datetime.strptime(date_str.strip(), "%d/%m/%Y").date()
    except (ValueError, TypeError):
        return None


class ScrapeService:
    def __init__(self):
        self._running_jobs: dict[str, asyncio.Task] = {}

    @property
    def active_count(self) -> int:
        return len(self._running_jobs)

    def start_job(self, db: Session, params: ScrapeJobCreate) -> ScrapeJob:
        from app.config import settings
        if self.active_count >= settings.max_concurrent_scrapes:
            raise RuntimeError("Maximum concurrent scrape jobs reached")

        job = ScrapeJob(
            status="pending",
            ticker=params.ticker,
            from_date=params.from_date,
            to_date=params.to_date,
            max_pages=params.max_pages,
            download_files=params.download_files,
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        task = asyncio.create_task(self._run_scrape(job.id, params))
        self._running_jobs[job.id] = task
        task.add_done_callback(lambda _: self._running_jobs.pop(job.id, None))

        return job

    async def _run_scrape(self, job_id: str, params: ScrapeJobCreate):
        from scrape_ssc import SSCScraper

        db = SessionLocal()
        tmp_dir = tempfile.mkdtemp(prefix=f"scrape_{job_id}_")

        try:
            job = db.query(ScrapeJob).get(job_id)
            job.status = "running"
            job.started_at = datetime.now(timezone.utc)
            db.commit()

            max_pages = params.max_pages if params.max_pages and params.max_pages > 0 else None

            pages_scraped = 0

            def on_page(page_num, rows):
                nonlocal pages_scraped
                pages_scraped = page_num
                job.total_pages_scraped = page_num
                db.commit()

            from app.config import settings as app_settings
            async with SSCScraper(headless=app_settings.scrape_headless) as scraper:
                result = await scraper.scrape(
                    ticker=params.ticker or None,
                    from_date=params.from_date or None,
                    to_date=params.to_date or None,
                    max_pages=max_pages,
                    download_all=params.download_files,
                    downloads_dir=tmp_dir,
                    on_page=on_page,
                )

            self._process_results(db, job, result, tmp_dir)

            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)
            job.total_reports_found = len(result.reports)
            job.total_files_downloaded = len(result.downloaded_files)
            job.total_pages_scraped = pages_scraped
            db.commit()

        except Exception as e:
            job = db.query(ScrapeJob).get(job_id)
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
        finally:
            db.close()
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def _process_results(self, db: Session, job: ScrapeJob, result, tmp_dir: str):
        # Build a map of downloaded files by ticker+report for matching
        dl_map: dict[str, dict] = {}
        for dl in result.downloaded_files:
            key = f"{dl.get('ticker', '')}|{dl.get('report', '')}"
            dl_map[key] = dl

        company_cache: dict[str, Company] = {}
        for report in result.reports:
            ticker = report.get("ticker", "")
            # Upsert company (cached to avoid repeated queries for same ticker)
            company = company_cache.get(ticker)
            if not company:
                company = db.query(Company).filter_by(symbol=ticker).first()
            if not company:
                company = Company(
                    symbol=ticker,
                    name=report.get("company", ticker),
                    exchange=report.get("exchange"),
                )
                db.add(company)
                db.flush()
            company_cache[ticker] = company

            report_type, report_period = parse_report_classification(report.get("report_name", ""))
            year, quarter = parse_year_quarter(report.get("summary", ""))
            sub_date = parse_date(report.get("submission_date", ""))

            doc = self._find_existing_document(
                db,
                ticker=ticker,
                report_name=report.get("report_name", ""),
                submission_date=sub_date,
            )
            if not doc:
                doc = Document(
                    ticker=ticker,
                    report_name=report.get("report_name", ""),
                    submission_date=sub_date,
                )
                db.add(doc)
                db.flush()

            doc.company_id = company.id
            doc.scrape_job_id = job.id
            doc.exchange = report.get("exchange")
            doc.report_name = report.get("report_name", "")
            doc.company_name = report.get("company")
            doc.summary = report.get("summary")
            doc.submission_date = sub_date
            doc.ssc_download_url = report.get("download_url")
            doc.report_type = report_type
            doc.report_period = report_period
            doc.year = year
            doc.quarter = quarter

            # Link downloaded file if available
            dl_key = f"{ticker}|{report.get('report_name', '')}"
            dl_info = dl_map.get(dl_key)
            if dl_info and dl_info.get("file"):
                file_path = dl_info["file"]
                try:
                    self._upsert_document_file(db, doc, ticker, file_path)
                except FileNotFoundError:
                    pass

        db.commit()

    def _find_existing_document(
        self,
        db: Session,
        *,
        ticker: str,
        report_name: str,
        submission_date,
    ) -> Document | None:
        normalized_name = normalize_report_name(report_name)

        query = db.query(Document).filter(Document.ticker == ticker)
        if submission_date is not None:
            query = query.filter(Document.submission_date == submission_date)

        candidates = query.order_by(Document.created_at.asc()).all()
        if submission_date is None and not candidates:
            candidates = (
                db.query(Document)
                .filter(Document.ticker == ticker)
                .order_by(Document.created_at.asc())
                .all()
            )

        for doc in candidates:
            if normalize_report_name(doc.report_name) == normalized_name:
                return doc
        return None

    def _upsert_document_file(self, db: Session, doc: Document, ticker: str, file_path: str) -> None:
        filename = Path(file_path).name
        object_name = f"{ticker}/{filename}"
        content_type = minio_service.get_content_type(filename)
        file_size = os.path.getsize(file_path)

        minio_service.upload_file(object_name, file_path, content_type)

        file_rec = db.query(File).get(doc.file_id) if doc.file_id else None
        if not file_rec:
            file_rec = File(
                name=filename,
                path=object_name,
                bucket=minio_service.bucket,
                content_type=content_type,
                size_bytes=file_size,
            )
            db.add(file_rec)
            db.flush()
            doc.file_id = file_rec.id
            return

        old_path = file_rec.path
        old_bucket = file_rec.bucket
        file_rec.name = filename
        file_rec.path = object_name
        file_rec.bucket = minio_service.bucket
        file_rec.content_type = content_type
        file_rec.size_bytes = file_size

        if old_path != object_name or old_bucket != minio_service.bucket:
            try:
                minio_service.client.remove_object(old_bucket, old_path)
            except Exception:
                pass

    def cleanup_orphans(self, db: Session):
        """Mark any 'running' jobs as failed on startup."""
        orphans = db.query(ScrapeJob).filter_by(status="running").all()
        for job in orphans:
            job.status = "failed"
            job.error_message = "Server restarted while job was running"
            job.completed_at = datetime.now(timezone.utc)
        if orphans:
            db.commit()


scrape_service = ScrapeService()
