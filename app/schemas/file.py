from datetime import datetime
from pydantic import BaseModel


class FileResponse(BaseModel):
    id: str
    name: str
    path: str
    bucket: str
    content_type: str | None
    size_bytes: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
