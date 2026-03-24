import csv
import io
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, File, MarkdownContent
from app.schemas.document import DocumentUpdate, DocumentResponse, DocumentStats
from app.schemas.markdown_content import MarkdownContentResponse
from app.services.file_stream import stream_stored_file
from app.services.minio_service import minio_service
from app.services.scrape_service import scrape_service

router = APIRouter(prefix="/documents", tags=["documents"])


def get_document_or_404(doc_id: str, db: Session) -> Document:
    doc = db.query(Document).get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


def get_document_file_or_404(doc: Document, db: Session) -> File:
    if not doc.file_id:
        raise HTTPException(404, "No file attached to this document")

    file = db.query(File).get(doc.file_id)
    if not file:
        raise HTTPException(404, "File record not found")
    return file


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    ticker: str = Query(""),
    exchange: str = Query(""),
    report_type: str = Query(""),
    report_period: str = Query(""),
    year: int | None = None,
    quarter: int | None = None,
    search: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(Document)
    if ticker:
        q = q.filter(Document.ticker.ilike(f"%{ticker}%"))
    if exchange:
        q = q.filter(Document.exchange == exchange)
    if report_type:
        q = q.filter(Document.report_type == report_type)
    if report_period:
        q = q.filter(Document.report_period == report_period)
    if year:
        q = q.filter(Document.year == year)
    if quarter:
        q = q.filter(Document.quarter == quarter)
    if search:
        q = q.filter(
            Document.report_name.ilike(f"%{search}%")
            | Document.summary.ilike(f"%{search}%")
        )

    total = q.count()
    docs = (
        q.order_by(Document.submission_date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [DocumentResponse.model_validate(d) for d in docs]


@router.get("/count")
def count_documents(
    ticker: str = Query(""),
    db: Session = Depends(get_db),
):
    q = db.query(func.count(Document.id))
    if ticker:
        q = q.filter(Document.ticker.ilike(f"%{ticker}%"))
    return {"count": q.scalar()}


@router.get("/stats", response_model=DocumentStats)
def document_stats(db: Session = Depends(get_db)):
    total_documents = db.query(func.count(Document.id)).scalar()
    total_companies = db.query(func.count(func.distinct(Document.ticker))).scalar()

    by_exchange = dict(
        db.query(Document.exchange, func.count(Document.id))
        .group_by(Document.exchange)
        .all()
    )
    by_report_type = dict(
        db.query(Document.report_type, func.count(Document.id))
        .filter(Document.report_type.isnot(None))
        .group_by(Document.report_type)
        .all()
    )
    by_year = {
        str(k): v
        for k, v in db.query(Document.year, func.count(Document.id))
        .filter(Document.year.isnot(None))
        .group_by(Document.year)
        .all()
    }

    return DocumentStats(
        total_documents=total_documents,
        total_companies=total_companies,
        by_exchange=by_exchange,
        by_report_type=by_report_type,
        by_year=by_year,
    )


@router.get("/export")
def export_documents(
    ticker: str = Query(""),
    year: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Document)
    if ticker:
        q = q.filter(Document.ticker.ilike(f"%{ticker}%"))
    if year:
        q = q.filter(Document.year == year)

    docs = q.order_by(Document.submission_date.desc()).all()

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "ticker", "exchange", "report_name", "company_name",
            "report_type", "report_period", "year", "quarter",
            "submission_date", "summary",
        ],
    )
    writer.writeheader()
    for d in docs:
        writer.writerow({
            "ticker": d.ticker,
            "exchange": d.exchange,
            "report_name": d.report_name,
            "company_name": d.company_name,
            "report_type": d.report_type,
            "report_period": d.report_period,
            "year": d.year,
            "quarter": d.quarter,
            "submission_date": str(d.submission_date) if d.submission_date else "",
            "summary": d.summary,
        })

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=documents_export.csv"},
    )


