# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Scrapes financial reports from Vietnam's State Securities Commission (SSC) portal (`congbothongtin.ssc.gov.vn`) and provides a web UI + API for managing the dataset. The site uses Oracle ADF with JavaScript-rendered content, requiring Playwright browser automation.

## Requirements

- Python 3.13+ (`uv` for dependency management)
- Docker and Docker Compose for the containerized stack
- Chromium (installed via Playwright) for scraping

## Commands

```bash
uv sync                                        # install deps
uv run playwright install chromium              # install browser (once)

# CLI scraper
uv run scrape-ssc                               # latest 5 pages
uv run scrape-ssc --ticker VNM                  # all VNM reports
uv run scrape-ssc --ticker VNM --download-all   # + download PDFs
uv run scrape-ssc --max-pages 0                 # all pages
uv run scrape-ssc --from-date 01/01/2024 --to-date 31/12/2024

# Web application (Docker)
docker compose up -d                            # start postgres + minio + api
docker compose up -d --build                    # rebuild and start
docker compose --profile debug up -d            # + MinIO console on :9003
docker compose down                             # stop all
docker compose down -v                          # stop + delete volumes

# Docker CLI scraper (separate profile)
docker compose run --profile cli scraper --ticker VNM

# Web application (local dev)
uv run ssc-api                                  # http://localhost:8000
```

No test suite or linter is configured.

## Configuration

Settings loaded from `.env` via pydantic-settings (`app/config.py`). See `.env.example` for all variables. Key groups:

- **Database**: `DATABASE_URL`
- **MinIO**: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_SECURE`
- **Auth**: `BASIC_AUTH_USERNAME`, `BASIC_AUTH_PASSWORD`, `BASIC_AUTH_REALM` — app fails at startup if missing
- **Server**: `ROOT_PATH` — set when behind a reverse proxy subpath (e.g., `/ssc-portal`)
- **Scraper**: `MAX_CONCURRENT_SCRAPES` (default 1), `SCRAPE_HEADLESS` (default true)

If you change environment variables, update `.env.example`, `README.md`, and any Docker environment wiring.

## Architecture

```
scrape_ssc/                 # Scraper library (standalone, reusable)
├── browser.py              # low-level Playwright/ADF helpers (SSCBrowser)
├── scraper.py              # SSCScraper async context manager + ScrapeResult
└── cli.py                  # argparse CLI (entry point: scrape-ssc)

app/                        # FastAPI web application (entry point: ssc-api)
├── main.py                 # FastAPI app, lifespan, page routes, Jinja setup
├── config.py               # pydantic-settings (env vars)
├── database.py             # SQLAlchemy engine/session (create_all, no Alembic)
├── auth.py                 # Global HTTP Basic Auth ASGI middleware
├── models/                 # SQLAlchemy ORM: Company, Document, File, ScrapeJob
├── schemas/                # Pydantic request/response models
├── services/
│   ├── minio_service.py    # MinIO upload/download/presign
│   ├── file_stream.py      # MinIO proxy responses (inline/download disposition)
│   └── scrape_service.py   # Background scrape jobs (wraps SSCScraper)
├── api/                    # REST endpoints mounted at /api via api/router.py
│   ├── companies.py        # /api/companies
│   ├── documents.py        # /api/documents (includes /content and /download)
│   ├── files.py            # /api/files (includes /content and /download)
│   └── scrape_jobs.py      # /api/scrape-jobs
└── templates/              # Jinja2 + Tailwind CSS + htmx admin UI
    ├── base.html           # Layout shell
    ├── components/         # _navbar, _pagination, _badge, _empty_state
    ├── dashboard.html
    ├── companies/          # list.html, detail.html
    ├── documents/          # list.html, detail.html (inline viewer)
    └── scrape_jobs/        # list.html
