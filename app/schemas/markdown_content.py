from datetime import datetime

from pydantic import BaseModel


class MarkdownContentResponse(BaseModel):
    id: str
    document_id: str
    content: str
    page_count: int
    model_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
