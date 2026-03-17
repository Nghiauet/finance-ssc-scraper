from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.auth import BasicAuthMiddleware
from app.api.router import api_router
from app.config import settings
from app.database import engine, get_db
from app.models import Base, Company, Document, File, ScrapeJob
from app.services.file_stream import file_supports_inline_view
from app.services.minio_service import minio_service
from app.services.scrape_service import scrape_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Base.metadata.create_all(bind=engine)
    minio_service.ensure_bucket()
    db = next(get_db())
    scrape_service.cleanup_orphans(db)
    db.close()
    yield
    # Shutdown


app = FastAPI(
    title="SSC Financial Reports Manager",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
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

templates = Jinja2Templates(directory="app/templates")


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


# --- Admin UI Pages ---

@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request, db: Session = Depends(get_db)):
    total_companies = db.query(func.count(Company.id)).scalar()
    total_documents = db.query(func.count(Document.id)).scalar()
    total_files = db.query(func.count(File.id)).scalar()
    active_jobs = db.query(func.count(ScrapeJob.id)).filter(ScrapeJob.status.in_(["pending", "running"])).scalar()
    recent_jobs = db.query(ScrapeJob).order_by(ScrapeJob.created_at.desc()).limit(5).all()
    recent_docs = db.query(Document).order_by(Document.created_at.desc()).limit(10).all()
    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "total_companies": total_companies,
        "total_documents": total_documents,
        "total_files": total_files,
        "active_jobs": active_jobs,
        "recent_jobs": recent_jobs,
        "recent_docs": recent_docs,
        "page_title": "Dashboard",
    })


@app.get("/companies", response_class=HTMLResponse)
def companies_page(
    request: Request,
    search: str = "",
    page: int = 1,
    db: Session = Depends(get_db),
):
    q = db.query(Company)
    if search:
        q = q.filter(Company.symbol.ilike(f"%{search}%") | Company.name.ilike(f"%{search}%"))
    total = q.count()
    page_size = 20

    rows = (
        db.query(Company, func.count(Document.id).label("doc_count"))
        .outerjoin(Document, Document.company_id == Company.id)
        .group_by(Company.id)
    )
    if search:
        rows = rows.filter(Company.symbol.ilike(f"%{search}%") | Company.name.ilike(f"%{search}%"))
    rows = rows.order_by(Company.symbol).offset((page - 1) * page_size).limit(page_size).all()

    company_data = [{"company": c, "doc_count": cnt} for c, cnt in rows]

    total_pages = max(1, (total + page_size - 1) // page_size)
    return templates.TemplateResponse("companies/list.html", {
        "request": request,
        "company_data": company_data,
        "search": search,
        "page": page,
        "total_pages": total_pages,
        "total": total,
        "page_title": "Companies",
    })


@app.get("/companies/{company_id}", response_class=HTMLResponse)
def company_detail_page(request: Request, company_id: str, db: Session = Depends(get_db)):
    company = db.query(Company).get(company_id)
    if not company:
        return HTMLResponse("<h1>Not found</h1>", 404)
    docs = db.query(Document).filter_by(company_id=company_id).order_by(Document.submission_date.desc()).all()
    return templates.TemplateResponse("companies/detail.html", {
        "request": request,
        "company": company,
        "documents": docs,
        "page_title": company.symbol,
    })


@app.get("/documents", response_class=HTMLResponse)
def documents_page(
    request: Request,
    ticker: str = "",
    exchange: str = "",
    report_type: str = "",
    report_period: str = "",
    year: str = "",
    quarter: str = "",
    search: str = "",
    page: int = 1,
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
        try:
            q = q.filter(Document.year == int(year))
        except ValueError:
            pass
    if quarter:
        try:
            q = q.filter(Document.quarter == int(quarter))
        except ValueError:
            pass
    if search:
        q = q.filter(Document.report_name.ilike(f"%{search}%") | Document.summary.ilike(f"%{search}%"))

    total = q.count()
    page_size = 20
    docs = q.order_by(Document.submission_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    total_pages = max(1, (total + page_size - 1) // page_size)

    # Get unique values for filter dropdowns
    exchanges = [r[0] for r in db.query(Document.exchange).distinct().all() if r[0]]
    tickers = [r[0] for r in db.query(Document.ticker).distinct().order_by(Document.ticker).all() if r[0]]
    years = sorted([r[0] for r in db.query(Document.year).distinct().all() if r[0]], reverse=True)

    return templates.TemplateResponse("documents/list.html", {
        "request": request,
        "documents": docs,
        "ticker": ticker,
        "exchange": exchange,
        "report_type": report_type,
        "report_period": report_period,
        "year": year,
        "quarter": quarter,
        "search": search,
        "page": page,
        "total_pages": total_pages,
        "total": total,
        "exchanges": exchanges,
        "tickers": tickers,
        "years": years,
        "page_title": "Documents",
    })


@app.get("/documents/{document_id}", response_class=HTMLResponse)
def document_detail_page(request: Request, document_id: str, db: Session = Depends(get_db)):
    document = db.query(Document).get(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    file = db.query(File).get(document.file_id) if document.file_id else None

    # Efficient prev/next navigation using targeted queries instead of loading all related docs
    newer_document = (
        db.query(Document)
        .filter(
            Document.ticker == document.ticker,
            Document.id != document.id,
            (Document.submission_date > document.submission_date)
            | (
                (Document.submission_date == document.submission_date)
                & (Document.created_at > document.created_at)
            ),
        )
        .order_by(Document.submission_date.asc(), Document.created_at.asc())
        .first()
    )
    older_document = (
        db.query(Document)
        .filter(
            Document.ticker == document.ticker,
            Document.id != document.id,
            (Document.submission_date < document.submission_date)
            | (
                (Document.submission_date == document.submission_date)
                & (Document.created_at < document.created_at)
            ),
        )
        .order_by(Document.submission_date.desc(), Document.created_at.desc())
        .first()
    )

    related_documents = (
        db.query(Document)
        .filter(Document.ticker == document.ticker)
        .order_by(Document.submission_date.desc(), Document.created_at.desc())
        .limit(50)
        .all()
    )

    return templates.TemplateResponse("documents/detail.html", {
        "request": request,
        "document": document,
        "file": file,
        "can_preview_inline": bool(file and file_supports_inline_view(file)),
        "related_documents": related_documents,
        "newer_document": newer_document,
        "older_document": older_document,
        "page_title": document.report_name,
    })


@app.get("/scrape-jobs", response_class=HTMLResponse)
def scrape_jobs_page(request: Request, page: int = 1, db: Session = Depends(get_db)):
    page_size = 20
    q = db.query(ScrapeJob).order_by(ScrapeJob.created_at.desc())
    total = q.count()
    jobs = q.offset((page - 1) * page_size).limit(page_size).all()
    total_pages = max(1, (total + page_size - 1) // page_size)
    has_running = any(j.status in ("pending", "running") for j in jobs)
    return templates.TemplateResponse("scrape_jobs/list.html", {
        "request": request,
        "jobs": jobs,
        "page": page,
        "total_pages": total_pages,
        "total": total,
        "has_running": has_running,
        "page_title": "Scrape Jobs",
    })


def run():
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
