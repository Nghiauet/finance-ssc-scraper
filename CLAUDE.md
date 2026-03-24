# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Scrapes financial reports from Vietnam's State Securities Commission (SSC) portal (`congbothongtin.ssc.gov.vn`) and provides a React SPA + REST API for managing the dataset. The site uses Oracle ADF with JavaScript-rendered content, requiring Playwright browser automation.

## Requirements

- Python 3.13+ (`uv` for dependency management)
- Node.js 20+ (for frontend build)
- Docker and Docker Compose for the containerized stack
- Chromium (installed via Playwright) for scraping

## Commands

```bash
uv sync                                        # install Python deps
uv run playwright install chromium              # install browser (once)

# Frontend dev
cd frontend && npm install                      # install frontend deps
cd frontend && npm run dev                      # Vite dev server on :5173 (proxies /api → :8030)
cd frontend && npm run build                    # production build → frontend/dist/

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

# Web application (local dev — backend only, no frontend)
uv run ssc-api                                  # http://localhost:8000
```

No test suite or linter is configured.

## Configuration

Settings loaded from `.env` via pydantic-settings (`app/config.py`). See `.env.example` for all variables. Key groups:

- **Database**: `DATABASE_URL`
- **MinIO**: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_SECURE`
- **Auth**: `BASIC_AUTH_USERNAME`, `BASIC_AUTH_PASSWORD`, `BASIC_AUTH_REALM` — app fails at startup if missing
- **JWT**: `JWT_SECRET_KEY` (optional — auto-derived from auth password if empty), `JWT_EXPIRY_HOURS` (default 24)
- **Server**: `ROOT_PATH` — set when behind a reverse proxy subpath (e.g., `/ssc-portal`). Also passed as `VITE_BASE_PATH` build arg for frontend.
- **Scraper**: `MAX_CONCURRENT_SCRAPES` (default 1), `SCRAPE_HEADLESS` (default true)
- **LLM Conversions**: `MAX_CONCURRENT_CONVERSIONS` (default 3) — concurrent PDF-to-markdown jobs
- **RAG / Embeddings**: `EMBEDDING_DIMENSION` (default 1536), `AUTO_EMBED_AFTER_CONVERSION` (default true) — auto-embed after markdown conversion

If you change environment variables, update `.env.example`, `README.md`, and any Docker environment wiring.

## Architecture

```
scrape_ssc/                 # Scraper library (standalone, reusable)
├── browser.py              # low-level Playwright/ADF helpers (SSCBrowser)
├── scraper.py              # SSCScraper async context manager + ScrapeResult
└── cli.py                  # argparse CLI (entry point: scrape-ssc)

app/                        # FastAPI web application (entry point: ssc-api)
├── main.py                 # FastAPI app, lifespan, SPA static file serving
├── config.py               # pydantic-settings (env vars)
├── database.py             # SQLAlchemy engine/session (create_all, no Alembic)
├── auth.py                 # ASGI middleware: Basic Auth + Bearer JWT
├── models/                 # SQLAlchemy ORM: Company, Document, File, ScrapeJob, LLMConfig, ConversionJob, MarkdownContent, DocumentChunk, EmbeddingJob
├── schemas/                # Pydantic request/response models
├── services/
│   ├── minio_service.py    # MinIO upload/download/presign
│   ├── file_stream.py      # MinIO proxy responses (inline/download disposition)
│   ├── scrape_service.py   # Background scrape jobs (wraps SSCScraper)
│   ├── crypto_service.py   # Fernet encryption for API keys
│   ├── llm_service.py      # PDF→markdown conversion via OpenAI-compatible vision LLM
│   ├── chunking_service.py # Semantic markdown chunking (heading-aware, table-preserving)
│   ├── embedding_service.py # Batch embedding via OpenAI-compatible API
│   └── knowledge_service.py # Hybrid search (pgvector + full-text RRF) + RAG
└── api/                    # REST endpoints mounted at /api via api/router.py
    ├── auth.py             # /api/auth (JWT login, /me)
    ├── dashboard.py        # /api/dashboard (stats)
    ├── companies.py        # /api/companies (CRUD, batch-delete)
    ├── documents.py        # /api/documents (CRUD, batch-delete, /content, /download, /markdown, /navigation, /stats, /export)
    ├── files.py            # /api/files (/content, /download)
    ├── scrape_jobs.py      # /api/scrape-jobs (CRUD)
    ├── llm_configs.py      # /api/llm-configs (CRUD + test connection)
    ├── conversions.py      # /api/conversions (single + batch PDF→markdown jobs)
    └── knowledge.py        # /api/knowledge (search, ask, embed, stats)

