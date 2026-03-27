from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ConversionJob, Document, MarkdownContent
from app.schemas.conversion_job import (
    BatchConversionCreate,
    BatchConversionError,
    BatchRetryRequest,
    ConversionJobCreate,
    ConversionJobResponse,
    FilterBatchConversionCreate,
)
from app.services.llm_service import llm_service

router = APIRouter(prefix="/conversions", tags=["conversions"])


def _apply_doc_filters(q, *, tickers=None, ticker=None, exchange=None, report_type=None, report_period=None, year=None, year_from=None, year_to=None, quarter=None):
    if tickers:
        q = q.filter(Document.ticker.in_(tickers))
    elif ticker:
        q = q.filter(Document.ticker.ilike(f"%{ticker}%"))
    if exchange:
        q = q.filter(Document.exchange == exchange)
    if report_type:
        q = q.filter(Document.report_type == report_type)
    if report_period:
        q = q.filter(Document.report_period == report_period)
    if year_from:
        q = q.filter(Document.year >= year_from)
    if year_to:
        q = q.filter(Document.year <= year_to)
    elif year:
        q = q.filter(Document.year == year)
    if quarter:
        q = q.filter(Document.quarter == quarter)
    return q


def _enrich_job_response(job: ConversionJob) -> ConversionJobResponse:
    """Build a ConversionJobResponse with enriched document fields."""
    resp = ConversionJobResponse.model_validate(job)
    if job.document:
        resp.document_ticker = job.document.ticker
        resp.document_report_name = job.document.report_name
        resp.document_exchange = job.document.exchange
        resp.document_report_type = job.document.report_type
        resp.document_report_period = job.document.report_period
        resp.document_year = job.document.year
        resp.document_quarter = job.document.quarter
        resp.document_company_name = job.document.company_name
    return resp


