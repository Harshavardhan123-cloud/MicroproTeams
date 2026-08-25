"""
Files API — upload, download, list files via MinIO.
"""
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta

from core.database import get_db
from core.dependencies import CurrentUser
from core.config import settings

router = APIRouter()


class FileResponse(BaseModel):
    id: str
    file_name: str
    file_size: int
    mime_type: str
    storage_path: str
    download_url: str
    created_at: datetime


@router.post("/upload", status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    channel_id: Optional[str] = Query(None),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    """Upload a file to MinIO and return a pre-signed download URL."""
    from minio import Minio
    import io

    client = Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )

    # Ensure bucket exists
    if not client.bucket_exists(settings.MINIO_BUCKET_FILES):
        client.make_bucket(settings.MINIO_BUCKET_FILES)

    file_id = str(uuid.uuid4())
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    object_name = f"{current_user.id}/{file_id}.{ext}" if ext else f"{current_user.id}/{file_id}"

    content = await file.read()
    client.put_object(
        settings.MINIO_BUCKET_FILES,
        object_name,
        io.BytesIO(content),
        length=len(content),
        content_type=file.content_type or "application/octet-stream",
    )

    # Presigned URL valid for 7 days
    download_url = client.presigned_get_object(
        settings.MINIO_BUCKET_FILES,
        object_name,
        expires=timedelta(days=7),
    )

    return {
        "id": file_id,
        "file_name": file.filename,
        "file_size": len(content),
        "mime_type": file.content_type,
        "storage_path": object_name,
        "download_url": download_url,
    }


@router.get("/presigned/{object_name:path}")
async def get_presigned_url(object_name: str, current_user: CurrentUser):
    """Get a fresh presigned URL for a file."""
    from minio import Minio
    client = Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )
    url = client.presigned_get_object(settings.MINIO_BUCKET_FILES, object_name, expires=timedelta(hours=1))
    return {"url": url}
