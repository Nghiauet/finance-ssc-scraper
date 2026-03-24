from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Company, Document, File, ScrapeJob

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
def dashboard_stats(db: Session = Depends(get_db)):
    return {
        "total_companies": db.query(func.count(Company.id)).scalar(),
        "total_documents": db.query(func.count(Document.id)).scalar(),
        "total_files": db.query(func.count(File.id)).scalar(),
        "active_jobs": db.query(func.count(ScrapeJob.id)).filter(
            ScrapeJob.status.in_(["pending", "running"])
        ).scalar(),
    }
