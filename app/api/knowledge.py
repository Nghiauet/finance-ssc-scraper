from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import EmbeddingJob
from app.schemas.knowledge import (
    EmbedRequest,
    EmbeddingJobResponse,
    KnowledgeAskRequest,
    KnowledgeAskResponse,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    KnowledgeSearchResult,
    KnowledgeStats,
)
from app.services.embedding_service import embedding_service
from app.services.knowledge_service import knowledge_service

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.post("/search", response_model=KnowledgeSearchResponse)
async def search(data: KnowledgeSearchRequest, db: Session = Depends(get_db)):
    try:
        results = await knowledge_service.hybrid_search(
            db,
            data.query,
            ticker=data.ticker,
            year=data.year,
            report_type=data.report_type,
            report_period=data.report_period,
            limit=data.limit,
        )
        return KnowledgeSearchResponse(
            results=[KnowledgeSearchResult(**r) for r in results],
            total_results=len(results),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/ask", response_model=KnowledgeAskResponse)
async def ask(data: KnowledgeAskRequest, db: Session = Depends(get_db)):
    try:
        result = await knowledge_service.ask(
            db,
            data.query,
            ticker=data.ticker,
            year=data.year,
            report_type=data.report_type,
            report_period=data.report_period,
            llm_config_id=data.llm_config_id,
        )
        return KnowledgeAskResponse(
            answer=result["answer"],
            sources=[KnowledgeSearchResult(**s) for s in result["sources"]],
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/stats", response_model=KnowledgeStats)
def stats(db: Session = Depends(get_db)):
    return knowledge_service.get_stats(db)


@router.post("/embed", response_model=list[EmbeddingJobResponse])
async def embed_documents(data: EmbedRequest, db: Session = Depends(get_db)):
    if not data.document_ids or len(data.document_ids) > 50:
        raise HTTPException(400, "Provide 1-50 document IDs")

    jobs = []
    errors = []
    for doc_id in data.document_ids:
        try:
            job = embedding_service.start_embedding(db, doc_id)
            jobs.append(EmbeddingJobResponse.model_validate(job))
        except (RuntimeError, ValueError) as e:
            errors.append(str(e))

    if not jobs and errors:
        raise HTTPException(422, detail={"message": "No documents could be embedded", "errors": errors})
    return jobs


@router.post("/embed-all")
async def embed_all(
    force: bool = Query(False, description="Re-embed all documents, even already embedded ones"),
    db: Session = Depends(get_db),
):
    """Trigger embedding for documents that have markdown content."""
    from app.models import Document, DocumentChunk, MarkdownContent

    if force:
        # Delete all existing chunks and re-embed everything
        db.query(DocumentChunk).delete()
        db.commit()
        docs_with_md = db.query(MarkdownContent.document_id).all()
    else:
        # Only embed documents without chunks
        docs_with_md = (
            db.query(MarkdownContent.document_id)
            .outerjoin(
                DocumentChunk,
                DocumentChunk.document_id == MarkdownContent.document_id,
            )
            .filter(DocumentChunk.id.is_(None))
            .all()
        )

    doc_ids = [row[0] for row in docs_with_md]
    if not doc_ids:
        return {"message": "All converted documents are already embedded", "started": 0}

    jobs = []
    for doc_id in doc_ids[:50]:  # Limit to 50 at a time
        try:
            job = embedding_service.start_embedding(db, doc_id)
            jobs.append(job.id)
        except (RuntimeError, ValueError):
            break
    return {"message": f"Started {len(jobs)} embedding jobs", "started": len(jobs)}


@router.get("/embed-jobs", response_model=list[EmbeddingJobResponse])
def list_embed_jobs(
    status: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(EmbeddingJob)
    if status:
        q = q.filter(EmbeddingJob.status == status)
    jobs = (
        q.order_by(EmbeddingJob.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    results = []
    for j in jobs:
        resp = EmbeddingJobResponse.model_validate(j)
        if j.document:
            resp.document_ticker = j.document.ticker
            resp.document_report_name = j.document.report_name
        results.append(resp)
    return results
