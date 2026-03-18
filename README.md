# scrape-ssc

Scrapes financial reports from Vietnam's State Securities Commission portal and serves them through a FastAPI admin UI and API.

## What changed

- Documents now default to an in-app viewer instead of a forced download.
- Files are still available through explicit download actions.
- HTTP Basic Auth protects the UI, REST API, `/docs`, and `/openapi.json`.
- FastAPI Swagger UI is available at `/docs`.

## Requirements

- Python 3.13+
- `uv`
- Docker and Docker Compose for the containerized stack
- Chromium dependencies if you run the scraper locally

## Configuration

The app loads settings from `.env`.

Important variables:

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
MAX_CONCURRENT_SCRAPES=1
SCRAPE_HEADLESS=true
```

Local credentials are defined in `.env`. Rotate them before using this outside local development.

If you publish the app behind an Nginx subpath such as `/ssc-portal`, set `ROOT_PATH=/ssc-portal` so the UI, API links, `/docs`, and `openapi.json` are generated with that prefix.

## Local development

Install dependencies:

```bash
uv sync
uv run playwright install chromium
```

Run the API:

```bash
uv run ssc-api
```

Open:

- UI: `http://localhost:8000/`
- Swagger UI: `http://localhost:8000/docs`
- OpenAPI schema: `http://localhost:8000/openapi.json`

## Docker

Start the full stack:

```bash
docker compose up -d --build
```

The API is exposed on `http://localhost:8030`.

Docker Compose forwards `BASIC_AUTH_USERNAME`, `BASIC_AUTH_PASSWORD`, `BASIC_AUTH_REALM`, and `ROOT_PATH` into the container, so keep them in the project `.env`.

## Document viewing

- `/documents` lists stored reports.
- Clicking a document opens an internal viewer page.
- PDFs are embedded inline with the browser PDF renderer.
- Non-previewable files keep a download fallback.
- Raw file endpoints:
  - `/api/documents/{doc_id}/content`
  - `/api/documents/{doc_id}/download`
  - `/api/files/{file_id}/content`
  - `/api/files/{file_id}/download`

## Useful commands

```bash
uv run scrape-ssc
uv run scrape-ssc --ticker VNM
uv run scrape-ssc --ticker VNM --download-all
uv run scrape-ssc --max-pages 0
uv run scrape-ssc --from-date 01/01/2024 --to-date 31/12/2024
```

## Project layout

```text
scrape_ssc/                 Scraper library
app/                        FastAPI application
app/api/                    REST API routes
app/models/                 SQLAlchemy models
app/services/               Scraping, MinIO, and file streaming services
app/templates/              Jinja templates for the admin UI
app/main.py                 App entrypoint and page routes
```
