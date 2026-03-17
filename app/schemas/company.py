from datetime import datetime
from pydantic import BaseModel


class CompanyCreate(BaseModel):
    symbol: str
    name: str
    exchange: str | None = None
    metadata_: dict | None = None


class CompanyUpdate(BaseModel):
    name: str | None = None
    exchange: str | None = None
    metadata_: dict | None = None


class CompanyResponse(BaseModel):
    id: str
    symbol: str
    name: str
    exchange: str | None
    metadata_: dict | None
    created_at: datetime
    updated_at: datetime | None
    document_count: int = 0

    model_config = {"from_attributes": True}
