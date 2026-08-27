import os
from typing import Optional, List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import User, FileRecord, FileVersion, FileActivity
from app.services.file_service import FileService, UPLOAD_DIR
from app.core.response import success_response, error_response
from sqlalchemy.future import select

router = APIRouter(prefix="/files", tags=["Files"])

class RenameFileRequest(BaseModel):
    name: str

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not file:
        return error_response("NO_FILE", "No file provided.", status_code=400)

    svc = FileService(db)
    res = await svc.save_file_record(file, current_user)
    return success_response(res)

@router.get("")
async def list_files(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    files = await svc.get_organization_files(str(current_user.organization_id), limit)
    return success_response(files)

@router.get("/recent")
async def list_recent_files(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    files = await svc.get_organization_files(str(current_user.organization_id), limit=15)
    return success_response(files)

@router.get("/trash")
async def list_trash_files(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    files = await svc.get_trash_files(str(current_user.organization_id))
    return success_response(files)

@router.get("/search")
async def search_files(
    q: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(FileRecord).where(
            FileRecord.organization_id == current_user.organization_id,
            FileRecord.deleted_at.is_(None),
            FileRecord.name.ilike(f"%{q}%")
        )
    )
    files = res.scalars().all()
    svc = FileService(db)
    formatted = []
    for f in files:
        formatted.append(await svc.format_file(f))
    return success_response(formatted)

@router.get("/{file_id}")
async def get_file_details(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    f = await svc.get_by_id(file_id)
    if not f or str(f.organization_id) != str(current_user.organization_id):
        return error_response("NOT_FOUND", "File not found.", status_code=404)
    return success_response(await svc.format_file(f))

@router.patch("/{file_id}")
async def rename_file(
    file_id: str,
    req: RenameFileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    f = await svc.get_by_id(file_id)
    if not f or str(f.organization_id) != str(current_user.organization_id):
        return error_response("NOT_FOUND", "File not found.", status_code=404)

    f.name = req.name
    await db.commit()
    await svc.log_activity(file_id, current_user.id, "RENAMED", {"new_name": req.name})
    return success_response(await svc.format_file(f))

@router.delete("/{file_id}")
async def soft_delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    deleted = await svc.soft_delete(file_id, current_user)
    if not deleted:
        return error_response("NOT_FOUND", "File not found or permission denied.", status_code=404)
    return success_response({"message": "File moved to trash."})

@router.post("/{file_id}/restore")
async def restore_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    restored = await svc.restore_file(file_id, current_user)
    if not restored:
        return error_response("NOT_FOUND", "File not found or permission denied.", status_code=404)
    return success_response({"message": "File restored successfully."})

@router.post("/{file_id}/permanent-delete")
async def permanent_delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    deleted = await svc.permanent_delete(file_id, current_user)
    if not deleted:
        return error_response("NOT_FOUND", "File not found or permission denied.", status_code=404)
    return success_response({"message": "File permanently deleted."})

@router.get("/{file_id}/download-url")
async def get_download_url(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    url = await svc.generate_signed_url(file_id, current_user, "download")
    if not url:
        return error_response("NOT_FOUND", "File not found.", status_code=404)
    await svc.log_activity(file_id, current_user.id, "DOWNLOADED")
    return success_response({"download_url": url, "expires_in_seconds": 900})

@router.get("/{file_id}/preview-url")
async def get_preview_url(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    url = await svc.generate_signed_url(file_id, current_user, "preview")
    if not url:
        return error_response("NOT_FOUND", "File not found.", status_code=404)
    await svc.log_activity(file_id, current_user.id, "VIEWED")
    return success_response({"preview_url": url, "expires_in_seconds": 900})

@router.get("/{file_id}/raw")
async def get_file_raw(
    file_id: str,
    expires: int = Query(...),
    sig: str = Query(...),
    action: str = Query("download"),
    db: AsyncSession = Depends(get_db)
):
    """Serves file content for a signed URL minted by /download-url or
    /preview-url. Deliberately has no auth dependency of its own — like a
    real presigned URL, access control comes entirely from the HMAC
    signature + expiry, not from the caller's session."""
    svc = FileService(db)
    if not await svc.verify_signed_url(file_id, expires, sig):
        raise HTTPException(status_code=403, detail="Invalid or expired link.")

    f = await svc.get_by_id(file_id)
    if not f or f.deleted_at is not None:
        raise HTTPException(status_code=404, detail="File not found.")

    file_path = os.path.join(UPLOAD_DIR, f.storage_key)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File content missing.")

    return FileResponse(
        file_path,
        media_type=f.mime_type,
        filename=f.original_name if action == "download" else None
    )

@router.get("/{file_id}/versions")
async def get_file_versions(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    f = await svc.get_by_id(file_id)
    if not f or str(f.organization_id) != str(current_user.organization_id):
        return error_response("NOT_FOUND", "File not found.", status_code=404)

    res = await db.execute(
        select(FileVersion).where(FileVersion.file_id == file_id).order_by(FileVersion.version_number.desc())
    )
    versions = res.scalars().all()
    data = [
        {
            "id": str(v.id),
            "version_number": v.version_number,
            "size": v.size,
            "checksum": v.checksum,
            "mime_type": v.mime_type,
            "uploaded_by": str(v.uploaded_by),
            "created_at": v.created_at.isoformat() if v.created_at else None
        }
        for v in versions
    ]
    return success_response(data)

@router.post("/{file_id}/versions")
async def upload_new_file_version(
    file_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    updated = await svc.upload_new_version(file_id, file, current_user)
    if not updated:
        return error_response("NOT_FOUND", "File not found or soft-deleted.", status_code=404)
    return success_response(updated)

@router.post("/{file_id}/versions/{version_id}/restore")
async def restore_file_version(
    file_id: str,
    version_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    restored = await svc.restore_version(file_id, version_id, current_user)
    if not restored:
        return error_response("NOT_FOUND", "File or version not found.", status_code=404)
    return success_response(restored)

@router.get("/{file_id}/activity")
async def get_file_activity(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = FileService(db)
    f = await svc.get_by_id(file_id)
    if not f or str(f.organization_id) != str(current_user.organization_id):
        return error_response("NOT_FOUND", "File not found.", status_code=404)

    res = await db.execute(
        select(FileActivity).where(FileActivity.file_id == file_id).order_by(FileActivity.created_at.desc())
    )
    activities = res.scalars().all()
    data = [
        {
            "id": str(a.id),
            "action": a.action,
            "user_id": str(a.user_id),
            "metadata": a.metadata_json,
            "created_at": a.created_at.isoformat() if a.created_at else None
        }
        for a in activities
    ]
    return success_response(data)
