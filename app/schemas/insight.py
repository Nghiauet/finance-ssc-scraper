from datetime import datetime

from pydantic import BaseModel


class InsightSection(BaseModel):
    title: str
    content: str


class InsightContent(BaseModel):
    sections: list[InsightSection]


class CompanyInsightResponse(BaseModel):
    id: str
    ticker: str
    company_id: str
    status: str  # "none" | "pending" | "running" | "completed" | "failed"
    content: InsightContent | None
    error_message: str | None
    generated_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
