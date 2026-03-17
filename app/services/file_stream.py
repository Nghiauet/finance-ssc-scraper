from urllib.parse import quote

from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from app.models.file import File
from app.services.minio_service import minio_service

INLINE_CONTENT_TYPES = {"application/pdf"}


def file_supports_inline_view(file: File) -> bool:
    return (file.content_type or "").lower() in INLINE_CONTENT_TYPES


def stream_stored_file(file: File, disposition_type: str = "inline") -> StreamingResponse:
    minio_response = minio_service.get_object(file.path, bucket=file.bucket)
    headers = {"Content-Disposition": build_content_disposition(file.name, disposition_type)}

    return StreamingResponse(
        minio_response,
        media_type=file.content_type or "application/octet-stream",
        headers=headers,
        background=BackgroundTask(close_minio_response, minio_response),
    )


def build_content_disposition(filename: str, disposition_type: str) -> str:
    safe_filename = filename.replace('"', "")
    return (
        f'{disposition_type}; filename="{safe_filename}"; '
        f"filename*=UTF-8''{quote(safe_filename)}"
    )


def close_minio_response(minio_response) -> None:
    minio_response.close()
    minio_response.release_conn()