```

### Docker services

- **postgres** (internal:5432) — PostgreSQL 15 database
- **minio** (internal:9000) — S3-compatible file storage, bucket `ssc-reports`
- **api** (host:8030) — FastAPI + Playwright, the only exposed port
- **scraper** (cli profile) — standalone CLI scraper

### Data flow

1. **Scrape:** API creates ScrapeJob → SSCScraper runs in asyncio task → rows extracted from ADF
2. **Store:** Companies upserted, Documents created/deduped, files uploaded to MinIO, File records linked
3. **Serve:** Admin UI renders data from PostgreSQL, downloads proxied from MinIO

### Key patterns

- Database schema created via `Base.metadata.create_all()` at startup — no Alembic migrations (alembic is a dependency but unused)
- All models use UUID primary keys (via `Base` in `app/models/base.py`) for future merge with finance-chatbot-backend
- Scrape jobs run as `asyncio.create_task` (max 1 concurrent, no Celery)
- HTTP Basic Auth middleware (`app/auth.py`) protects all endpoints globally, including `/docs` and `/openapi.json`
- MinIO has no host port; file downloads are proxied through the API via `app/services/file_stream.py`
- Document clicks open an internal viewer (PDF inline via browser renderer); downloads are a separate explicit action
- Report classification parsed from Vietnamese: Riêng/Hợp nhất/Mẹ × Năm/Bán niên/Quý → `report_type` + `report_period` fields

### Document deduplication

`scrape_service._find_existing_document()` prevents duplicate Document rows on re-scrape:
1. First tries strict match: `ticker` + `submission_date` + normalized `report_name`
2. Falls back to broader match: `ticker` + normalized `report_name` only

Normalization (`normalize_report_name`) applies NFC, strips NBSP/zero-width chars, collapses whitespace, and casefolds. A separate `deduplicate_documents()` method can merge existing duplicates by group.

### Jinja template conventions

- `app_path(request, "/some/path")` — global that prepends `ROOT_PATH` for correct links behind reverse proxies
- `hcm_time` filter — converts UTC datetimes to `Asia/Ho_Chi_Minh` timezone, format `dd/mm/yyyy HH:MM`
- Templates use Tailwind CSS (CDN) and htmx for dynamic interactions
- Reusable components live in `app/templates/components/` (prefixed with `_`)

### Working rules

- Keep authentication centralized in `app/auth.py` — do not add route-by-route auth checks
- Keep file-serving logic centralized in `app/services/file_stream.py` — reuse for inline/download responses
- Prefer app-proxied `/content` and `/download` routes over presigned MinIO URLs in user-facing flows
- When deleting or proxying files, respect `File.bucket` instead of assuming the default bucket
- To support new previewable file types, extend `file_supports_inline_view()` in `app/services/file_stream.py`
- Treat `/docs` and `/openapi.json` as first-class endpoints — keep them working behind auth
- Do not add real or live-looking secrets to tracked files — use placeholders in `.env.example` and README

### Validation after changes

- Verify `uv run python -c "from app.main import app"` succeeds (catches import and startup errors)
- Check that `/docs` remains available behind auth
- If touching templates, verify the main pages still render
- If touching file serving, verify `/content` uses inline disposition and `/download` uses attachment

### ADF DOM Details

- Content lives in `page.frames[0]`, not the main page — re-fetch the frame reference after any navigation/click
- Table rows: `tr[role="row"]`, columns identified by `td` ID suffix (e.g., `c12`=STT, `c2`=exchange, `c5`=ticker, `c3`=report_name, `c8`=company, `c111`=summary, `c7`=submission_date)
- Pagination: `a[title="Next Page"]` — poll for STT cell text change after click
- Search inputs: `#pt9:it8112::content` (ticker), `#pt9:id1::content` (from date), `#pt9:id2::content` (to date)
- Search button: `#pt9:b1 a[role="button"]`
- Requires ~10s initial wait for ADF to render
- Downloads: find `img[src*="download"]` → closest `<a>` → click triggers browser download event
