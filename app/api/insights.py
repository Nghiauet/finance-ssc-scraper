from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.insight import CompanyInsightResponse
from app.services.insight_service import insight_service

router = APIRouter(prefix="/insights", tags=["insights"])


class GenerateInsightRequest(BaseModel):
    force: bool = False
    llm_config_id: str | None = None


@router.get("/{ticker}", response_model=CompanyInsightResponse)
def get_insight(ticker: str, db: Session = Depends(get_db)):
    insight = insight_service.get_insight(db, ticker)
    if not insight:
        # Return a stub — status="none" signals "not generated yet" to the frontend
        return CompanyInsightResponse(
            id=None,
            ticker=ticker.upper(),
            company_id=None,
            llm_config_id=None,
            status="none",
            content=None,
            error_message=None,
            generated_at=None,
            created_at=datetime.now(timezone.utc),
        )
    return CompanyInsightResponse.model_validate(insight)


@router.post("/{ticker}", response_model=CompanyInsightResponse)
async def generate_insight(ticker: str, data: GenerateInsightRequest, db: Session = Depends(get_db)):
    try:
        insight = insight_service.generate_insight(db, ticker, data.llm_config_id, force=data.force)
        return CompanyInsightResponse.model_validate(insight)
    except ValueError as e:
        raise HTTPException(400, str(e))
