FROM python:3.13-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy project files
COPY pyproject.toml uv.lock README.md ./
COPY scrape_ssc/ scrape_ssc/
COPY scrape_financial_reports.py main.py ./

# Install Python dependencies
RUN uv sync --frozen --no-dev

# Install Chromium + all its system dependencies
RUN uv run playwright install --with-deps chromium

# Output volume
VOLUME /app/output

ENTRYPOINT ["uv", "run", "scrape-ssc"]
CMD ["--max-pages", "5", "-o", "/app/output"]
