from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import BasicAuthMiddleware
from app.api.router import api_router
from app.config import settings
from app.database import engine, get_db
from app.models import Base
from app.services.minio_service import minio_service
from app.services.scrape_service import scrape_service
from app.services.llm_service import llm_service
from app.services.embedding_service import embedding_service


def normalize_root_path(value: str) -> str:
    value = (value or "").strip()
    if not value or value == "/":
        return ""
    return f"/{value.strip('/')}"


APP_ROOT_PATH = normalize_root_path(settings.root_path)

# Resolve frontend dist directory (built React SPA)
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend_dist"


def _ensure_pgvector(eng):
    """Enable pgvector extension and add embedding column if needed."""
    with eng.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # Add embedding column if it doesn't exist
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'document_chunks' AND column_name = 'embedding'
                ) THEN
                    ALTER TABLE document_chunks
                    ADD COLUMN embedding vector(:dim);
                END IF;
            END $$;
        """), {"dim": settings.embedding_dimension})
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_pgvector(engine)
    minio_service.ensure_bucket()
    db = next(get_db())
    scrape_service.cleanup_orphans(db)
    llm_service.cleanup_orphans(db)
    embedding_service.cleanup_orphans(db)
    db.close()
    yield


app = FastAPI(
    title="SSC Financial Reports Manager",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
    root_path=APP_ROOT_PATH,
)

app.add_middleware(
    BasicAuthMiddleware,
    username=settings.basic_auth_username,
    password=settings.basic_auth_password,
    realm=settings.basic_auth_realm,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


# --- Health ---

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db_ok = False
    minio_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass
    minio_ok = minio_service.healthy()
    return {"db": db_ok, "minio": minio_ok, "status": "ok" if (db_ok and minio_ok) else "degraded"}


# --- Frontend SPA ---


class SPAStaticFiles(StaticFiles):
    """StaticFiles subclass that falls back to index.html for SPA routing."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as ex:
            if ex.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


if FRONTEND_DIR.is_dir():
    app.mount(
        "/",
        SPAStaticFiles(directory=str(FRONTEND_DIR), html=True),
        name="frontend",
    )


def run():
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
