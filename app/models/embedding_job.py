from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class EmbeddingJob(Base):
    __tablename__ = "embedding_jobs"

    document_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="SET NULL"), index=True
    )
    llm_config_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("llm_configs.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    total_chunks: Mapped[int] = mapped_column(Integer, default=0)
    chunks_processed: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    document = relationship("Document")
    llm_config = relationship("LLMConfig")