@router.post("/deduplicate")
def deduplicate_documents(db: Session = Depends(get_db)):
    """Remove duplicate documents, keeping the best record in each group."""
    result = scrape_service.deduplicate_documents(db)
    return result


@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(doc_id: str, db: Session = Depends(get_db)):
    return DocumentResponse.model_validate(get_document_or_404(doc_id, db))


@router.get("/{doc_id}/content")
def view_document(doc_id: str, db: Session = Depends(get_db)):
    doc = get_document_or_404(doc_id, db)
    file = get_document_file_or_404(doc, db)
    return stream_stored_file(file, disposition_type="inline")


@router.get("/{doc_id}/download")
def download_document(doc_id: str, db: Session = Depends(get_db)):
    doc = get_document_or_404(doc_id, db)
    file = get_document_file_or_404(doc, db)
    return stream_stored_file(file, disposition_type="attachment")


@router.get("/{doc_id}/markdown", response_model=MarkdownContentResponse)
def get_document_markdown(doc_id: str, db: Session = Depends(get_db)):
    doc = get_document_or_404(doc_id, db)
    mc = db.query(MarkdownContent).filter(MarkdownContent.document_id == doc.id).first()
    if not mc:
        raise HTTPException(404, "No markdown content for this document")
    return MarkdownContentResponse.model_validate(mc)


@router.delete("/{doc_id}/markdown")
def delete_document_markdown(doc_id: str, db: Session = Depends(get_db)):
    doc = get_document_or_404(doc_id, db)
    mc = db.query(MarkdownContent).filter(MarkdownContent.document_id == doc.id).first()
    if not mc:
        raise HTTPException(404, "No markdown content for this document")
    db.delete(mc)
    db.commit()
    return {"ok": True}


@router.put("/{doc_id}", response_model=DocumentResponse)
def update_document(doc_id: str, data: DocumentUpdate, db: Session = Depends(get_db)):
    doc = db.query(Document).get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    db.commit()
    db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.delete("/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")

    # Delete file from MinIO if exists
    if doc.file_id:
        file = db.query(File).get(doc.file_id)
        if file:
            try:
                minio_service.delete_object(file.path)
            except Exception:
                pass
            db.delete(file)

    db.delete(doc)
    db.commit()
    return {"ok": True}


@router.get("/{doc_id}/navigation")
def document_navigation(doc_id: str, db: Session = Depends(get_db)):
    doc = get_document_or_404(doc_id, db)

    newer = (
        db.query(Document.id)
        .filter(
            Document.ticker == doc.ticker,
            Document.id != doc.id,
            (Document.submission_date > doc.submission_date)
            | (
                (Document.submission_date == doc.submission_date)
                & (Document.created_at > doc.created_at)
            ),
        )
        .order_by(Document.submission_date.asc(), Document.created_at.asc())
        .first()
    )
    older = (
        db.query(Document.id)
        .filter(
            Document.ticker == doc.ticker,
            Document.id != doc.id,
            (Document.submission_date < doc.submission_date)
            | (
                (Document.submission_date == doc.submission_date)
                & (Document.created_at < doc.created_at)
            ),
        )
        .order_by(Document.submission_date.desc(), Document.created_at.desc())
        .first()
    )

    return {
        "newer_id": newer[0] if newer else None,
        "older_id": older[0] if older else None,
    }


@router.post("/batch-delete")
def batch_delete_documents(
    ids: Annotated[list[str], Body(embed=True)],
    db: Session = Depends(get_db),
):
    if not ids or len(ids) > 100:
        raise HTTPException(400, "Provide 1-100 document IDs")

    docs = db.query(Document).filter(Document.id.in_(ids)).all()
    deleted = 0
    for doc in docs:
        if doc.file_id:
            file = db.query(File).get(doc.file_id)
            if file:
                try:
                    minio_service.delete_object(file.path)
                except Exception:
                    pass
                db.delete(file)
        db.delete(doc)
        deleted += 1

    db.commit()
    return {"deleted": deleted}