frontend/                   # React SPA (Vite + TypeScript)
├── vite.config.ts          # Vite config: base="./", API proxy for dev
├── components.json         # shadcn/ui config
└── src/
    ├── App.tsx             # Router + QueryClient + AuthProvider + ThemeProvider
    ├── api/                # API client functions (apiFetch with Bearer token)
    │   ├── client.ts       # Fetch wrapper, token management, base path helpers
    │   ├── auth.ts         # login(), logout(), getMe()
    │   ├── companies.ts
    │   ├── documents.ts
    │   ├── dashboard.ts
    │   ├── scrape-jobs.ts
    │   ├── llm-configs.ts  # LLM config CRUD + test
    │   ├── conversions.ts  # Conversion job CRUD + batch
    │   └── knowledge.ts    # Search, ask, embed, stats
    ├── hooks/
    │   ├── use-auth.tsx    # AuthContext + useAuth() hook
    │   └── use-theme.tsx   # ThemeContext for dark mode toggle
    ├── components/
    │   ├── layout/         # AppLayout, Navbar, ProtectedRoute
    │   ├── ui/             # shadcn/ui primitives (button, card, input, etc.)
    │   ├── StatusBadge.tsx  # Exchange, ReportType, ReportPeriod, Status badges
    │   ├── Pagination.tsx
    │   ├── EmptyState.tsx
    │   ├── ConfirmDialog.tsx
    │   └── MarkdownViewer.tsx  # react-markdown renderer + copy/download
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── DashboardPage.tsx    # stat cards + Recharts charts
    │   ├── CompaniesPage.tsx    # searchable table with batch ops
    │   ├── CompanyDetailPage.tsx
    │   ├── DocumentsPage.tsx    # filter bar + table + CSV export + batch convert
    │   ├── DocumentDetailPage.tsx  # PDF viewer + markdown tab + navigation
    │   ├── ScrapeJobsPage.tsx   # form + live-polling jobs table
    │   ├── ConversionsPage.tsx  # conversion jobs with live-polling
    │   ├── SettingsPage.tsx     # LLM config management (vision + embedding)
    │   └── KnowledgeBasePage.tsx # hybrid search + RAG ask + embed controls
    ├── types/index.ts      # TS interfaces matching Pydantic schemas
    └── lib/
        ├── utils.ts        # cn() helper (clsx + tailwind-merge)
        └── format.ts       # Date/time formatting helpers
