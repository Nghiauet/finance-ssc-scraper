from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class LLMConfigCreate(BaseModel):
    name: str
    base_url: str
    model_name: str
    api_key: str
    max_tokens: int = 4096
    is_default: bool = False
    config_type: Literal["vision", "embedding"] = "vision"
    embedding_dimension: int | None = None  # only for embedding type


class LLMConfigUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    model_name: str | None = None
    api_key: str | None = None
    max_tokens: int | None = None
    is_default: bool | None = None
    config_type: Literal["vision", "embedding"] | None = None
    embedding_dimension: int | None = None


class LLMConfigTestEndpoint(BaseModel):
    base_url: str
    model_name: str
    api_key: str
    config_type: Literal["vision", "embedding"] = "vision"


class LLMConfigResponse(BaseModel):
    id: str
    name: str
    base_url: str
    model_name: str
    max_tokens: int
    is_default: bool
    config_type: str
    embedding_dimension: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
