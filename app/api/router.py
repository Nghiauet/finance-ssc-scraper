from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.companies import router as companies_router
from app.api.dashboard import router as dashboard_router
from app.api.documents import router as documents_router
from app.api.scrape_jobs import router as scrape_jobs_router
from app.api.files import router as files_router
from app.api.llm_configs import router as llm_configs_router
from app.api.conversions import router as conversions_router
from app.api.knowledge import router as knowledge_router

api_router = APIRouter(prefix="/api")

api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(companies_router)
api_router.include_router(documents_router)
api_router.include_router(scrape_jobs_router)
api_router.include_router(files_router)
api_router.include_router(llm_configs_router)
api_router.include_router(conversions_router)
api_router.include_router(knowledge_router)
