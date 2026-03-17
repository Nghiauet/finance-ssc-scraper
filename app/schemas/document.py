from datetime import date, datetime
from pydantic import BaseModel


class DocumentUpdate(BaseModel):
    report_type: str | None = None
    report_period: str | None = None
    year: int | None = None
    quarter: int | None = None


class DocumentResponse(BaseModel):
    id: str
    ticker: str
    exchange: str | None
    report_name: str
    company_name: str | None
    summary: str | None
    submission_date: date | None
    report_type: str | None
    report_period: str | None
    year: int | None
    quarter: int | None
    company_id: str | None
    file_id: str | None
    scrape_job_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentStats(BaseModel):
    total_documents: int
    total_companies: int
    by_exchange: dict[str, int]
    by_report_type: dict[str, int]
    by_year: dict[str, int]
