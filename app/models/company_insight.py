from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class CompanyInsight(Base):
    __tablename__ = "company_insights"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), unique=True, index=True
    )
    ticker: Mapped[str] = mapped_column(String(20), index=True)
    llm_config_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("llm_configs.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    content: Mapped[dict | None] = mapped_column(JSON)
    # content shape: {"sections": [{"title": "...", "content": "..."}]}
    error_message: Mapped[str | None] = mapped_column(Text)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    company = relationship("Company", back_populates="insight")
    llm_config = relationship("LLMConfig")
