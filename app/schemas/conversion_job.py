from datetime import datetime

from pydantic import BaseModel


class ConversionJobCreate(BaseModel):
    document_id: str
    llm_config_id: str | None = None


class BatchConversionCreate(BaseModel):
    document_ids: list[str]
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

    model_config = {"from_attributes": True}
