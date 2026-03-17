from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class File(Base):
    __tablename__ = "files"

    name: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    path: Mapped[str] = mapped_column(String(1000), nullable=False, index=True)
    bucket: Mapped[str] = mapped_column(String(100), default="ssc-reports")
    content_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
