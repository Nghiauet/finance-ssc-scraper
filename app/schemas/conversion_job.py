from datetime import datetime

from pydantic import BaseModel


class ConversionJobCreate(BaseModel):
    document_id: str
    llm_config_id: str | None = None
    resume: bool = False


class BatchConversionCreate(BaseModel):
    document_ids: list[str]
    llm_config_id: str | None = None


class FilterBatchConversionCreate(BaseModel):
    ticker: str | None = None
    tickers: list[str] | None = None
    exchange: str | None = None
    report_type: str | None = None
    report_period: str | None = None
    year: int | None = None
    year_from: int | None = None
    year_to: int | None = None
    quarter: int | None = None
    llm_config_id: str | None = None


class ConversionJobResponse(BaseModel):
    id: str
    document_id: str
    llm_config_id: str | None
    status: str
    total_pages: int
    pages_processed: int
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    document_ticker: str | None = None
    document_report_name: str | None = None
    document_exchange: str | None = None
    document_report_type: str | None = None
    document_report_period: str | None = None
    document_year: int | None = None
    document_quarter: int | None = None
    document_company_name: str | None = None

    model_config = {"from_attributes": True}


class BatchConversionError(BaseModel):
    document_id: str
    ticker: str | None = None
    report_name: str | None = None
    error: str


class ConversionTickerStats(BaseModel):
    ticker: str
    company_name: str | None = None
    total_documents: int
    converted: int
    unconverted: int


class ConversionStatsResponse(BaseModel):
    total_documents: int
    converted_documents: int
    unconverted_documents: int
    active_jobs: int
    completed_jobs: int
    failed_jobs: int
    by_ticker: list[ConversionTickerStats]


class ConvertedDocumentResponse(BaseModel):
    document_id: str
    ticker: str
    exchange: str | None = None
    report_name: str
    report_type: str | None = None
    report_period: str | None = None
    year: int | None = None
    quarter: int | None = None
    company_name: str | None = None
    page_count: int
    model_name: str | None = None
    converted_at: datetime | None = None
    markdown_id: str


class BatchRetryRequest(BaseModel):
    job_ids: list[str] | None = None
