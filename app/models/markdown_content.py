from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class MarkdownContent(Base):
    __tablename__ = "markdown_contents"

    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    conversion_job_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("conversion_jobs.id", ondelete="SET NULL"), index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    model_name: Mapped[str | None] = mapped_column(String(200))

    document = relationship("Document", back_populates="markdown")
