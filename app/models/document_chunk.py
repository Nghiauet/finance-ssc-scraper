from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    markdown_content_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("markdown_contents.id", ondelete="SET NULL"), index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_heading: Mapped[str | None] = mapped_column(String(500))
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    # Note: embedding column added dynamically via pgvector in main.py lifespan
    # We store it as a raw column to avoid import issues when pgvector extension isn't loaded

    document = relationship("Document")
