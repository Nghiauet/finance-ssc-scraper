from fastapi import APIRouter

from app.api.companies import router as companies_router
from app.api.documents import router as documents_router
from app.api.scrape_jobs import router as scrape_jobs_router
from app.api.files import router as files_router

api_router = APIRouter(prefix="/api")

api_router.include_router(companies_router)
api_router.include_router(documents_router)
api_router.include_router(scrape_jobs_router)
api_router.include_router(files_router)
