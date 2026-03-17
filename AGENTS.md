# AGENTS.md

Guidance for coding agents working in this repository.

## Purpose

This project scrapes financial reports from `congbothongtin.ssc.gov.vn` and exposes the data through:

- a FastAPI REST API
- a Jinja-based admin UI
- MinIO-backed document storage

## Working rules

- Read [`CLAUDE.md`](/home/nghiaph/nghiaph_workspace/finance-chatbot/scrape-ssc/CLAUDE.md) first for project context and common commands.
- Prefer small, maintainable changes over wide refactors.
- Keep document-serving logic centralized. Reuse `app/services/file_stream.py` for inline/download responses.
- Keep authentication centralized. Reuse `app/auth.py` and `.env` settings instead of route-by-route auth checks.
- Treat `/docs` and `/openapi.json` as first-class supported endpoints.
- Preserve the current UI pattern: document clicks should open the internal viewer page and downloads should stay explicit.

## Key paths

- [`app/main.py`](/home/nghiaph/nghiaph_workspace/finance-chatbot/scrape-ssc/app/main.py): app setup, middleware, HTML routes
- [`app/api/`](/home/nghiaph/nghiaph_workspace/finance-chatbot/scrape-ssc/app/api): REST API endpoints
- [`app/services/file_stream.py`](/home/nghiaph/nghiaph_workspace/finance-chatbot/scrape-ssc/app/services/file_stream.py): MinIO proxy responses for inline/download
- [`app/auth.py`](/home/nghiaph/nghiaph_workspace/finance-chatbot/scrape-ssc/app/auth.py): global Basic Auth middleware
- [`app/templates/documents/`](/home/nghiaph/nghiaph_workspace/finance-chatbot/scrape-ssc/app/templates/documents): document list and viewer UI
- [`app/config.py`](/home/nghiaph/nghiaph_workspace/finance-chatbot/scrape-ssc/app/config.py): `.env`-backed settings

## Configuration

The application expects `.env` values for:

- database and MinIO connectivity
- `BASIC_AUTH_USERNAME`
- `BASIC_AUTH_PASSWORD`
- `BASIC_AUTH_REALM`

If auth credentials are missing, the app intentionally fails at startup.

## Implementation notes

- Inline viewing currently targets PDFs via the browser's built-in PDF renderer.
- Keep `/api/documents/{id}/content` separate from `/api/documents/{id}/download`.
- If you add more previewable types later, extend `file_supports_inline_view()` in [`app/services/file_stream.py`](/home/nghiaph/nghiaph_workspace/finance-chatbot/scrape-ssc/app/services/file_stream.py).
- If you change environment variables, update both `.env.example` and [`README.md`](/home/nghiaph/nghiaph_workspace/finance-chatbot/scrape-ssc/README.md).

## Validation

Before finishing:

- import the app successfully
- check the main templates still render
- verify `/docs` remains available behind auth
- verify document content uses inline disposition and download uses attachment disposition
