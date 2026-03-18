from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ScrapeJob(Base):
    __tablename__ = "scrape_jobs"

    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    ticker: Mapped[str | None] = mapped_column(String(20))
    from_date: Mapped[str | None] = mapped_column(String(20))
    to_date: Mapped[str | None] = mapped_column(String(20))
    max_pages: Mapped[int | None] = mapped_column(Integer)
    download_files: Mapped[bool] = mapped_column(Boolean, default=True)

    total_reports_found: Mapped[int] = mapped_column(Integer, default=0)
    total_files_downloaded: Mapped[int] = mapped_column(Integer, default=0)
    total_pages_scraped: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    documents = relationship("Document", back_populates="scrape_job", lazy="dynamic")
