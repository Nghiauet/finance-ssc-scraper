from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LLMConfig(Base):
    __tablename__ = "llm_configs"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    model_name: Mapped[str] = mapped_column(String(200), nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    max_tokens: Mapped[int] = mapped_column(Integer, default=4096)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    config_type: Mapped[str] = mapped_column(String(20), default="vision")  # vision | embedding
    embedding_dimension: Mapped[int | None] = mapped_column(Integer, nullable=True)  # only for embedding type
