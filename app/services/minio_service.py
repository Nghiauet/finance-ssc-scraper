import io
from datetime import timedelta
from pathlib import Path

from minio import Minio

from app.config import settings


class MinIOService:
    def __init__(self):
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self.bucket = settings.minio_bucket

    def ensure_bucket(self):
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    def upload_file(self, object_name: str, file_path: str, content_type: str = "application/octet-stream") -> str:
        self.client.fput_object(self.bucket, object_name, file_path, content_type=content_type)
        return object_name

    def upload_bytes(self, object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        self.client.put_object(self.bucket, object_name, io.BytesIO(data), len(data), content_type=content_type)
        return object_name

    def get_presigned_url(self, object_name: str, expires: timedelta = timedelta(hours=1)) -> str:
        return self.client.presigned_get_object(self.bucket, object_name, expires=expires)

    def get_object(self, object_name: str, bucket: str | None = None):
        return self.client.get_object(bucket or self.bucket, object_name)

    def delete_object(self, object_name: str, bucket: str | None = None):
        self.client.remove_object(bucket or self.bucket, object_name)

    def stat_object(self, object_name: str):
        return self.client.stat_object(self.bucket, object_name)

    def healthy(self) -> bool:
        try:
            self.client.list_buckets()
            return True
        except Exception:
            return False

    def get_content_type(self, filename: str) -> str:
        ext = Path(filename).suffix.lower()
        return {
            ".pdf": "application/pdf",
            ".xls": "application/vnd.ms-excel",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".doc": "application/msword",
            ".zip": "application/zip",
        }.get(ext, "application/octet-stream")


minio_service = MinIOService()