@router.get("")
def list_conversions(
    status: str = Query(""),
    document_id: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(ConversionJob)
    if status:
        q = q.filter(ConversionJob.status == status)
    if document_id:
        q = q.filter(ConversionJob.document_id == document_id)

    total = q.count()

    jobs = (
        q.order_by(ConversionJob.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    results = [_enrich_job_response(j) for j in jobs]
    return {"jobs": results, "total": total}


@router.post("", response_model=ConversionJobResponse, status_code=201)
async def create_conversion(data: ConversionJobCreate, db: Session = Depends(get_db)):
    try:
        job = llm_service.start_conversion(db, data.document_id, data.llm_config_id, resume=data.resume)
        return _enrich_job_response(job)
    except RuntimeError as e:
        raise HTTPException(429, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/batch", status_code=201)
async def create_batch_conversion(data: BatchConversionCreate, db: Session = Depends(get_db)):
    if not data.document_ids or len(data.document_ids) > 50:
        raise HTTPException(400, "Provide 1-50 document IDs")

    jobs = []
    errors = []
    for doc_id in data.document_ids:
        try:
            job = llm_service.start_conversion(db, doc_id, data.llm_config_id)
            jobs.append(_enrich_job_response(job))
        except (RuntimeError, ValueError) as e:
            doc = db.query(Document).get(doc_id)
            errors.append(BatchConversionError(
                document_id=doc_id,
                ticker=doc.ticker if doc else None,
                report_name=doc.report_name if doc else None,
                error=str(e),
            ).model_dump())
            if isinstance(e, RuntimeError):
                break  # Max concurrent reached, stop trying

    return {"jobs": jobs, "errors": errors}


@router.post("/batch-by-filter", status_code=201)
async def create_batch_conversion_by_filter(
    data: FilterBatchConversionCreate, db: Session = Depends(get_db)
):
    """Convert all unconverted documents matching filters."""
    # Build query for documents that have a file but no markdown content
    q = (
        db.query(Document)
        .filter(Document.file_id.isnot(None))
        .outerjoin(MarkdownContent, MarkdownContent.document_id == Document.id)
        .filter(MarkdownContent.id.is_(None))
    )
    # Exclude documents with active conversion jobs
    active_job_doc_ids = (
        db.query(ConversionJob.document_id)
        .filter(ConversionJob.status.in_(["pending", "running"]))
        .subquery()
    )
    q = q.filter(~Document.id.in_(db.query(active_job_doc_ids.c.document_id)))

    q = _apply_doc_filters(
        q,
        tickers=data.tickers,
        ticker=data.ticker,
        exchange=data.exchange,
        report_type=data.report_type,
        report_period=data.report_period,
        year=data.year,
        year_from=data.year_from,
        year_to=data.year_to,
        quarter=data.quarter,
    )

    docs = q.all()
    if not docs:
        return {"jobs_created": 0, "total_matching": 0, "jobs": [], "errors": []}

    jobs = []
    errors = []
    for doc in docs:
        try:
            job = llm_service.start_conversion(db, doc.id, data.llm_config_id)
            jobs.append(_enrich_job_response(job))
        except (RuntimeError, ValueError) as e:
            errors.append(BatchConversionError(
                document_id=doc.id,
                ticker=doc.ticker,
                report_name=doc.report_name,
                error=str(e),
            ).model_dump())
            if isinstance(e, RuntimeError):
                break  # Max concurrent reached

    return {
        "jobs_created": len(jobs),
        "total_matching": len(docs),
        "jobs": jobs,
        "errors": errors,
    }


@router.get("/preview-count")
def get_preview_count(
    tickers: list[str] = Query(default=[]),
    ticker: str = Query(""),
    exchange: str = Query(""),
    report_type: str = Query(""),
    report_period: str = Query(""),
    year_from: int = Query(None),
    year_to: int = Query(None),
    db: Session = Depends(get_db),
):
    """Count unconverted and already-converted documents matching filters."""
    active_job_doc_ids = (
        db.query(ConversionJob.document_id)
        .filter(ConversionJob.status.in_(["pending", "running"]))
        .subquery()
    )
    base_q = db.query(Document).filter(Document.file_id.isnot(None))
    base_q = _apply_doc_filters(
        base_q,
        tickers=tickers or None,
        ticker=ticker or None,
        exchange=exchange or None,
        report_type=report_type or None,
        report_period=report_period or None,
        year_from=year_from,
        year_to=year_to,
    )

    unconverted = (
        base_q.outerjoin(MarkdownContent, MarkdownContent.document_id == Document.id)
        .filter(MarkdownContent.id.is_(None))
        .filter(~Document.id.in_(db.query(active_job_doc_ids.c.document_id)))
        .with_entities(func.count(Document.id))
        .scalar()
    )
    already_converted = (
        base_q.join(MarkdownContent, MarkdownContent.document_id == Document.id)
        .with_entities(func.count(Document.id))
        .scalar()
    )
    return {"unconverted": unconverted, "already_converted": already_converted}


@router.get("/status-counts")
def conversion_status_counts(db: Session = Depends(get_db)):
    """Return job counts by status for tab badges."""
    rows = (
        db.query(ConversionJob.status, func.count(ConversionJob.id))
        .group_by(ConversionJob.status)
        .all()
    )
    counts = {row[0]: row[1] for row in rows}
    return {
        "all": sum(counts.values()),
        "pending": counts.get("pending", 0),
        "running": counts.get("running", 0),
        "completed": counts.get("completed", 0),
        "failed": counts.get("failed", 0),
        "active": counts.get("pending", 0) + counts.get("running", 0),
    }


@router.get("/stats")
def conversion_stats(db: Session = Depends(get_db)):
    """Per-ticker conversion coverage statistics."""
    total_documents = (
        db.query(func.count(Document.id))
        .filter(Document.file_id.isnot(None))
        .scalar()
    )
    converted_documents = db.query(func.count(MarkdownContent.id)).scalar()

    job_counts = dict(
        db.query(ConversionJob.status, func.count(ConversionJob.id))
        .group_by(ConversionJob.status)
        .all()
    )

    # Per-ticker breakdown
    converted_subq = db.query(MarkdownContent.document_id).subquery()

    ticker_stats = (
        db.query(
            Document.ticker,
            Document.company_name,
            func.count(Document.id).label("total"),
            func.count(converted_subq.c.document_id).label("converted"),
        )
        .filter(Document.file_id.isnot(None))
        .outerjoin(converted_subq, converted_subq.c.document_id == Document.id)
        .group_by(Document.ticker, Document.company_name)
        .order_by(func.count(Document.id).desc())
        .all()
    )

    by_ticker = [
        {
            "ticker": row[0],
            "company_name": row[1],
            "total_documents": row[2],
            "converted": row[3],
            "unconverted": row[2] - row[3],
        }
        for row in ticker_stats
    ]

    return {
        "total_documents": total_documents,
        "converted_documents": converted_documents,
        "unconverted_documents": total_documents - converted_documents,
        "active_jobs": job_counts.get("pending", 0) + job_counts.get("running", 0),
        "completed_jobs": job_counts.get("completed", 0),
        "failed_jobs": job_counts.get("failed", 0),
        "by_ticker": by_ticker,
    }


@router.get("/converted-documents")
def list_converted_documents(
    ticker: str = Query(""),
    report_type: str = Query(""),
    year: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List documents that have converted markdown content."""
    q = (
        db.query(Document, MarkdownContent)
        .join(MarkdownContent, MarkdownContent.document_id == Document.id)
    )
    if ticker:
        q = q.filter(Document.ticker.ilike(f"%{ticker}%"))
    if report_type:
        q = q.filter(Document.report_type == report_type)
    if year:
        q = q.filter(Document.year == year)

    total = q.count()
    rows = (
        q.order_by(MarkdownContent.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    documents = []
    for doc, mc in rows:
        documents.append({
            "document_id": doc.id,
            "ticker": doc.ticker,
            "exchange": doc.exchange,
            "report_name": doc.report_name,
            "report_type": doc.report_type,
            "report_period": doc.report_period,
            "year": doc.year,
            "quarter": doc.quarter,
            "company_name": doc.company_name,
            "page_count": mc.page_count,
            "model_name": mc.model_name,
            "converted_at": mc.created_at.isoformat() if mc.created_at else None,
            "markdown_id": mc.id,
        })

    return {"documents": documents, "total": total}


@router.post("/batch-retry", status_code=201)
async def batch_retry_conversions(
    data: BatchRetryRequest,
    resume: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Retry multiple failed conversion jobs."""
    q = db.query(ConversionJob).filter(ConversionJob.status == "failed")
    if data.job_ids:
        q = q.filter(ConversionJob.id.in_(data.job_ids))

    failed_jobs = q.all()
    new_jobs = []
    errors = []
    for old_job in failed_jobs:
        try:
            new_job = llm_service.start_conversion(
                db, old_job.document_id, old_job.llm_config_id, resume=resume
            )
            new_jobs.append(_enrich_job_response(new_job))
        except (RuntimeError, ValueError) as e:
            errors.append(BatchConversionError(
                document_id=old_job.document_id,
                ticker=old_job.document.ticker if old_job.document else None,
                report_name=old_job.document.report_name if old_job.document else None,
                error=str(e),
            ).model_dump())
            if isinstance(e, RuntimeError):
                break

    return {"jobs": new_jobs, "errors": errors}


@router.get("/{job_id}", response_model=ConversionJobResponse)
def get_conversion(job_id: str, db: Session = Depends(get_db)):
    job = db.query(ConversionJob).get(job_id)
    if not job:
        raise HTTPException(404, "Conversion job not found")
    return _enrich_job_response(job)


@router.post("/{job_id}/retry", response_model=ConversionJobResponse, status_code=201)
async def retry_conversion(
    job_id: str,
    resume: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Retry a failed or completed conversion job by creating a new one for the same document."""
    old_job = db.query(ConversionJob).get(job_id)
    if not old_job:
        raise HTTPException(404, "Conversion job not found")
    if old_job.status not in ("failed", "completed"):
        raise HTTPException(400, "Can only retry failed or completed jobs")

    try:
        new_job = llm_service.start_conversion(
            db, old_job.document_id, old_job.llm_config_id, resume=resume
        )
        return _enrich_job_response(new_job)
    except RuntimeError as e:
        raise HTTPException(429, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/{job_id}")
def delete_conversion(job_id: str, db: Session = Depends(get_db)):
    job = db.query(ConversionJob).get(job_id)
    if not job:
        raise HTTPException(404, "Conversion job not found")
    if llm_service.is_job_active(job_id):
        raise HTTPException(400, "Cannot delete an active job")
    db.delete(job)
    db.commit()
    return {"ok": True}
