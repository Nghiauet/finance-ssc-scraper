from datetime import datetime
from pydantic import BaseModel


class ScrapeJobCreate(BaseModel):
    ticker: str | None = None
    from_date: str | None = None
    to_date: str | None = None
    max_pages: int | None = None
    download_files: bool = True


class ScrapeJobResponse(BaseModel):
    id: str
    status: str
    ticker: str | None
    from_date: str | None
    to_date: str | None
    max_pages: int | None
    download_files: bool
    total_reports_found: int
    total_files_downloaded: int
    total_pages_scraped: int
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
