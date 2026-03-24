from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ConversionJob
from app.schemas.conversion_job import (
    BatchConversionCreate,
    ConversionJobCreate,
    ConversionJobResponse,
)
from app.services.llm_service import llm_service

router = APIRouter(prefix="/conversions", tags=["conversions"])


@router.get("", response_model=list[ConversionJobResponse])
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
    jobs = (
        q.order_by(ConversionJob.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [ConversionJobResponse.model_validate(j) for j in jobs]


@router.post("", response_model=ConversionJobResponse, status_code=201)
async def create_conversion(data: ConversionJobCreate, db: Session = Depends(get_db)):
    try:
        job = llm_service.start_conversion(db, data.document_id, data.llm_config_id)
        return ConversionJobResponse.model_validate(job)
    except RuntimeError as e:
        raise HTTPException(429, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/batch", response_model=list[ConversionJobResponse], status_code=201)
async def create_batch_conversion(data: BatchConversionCreate, db: Session = Depends(get_db)):
    if not data.document_ids or len(data.document_ids) > 50:
        raise HTTPException(400, "Provide 1-50 document IDs")

    jobs = []
    errors = []
    for doc_id in data.document_ids:
        try:
            job = llm_service.start_conversion(db, doc_id, data.llm_config_id)
            jobs.append(ConversionJobResponse.model_validate(job))
        except (RuntimeError, ValueError) as e:
            errors.append({"document_id": doc_id, "error": str(e)})
            if isinstance(e, RuntimeError):
                break  # Max concurrent reached, stop trying

    return jobs


@router.get("/{job_id}", response_model=ConversionJobResponse)
def get_conversion(job_id: str, db: Session = Depends(get_db)):
    job = db.query(ConversionJob).get(job_id)
    if not job:
        raise HTTPException(404, "Conversion job not found")
    return ConversionJobResponse.model_validate(job)


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
