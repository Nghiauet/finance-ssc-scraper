# scrape-ssc

Scrapes financial reports from Vietnam's State Securities Commission portal and serves them through a React SPA and REST API.

## Features

- **SSC Scraper**: Automated scraping of financial reports from SSC portal using Playwright
- **React Dashboard**: Modern admin UI with charts, filters, batch operations, and dark mode
- **JWT + Basic Auth**: Login screen for the SPA, Basic Auth still supported for API/curl
- **Document Viewer**: Inline PDF viewer with navigation between reports
- **File Storage**: MinIO-backed file storage with proxied downloads

## Requirements

- Python 3.13+, `uv`
- Node.js 20+ (for frontend build)
- Docker and Docker Compose

## Configuration

Copy `.env.example` to `.env` and set your values:

```env
DATABASE_URL=postgresql+psycopg2://scrape_ssc:scrape_ssc_secret@localhost:5432/scrape_ssc
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=ssc-admin
MINIO_SECRET_KEY=ssc-secret-key
MINIO_BUCKET=ssc-reports
MINIO_SECURE=false
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=change-this-password
BASIC_AUTH_REALM=SSC Finance
ROOT_PATH=
JWT_SECRET_KEY=
JWT_EXPIRY_HOURS=24
MAX_CONCURRENT_SCRAPES=1
SCRAPE_HEADLESS=true
```

### Reverse proxy subpath

If deploying behind nginx at a subpath (e.g., `/ssc-portal`), set `ROOT_PATH=/ssc-portal`. This configures:
- FastAPI's `root_path` for correct `/docs` and `/openapi.json` URLs
- Frontend base path (passed as `VITE_BASE_PATH` build arg) for React Router and API calls

## Docker (recommended)

Start the full stack:

```bash
docker compose up -d --build
```

The app is exposed at `http://localhost:8030`. Docker Compose reads `BASIC_AUTH_USERNAME`, `BASIC_AUTH_PASSWORD`, `BASIC_AUTH_REALM`, and `ROOT_PATH` from your `.env`.

Stop:

```bash
docker compose down        # stop all
docker compose down -v     # stop + delete volumes
```

Debug with MinIO console:

```bash
docker compose --profile debug up -d   # MinIO console on :9003
```

## Local development

```bash
# Backend
uv sync
uv run playwright install chromium
uv run ssc-api                          # API on http://localhost:8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                             # Vite dev server on http://localhost:5173
                                        # proxies /api → localhost:8030
```

## CLI scraper

```bash
uv run scrape-ssc                                       # latest 5 pages
uv run scrape-ssc --ticker VNM                           # all VNM reports
uv run scrape-ssc --ticker VNM --download-all            # + download PDFs
uv run scrape-ssc --max-pages 0                          # all pages
uv run scrape-ssc --from-date 01/01/2024 --to-date 31/12/2024

# Via Docker
docker compose run --profile cli scraper --ticker VNM
```

## API endpoints

All API endpoints require authentication (Basic Auth or Bearer JWT).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Get JWT token (public) |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/companies` | List companies |
| GET | `/api/companies/{id}` | Company detail |
| POST | `/api/companies/batch-delete` | Batch delete companies |
| GET | `/api/documents` | List documents (with filters) |
| GET | `/api/documents/{id}` | Document detail |
| GET | `/api/documents/{id}/content` | Inline file view |
| GET | `/api/documents/{id}/download` | File download |
| GET | `/api/documents/{id}/navigation` | Newer/older document links |
| GET | `/api/documents/stats` | Document statistics |
| GET | `/api/documents/export` | CSV export |
| POST | `/api/documents/batch-delete` | Batch delete documents |
| GET | `/api/scrape-jobs` | List scrape jobs |
| POST | `/api/scrape-jobs` | Create scrape job |
| GET | `/api/files/{id}/content` | Raw file content |
| GET | `/api/files/{id}/download` | Raw file download |
| GET | `/api/health` | Health check |

Swagger UI: `/docs` | OpenAPI schema: `/openapi.json`

## Project layout

```text
scrape_ssc/                 Scraper library (Playwright + ADF automation)
app/                        FastAPI application
app/api/                    REST API routes (auth, companies, documents, files, scrape-jobs, dashboard)
app/models/                 SQLAlchemy models (Company, Document, File, ScrapeJob)
app/services/               Scraping, MinIO, and file streaming services
app/main.py                 App entrypoint, SPA static file serving
frontend/                   React SPA (Vite + TypeScript + shadcn/ui)
frontend/src/pages/         Page components (Login, Dashboard, Companies, Documents, ScrapeJobs)
frontend/src/api/           API client functions
frontend/src/components/    UI components (shadcn/ui + custom)
```