```

### Docker services

- **postgres** (internal:5432) — PostgreSQL 15 + pgvector extension (image: `pgvector/pgvector:pg15`)
- **minio** (internal:9000) — S3-compatible file storage, bucket `ssc-reports`
- **api** (host:8030) — FastAPI + Playwright + built React SPA, the only exposed port
- **scraper** (cli profile) — standalone CLI scraper

### Docker build

Multi-stage `Dockerfile.api`:
1. **Stage 1** (node:20-alpine): builds `frontend/` → `dist/`. Receives `VITE_BASE_PATH` build arg from `ROOT_PATH` env var for proxy-aware asset/API paths.
2. **Stage 2** (python:3.13-slim): copies built frontend into `frontend_dist/`, installs Python deps + Playwright.

### Data flow

1. **Scrape:** API creates ScrapeJob → SSCScraper runs in asyncio task → rows extracted from ADF
2. **Store:** Companies upserted, Documents created/deduped, files uploaded to MinIO, File records linked
3. **Convert:** User triggers ConversionJob → PDF fetched from MinIO → pages rendered to PNG → OpenAI-compatible vision LLM → concatenated markdown → MarkdownContent record
4. **Embed:** After conversion (auto or manual) → markdown chunked semantically → chunks batch-embedded via OpenAI-compatible API → stored in pgvector DocumentChunk table
5. **Search:** Hybrid query → pgvector cosine distance + PostgreSQL full-text → Reciprocal Rank Fusion → ranked results
6. **RAG Ask:** Retrieve top-10 chunks → build context → chat LLM generates answer with source citations
7. **Serve:** React SPA renders data via REST API, file downloads proxied from MinIO

### Key patterns

- Database schema created via `Base.metadata.create_all()` at startup — no Alembic migrations (alembic is a dependency but unused)
- All models use UUID primary keys (via `Base` in `app/models/base.py`) for future merge with finance-chatbot-backend
- Scrape jobs run as `asyncio.create_task` (max 1 concurrent, no Celery)
- Conversion jobs and embedding jobs follow the same asyncio.create_task pattern with progress tracking
- **LLM configs** stored in DB with Fernet-encrypted API keys (derived from JWT secret). Two types: `vision` (PDF→markdown) and `embedding` (chunking→vectors). Managed via Settings UI.
- **pgvector**: `CREATE EXTENSION vector` run at startup in `_ensure_pgvector()`. Embedding column added dynamically to avoid import issues when extension isn't loaded.
- **Hybrid search**: Knowledge service uses Reciprocal Rank Fusion (RRF) combining pgvector cosine distance and PostgreSQL `ts_rank` full-text search. Metadata pre-filtering (ticker, year, report_type) applied via SQL WHERE.
- **Chunking**: Semantic chunking splits by markdown headings, preserves tables intact, uses ~800 token chunks with 100-token overlap. Token counting via tiktoken.
- **Authentication**: ASGI middleware (`app/auth.py`) accepts both `Authorization: Basic` and `Authorization: Bearer <JWT>`. Only `/api/`, `/docs`, `/openapi.json` paths require auth — frontend SPA paths are public (React handles auth client-side via ProtectedRoute)
- **JWT**: `POST /api/auth/login` validates against `.env` credentials and returns a JWT. Secret auto-derived from auth password if `JWT_SECRET_KEY` is empty.
- MinIO has no host port; file downloads are proxied through the API via `app/services/file_stream.py`
- **SPA serving**: `SPAStaticFiles` (custom `StaticFiles` subclass in `app/main.py`) serves `frontend_dist/` and falls back to `index.html` for client-side routing
- Report classification parsed from Vietnamese: Riêng/Hợp nhất/Mẹ × Năm/Bán niên/Quý → `report_type` + `report_period` fields

### Frontend conventions

- **Stack**: React 19, Vite 6, TypeScript, TanStack Query v5, React Router 7, shadcn/ui (Tailwind v4 + Radix), Recharts, Lucide React, date-fns, Sonner (toasts)
- **Base path**: `VITE_BASE_PATH` env var (set at build time) configures React Router `basename` and API fetch prefix. Vite `base: "./"` generates relative asset URLs for proxy compatibility.
- **API client** (`frontend/src/api/client.ts`): all API calls go through `apiFetch()` which auto-attaches Bearer token and redirects to `/login` on 401. Use `withBase()` for constructing direct URLs (content/download).
- **Auth flow**: `AuthProvider` checks token validity on mount via `/api/auth/me`. `ProtectedRoute` redirects unauthenticated users to `/login`. Token stored in `localStorage`.
- **Dark mode**: `ThemeProvider` toggles `.dark` class on `<html>`, persisted in localStorage.
- **Live polling**: ScrapeJobsPage and ConversionsPage use `refetchInterval: 3000` when jobs are active.
- **Markdown rendering**: `MarkdownViewer` component uses `react-markdown` + `remark-gfm` for rendering converted financial report content.
- **Knowledge Base page**: Dual-mode (Search / Ask AI) with structured filters (ticker, year, report_type). Embedding status badge with "Embed All" action.
- **UI components**: shadcn/ui primitives in `frontend/src/components/ui/`. Custom shared components in `frontend/src/components/`.

### Document deduplication

`scrape_service._find_existing_document()` prevents duplicate Document rows on re-scrape:
1. First tries strict match: `ticker` + `submission_date` + normalized `report_name`
2. Falls back to broader match: `ticker` + normalized `report_name` only

Normalization (`normalize_report_name`) applies NFC, strips NBSP/zero-width chars, collapses whitespace, and casefolds. A separate `deduplicate_documents()` method can merge existing duplicates by group.

### Working rules

- Keep authentication centralized in `app/auth.py` — do not add route-by-route auth checks
- Keep file-serving logic centralized in `app/services/file_stream.py` — reuse for inline/download responses
- Prefer app-proxied `/content` and `/download` routes over presigned MinIO URLs in user-facing flows
- When deleting or proxying files, respect `File.bucket` instead of assuming the default bucket
- To support new previewable file types, extend `file_supports_inline_view()` in `app/services/file_stream.py`
- Treat `/docs` and `/openapi.json` as first-class endpoints — keep them working behind auth
- Do not add real or live-looking secrets to tracked files — use placeholders in `.env.example` and README
- When adding new API endpoints, add corresponding functions in `frontend/src/api/` and update TypeScript types in `frontend/src/types/index.ts`
- Keep all API base path handling in `frontend/src/api/client.ts` — use `withBase()` for direct URLs, `apiFetch()` for data fetching
- LLM API keys are encrypted at rest — use `crypto_service.encrypt_api_key()` / `decrypt_api_key()` and never return plaintext keys in API responses
- Background jobs (scrape, conversion, embedding) all follow the same pattern: create job record → `asyncio.create_task` → progress updates → completion/failure → orphan cleanup at startup

### Validation after changes

- Verify `uv run python -c "from app.main import app"` succeeds (catches import and startup errors)
- For frontend: `cd frontend && npm run build` succeeds (catches TypeScript errors)
- Check that `/docs` remains available behind auth
- If touching frontend, rebuild Docker (`docker compose up -d --build`) and verify pages render
- If touching file serving, verify `/content` uses inline disposition and `/download` uses attachment

### ADF DOM Details

- Content lives in `page.frames[0]`, not the main page — re-fetch the frame reference after any navigation/click
- Table rows: `tr[role="row"]`, columns identified by `td` ID suffix (e.g., `c12`=STT, `c2`=exchange, `c5`=ticker, `c3`=report_name, `c8`=company, `c111`=summary, `c7`=submission_date)
- Pagination: `a[title="Next Page"]` — poll for STT cell text change after click
- Search inputs: `#pt9:it8112::content` (ticker), `#pt9:id1::content` (from date), `#pt9:id2::content` (to date)
- Search button: `#pt9:b1 a[role="button"]`
- Requires ~10s initial wait for ADF to render
- Downloads: find `img[src*="download"]` → closest `<a>` → click triggers browser download event
