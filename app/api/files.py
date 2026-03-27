from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import File
from app.schemas.file import FileResponse
from app.services.file_stream import stream_stored_file

router = APIRouter(prefix="/files", tags=["files"])


def get_file_or_404(file_id: str, db: Session) -> File:
    file = db.query(File).get(file_id)
    if not file:
        raise HTTPException(404, "File not found")
    return file


@router.get("/{file_id}", response_model=FileResponse)
def get_file(file_id: str, db: Session = Depends(get_db)):
    return FileResponse.model_validate(get_file_or_404(file_id, db))


@router.get("/{file_id}/content")
def view_file(file_id: str, db: Session = Depends(get_db)):
    return stream_stored_file(get_file_or_404(file_id, db), disposition_type="inline")


@router.get("/{file_id}/download")
def download_file(file_id: str, db: Session = Depends(get_db)):
    return stream_stored_file(get_file_or_404(file_id, db), disposition_type="attachment")
