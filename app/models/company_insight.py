from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class CompanyInsight(Base):
    __tablename__ = "company_insights"

    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    llm_config_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("llm_configs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    content: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # content shape: {"sections": [{"title": "...", "content": "..."}]}
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    company = relationship("Company", back_populates="insight")
    llm_config = relationship("LLMConfig")
