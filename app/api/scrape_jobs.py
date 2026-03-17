from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import ScrapeJob
from app.schemas.scrape_job import ScrapeJobCreate, ScrapeJobResponse
from app.services.scrape_service import scrape_service

router = APIRouter(prefix="/scrape-jobs", tags=["scrape-jobs"])


@router.get("", response_model=list[ScrapeJobResponse])
def list_jobs(
    status: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(ScrapeJob)
    if status:
        q = q.filter(ScrapeJob.status == status)
    jobs = (
        q.order_by(ScrapeJob.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [ScrapeJobResponse.model_validate(j) for j in jobs]


@router.get("/count")
def count_jobs(db: Session = Depends(get_db)):
    return {"count": db.query(func.count(ScrapeJob.id)).scalar()}


@router.post("", response_model=ScrapeJobResponse, status_code=201)
async def create_job(data: ScrapeJobCreate, db: Session = Depends(get_db)):
    try:
        job = scrape_service.start_job(db, data)
        return ScrapeJobResponse.model_validate(job)
    except RuntimeError as e:
        raise HTTPException(429, str(e))


@router.get("/{job_id}", response_model=ScrapeJobResponse)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(ScrapeJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return ScrapeJobResponse.model_validate(job)


@router.delete("/{job_id}")
def delete_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(ScrapeJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status == "running":
        raise HTTPException(400, "Cannot delete a running job")
    db.delete(job)
    db.commit()
    return {"ok": True}
