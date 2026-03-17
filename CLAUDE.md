# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Scrapes financial reports from Vietnam's State Securities Commission (SSC) portal (`congbothongtin.ssc.gov.vn`) and provides a web UI + API for managing the dataset. The site uses Oracle ADF with JavaScript-rendered content, requiring Playwright browser automation.

## Commands

```bash
uv sync                                        # install deps
uv run playwright install chromium              # install browser (once)

# CLI
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

## Architecture

```
scrape_ssc/                 # Scraper library (unchanged)
├── __init__.py             # exports SSCBrowser, SSCScraper
├── browser.py              # low-level Playwright/ADF helpers
├── scraper.py              # SSCScraper context manager + ScrapeResult
└── cli.py                  # argparse CLI

app/                        # FastAPI web application
├── main.py                 # FastAPI app, lifespan, page routes
├── config.py               # pydantic-settings (env vars)
├── database.py             # SQLAlchemy engine/session
├── models/                 # SQLAlchemy ORM: Company, Document, File, ScrapeJob
├── schemas/                # Pydantic request/response models
├── services/
│   ├── minio_service.py    # MinIO upload/download/presign
│   └── scrape_service.py   # Background scrape jobs (wraps SSCScraper)
├── api/                    # REST endpoints: /api/companies, /api/documents, /api/scrape-jobs
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

- Scrape jobs run as `asyncio.create_task` (max 1 concurrent, no Celery)
- MinIO has no host port; downloads are proxied through the API
- Report classification parsed from Vietnamese: Riêng/Hợp nhất/Mẹ × Năm/Bán niên/Quý
- All models use UUID primary keys for future merge with finance-chatbot-backend

### ADF DOM Details

- Content is in `page.frames[0]`, not the main page
- Table rows: `tr[role="row"]`, columns identified by `td` ID suffix
- Pagination: `a[title="Next Page"]` — poll for STT change after click
- Search: fill `#pt9:it8112::content` (ticker), click `#pt9:b1 a[role="button"]`
- Requires ~10s initial wait for ADF to render
- Re-fetch `page.frames[0]` after any navigation/click
