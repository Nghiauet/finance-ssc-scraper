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
├── browser.py              # low-level Playwright/ADF helpers
├── scraper.py              # SSCScraper context manager + ScrapeResult
└── cli.py                  # argparse CLI

app/                        # FastAPI web application
├── main.py                 # FastAPI app, lifespan, page routes
├── config.py               # pydantic-settings (env vars)
├── database.py             # SQLAlchemy engine/session (create_all, no Alembic migrations)
├── auth.py                 # Global HTTP Basic Auth middleware (ASGI)
├── models/                 # SQLAlchemy ORM: Company, Document, File, ScrapeJob
├── schemas/                # Pydantic request/response models
├── services/
│   ├── minio_service.py    # MinIO upload/download/presign
│   ├── file_stream.py      # MinIO proxy responses (inline/download disposition)
│   └── scrape_service.py   # Background scrape jobs (wraps SSCScraper)
├── api/                    # REST endpoints: /api/companies, /api/documents, /api/scrape-jobs, /api/files
└── templates/              # Jinja2 + Tailwind CSS + htmx admin UI
```

### Docker services

- **postgres** (internal:5432) — PostgreSQL 15 database
- **minio** (internal:9000) — S3-compatible file storage, bucket `ssc-reports`
- **api** (host:8030) — FastAPI + Playwright, the only exposed port
- **scraper** (cli profile) — standalone CLI scraper

### Data flow

1. **Scrape:** API creates ScrapeJob → SSCScraper runs in asyncio task → rows extracted from ADF
2. **Store:** Companies upserted, Documents created, files uploaded to MinIO, File records linked
3. **Serve:** Admin UI renders data from PostgreSQL, downloads proxied from MinIO

### Key patterns

- Database schema created via `Base.metadata.create_all()` at startup — no Alembic migrations
- All models use UUID primary keys for future merge with finance-chatbot-backend
- Scrape jobs run as `asyncio.create_task` (max 1 concurrent, no Celery)
- HTTP Basic Auth middleware (`app/auth.py`) protects all endpoints globally, including `/docs` and `/openapi.json`
- MinIO has no host port; file downloads are proxied through the API via `app/services/file_stream.py`
- Document clicks open an internal viewer (PDF inline via browser renderer); downloads are a separate explicit action
- Report classification parsed from Vietnamese: Riêng/Hợp nhất/Mẹ × Năm/Bán niên/Quý

### Working rules

- Keep authentication centralized in `app/auth.py` — do not add route-by-route auth checks
- Keep file-serving logic centralized in `app/services/file_stream.py` — reuse for inline/download responses
- Prefer app-proxied `/content` and `/download` routes over presigned MinIO URLs in user-facing flows
- When deleting or proxying files, respect `File.bucket` instead of assuming the default bucket
- To support new previewable file types, extend `file_supports_inline_view()` in `app/services/file_stream.py`
- Treat `/docs` and `/openapi.json` as first-class endpoints — keep them working behind auth

### ADF DOM Details

- Content is in `page.frames[0]`, not the main page
- Table rows: `tr[role="row"]`, columns identified by `td` ID suffix
- Pagination: `a[title="Next Page"]` — poll for STT change after click
- Search: fill `#pt9:it8112::content` (ticker), click `#pt9:b1 a[role="button"]`
- Requires ~10s initial wait for ADF to render
- Re-fetch `page.frames[0]` after any navigation/click
