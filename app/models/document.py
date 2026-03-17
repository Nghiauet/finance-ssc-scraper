from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Document(Base):
    __tablename__ = "documents"

    company_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="SET NULL"), index=True
    )
    file_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("files.id", ondelete="SET NULL"), index=True
    )
    scrape_job_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("scrape_jobs.id", ondelete="SET NULL"), index=True
    )

    ticker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    exchange: Mapped[str | None] = mapped_column(String(20))
    report_name: Mapped[str] = mapped_column(String(500), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text)
    submission_date: Mapped[date | None] = mapped_column(Date)
    ssc_download_url: Mapped[str | None] = mapped_column(String(1000))

    # Parsed classification
    report_type: Mapped[str | None] = mapped_column(String(20))   # rieng, hop_nhat, me, tong_hop
    report_period: Mapped[str | None] = mapped_column(String(20)) # nam, ban_nien, quy
    year: Mapped[int | None] = mapped_column(Integer)
    quarter: Mapped[int | None] = mapped_column(Integer)

    company = relationship("Company", back_populates="documents")
    file = relationship("File")
    scrape_job = relationship("ScrapeJob", back_populates="documents")
