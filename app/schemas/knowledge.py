from datetime import datetime

from pydantic import BaseModel


class KnowledgeSearchRequest(BaseModel):
    query: str
    ticker: str | None = None
    year: int | None = None
    report_type: str | None = None
    report_period: str | None = None
    from_date: str | None = None
    to_date: str | None = None
    limit: int = 10


class KnowledgeSearchResult(BaseModel):
    chunk_text: str
    document_id: str
    ticker: str
    report_name: str
    section_heading: str | None
    score: float
    year: int | None = None
    report_type: str | None = None
    report_period: str | None = None
    company_name: str | None = None


class KnowledgeSearchResponse(BaseModel):
    results: list[KnowledgeSearchResult]
    total_results: int


class KnowledgeAskRequest(BaseModel):
    query: str
    ticker: str | None = None
    year: int | None = None
    report_type: str | None = None
    report_period: str | None = None
    from_date: str | None = None
    to_date: str | None = None
    llm_config_id: str | None = None


class KnowledgeAskResponse(BaseModel):
    answer: str
    sources: list[KnowledgeSearchResult]


class EmbedRequest(BaseModel):
    document_ids: list[str]


class EmbeddingJobResponse(BaseModel):
    id: str
    document_id: str | None
    llm_config_id: str | None
    status: str
    total_chunks: int
    chunks_processed: int
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    document_ticker: str | None = None
    document_report_name: str | None = None

    model_config = {"from_attributes": True}


class KnowledgeStats(BaseModel):
    total_documents: int
    embedded_documents: int
    total_chunks: int
    by_ticker: dict[str, int]
