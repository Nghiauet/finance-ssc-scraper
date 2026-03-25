from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class InsightSection(BaseModel):
    title: str
    content: str


class InsightContent(BaseModel):
    sections: list[InsightSection]


class CompanyInsightResponse(BaseModel):
    id: str | None = None
    ticker: str
    company_id: str | None = None
    llm_config_id: str | None
    status: Literal["none", "pending", "running", "completed", "failed"]
    content: InsightContent | None
    error_message: str | None
    generated_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
