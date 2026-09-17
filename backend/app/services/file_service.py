import os
import time
import uuid
import shutil
import hashlib
import hmac
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.models.models import (
    FileRecord, FileVersion, FileActivity, FilePermission, FileShare,
    FileStatus, FileVisibility, User
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

SIGNED_URL_TTL_SECONDS = 900

def _sign_file_url(file_id: str, expires: int) -> str:
    message = f"{file_id}:{expires}".encode()
    return hmac.new(settings.JWT_SECRET.encode(), message, hashlib.sha256).hexdigest()

class FileService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def format_file(self, f: FileRecord) -> dict:
        ver_res = await self.db.execute(select(FileVersion).where(FileVersion.file_id == f.id))
        versions_list = ver_res.scalars().all()
        return {
            "id": str(f.id),
            "organization_id": str(f.organization_id),
            "owner_id": str(f.owner_id),
            "name": f.name,
            "original_name": f.original_name,
            "mime_type": f.mime_type,
            "extension": f.extension,
            "size": f.size,
            "status": f.status,
            "visibility": f.visibility,
            "storage_key": f.storage_key,
            "file_url": f"/uploads/{f.storage_key}",
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "updated_at": f.updated_at.isoformat() if f.updated_at else None,
            "deleted_at": f.deleted_at.isoformat() if f.deleted_at else None,
            "version_count": len(versions_list) if versions_list else 1
        }

    async def save_file_record(
        self,
        file: UploadFile,
        user: User,
        visibility: FileVisibility = FileVisibility.ORGANIZATION
    ) -> dict:
        raw_filename = file.filename or "file"
        clean_filename = os.path.basename(raw_filename)
        ext = os.path.splitext(clean_filename)[1].lstrip('.').lower() or "bin"
        unique_key = f"{uuid.uuid4()}.{ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_key)

        max_allowed_bytes = settings.MAX_FILE_UPLOAD_SIZE_MB * 1024 * 1024
        if file.size and file.size > max_allowed_bytes:
            raise ValueError(f"File size exceeds maximum allowed limit of {settings.MAX_FILE_UPLOAD_SIZE_MB}MB")

        await file.seek(0)
        file_bytes = await file.read()
        file_size = len(file_bytes)
        if file_size > max_allowed_bytes:
            raise ValueError(f"File size exceeds maximum allowed limit of {settings.MAX_FILE_UPLOAD_SIZE_MB}MB")

        import base64
        b64_data = base64.b64encode(file_bytes).decode('utf-8')
        checksum = hashlib.sha256(file_bytes).hexdigest()

        try:
            with open(file_path, "wb") as buffer:
                buffer.write(file_bytes)
        except Exception:
            pass

        file_rec = FileRecord(
            organization_id=user.organization_id,
            owner_id=user.id,
            name=clean_filename,
            original_name=clean_filename,
            mime_type=file.content_type or "application/octet-stream",
            extension=ext,
            size=file_size,
            storage_key=unique_key,
            file_data=file_bytes,
            base64_data=b64_data,
            checksum=checksum,
            status=FileStatus.READY,
            visibility=visibility
        )
        self.db.add(file_rec)
        await self.db.commit()
        await self.db.refresh(file_rec)

        version = FileVersion(
            file_id=file_rec.id,
            version_number=1,
            storage_key=unique_key,
            size=file_size,
            checksum=checksum,
            mime_type=file_rec.mime_type,
            uploaded_by=user.id
        )
        self.db.add(version)
        file_rec.current_version_id = version.id
        await self.db.commit()

        await self.log_activity(file_rec.id, user.id, "UPLOADED", {"filename": file.filename})
        return await self.format_file(file_rec)

    async def upload_new_version(self, file_id: str, file: UploadFile, user: User) -> Optional[dict]:
        file_rec = await self.get_by_id(file_id)
        if not file_rec or file_rec.deleted_at is not None or str(file_rec.organization_id) != str(user.organization_id):
            return None

        ver_res = await self.db.execute(select(FileVersion).where(FileVersion.file_id == file_id))
        existing_versions = ver_res.scalars().all()
        next_version_num = len(existing_versions) + 1

        ext = os.path.splitext(file.filename)[1].lstrip('.').lower() or "bin"
        unique_key = f"{uuid.uuid4()}.{ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_key)

        hasher = hashlib.sha256()
        with open(file_path, "wb") as buffer:
            while chunk := file.file.read(8192):
                hasher.update(chunk)
                buffer.write(chunk)

        file_size = os.path.getsize(file_path)
        checksum = hasher.hexdigest()

        version = FileVersion(
            file_id=file_rec.id,
            version_number=next_version_num,
            storage_key=unique_key,
            size=file_size,
            checksum=checksum,
            mime_type=file.content_type or file_rec.mime_type,
            uploaded_by=user.id
        )
        self.db.add(version)

        file_rec.storage_key = unique_key
        file_rec.size = file_size
        file_rec.mime_type = file.content_type or file_rec.mime_type
        file_rec.checksum = checksum
        file_rec.current_version_id = version.id

        await self.db.commit()
        await self.log_activity(file_rec.id, user.id, "VERSION_UPLOADED", {"version": next_version_num})
        
        updated = await self.get_by_id(file_id)
        return await self.format_file(updated)

    async def restore_version(self, file_id: str, version_id: str, user: User) -> Optional[dict]:
        file_rec = await self.get_by_id(file_id)
        if not file_rec or file_rec.deleted_at is not None or str(file_rec.organization_id) != str(user.organization_id):
            return None

        ver_res = await self.db.execute(
            select(FileVersion).where(FileVersion.id == version_id, FileVersion.file_id == file_id)
        )
        target_ver = ver_res.scalars().first()
        if not target_ver:
            return None

        all_ver_res = await self.db.execute(select(FileVersion).where(FileVersion.file_id == file_id))
        all_versions = all_ver_res.scalars().all()
        next_ver_num = len(all_versions) + 1

        ext = file_rec.extension
        new_key = f"{uuid.uuid4()}.{ext}"
        old_path = os.path.join(UPLOAD_DIR, target_ver.storage_key)
        new_path = os.path.join(UPLOAD_DIR, new_key)

        if os.path.exists(old_path):
            shutil.copyfile(old_path, new_path)

        new_ver = FileVersion(
            file_id=file_rec.id,
            version_number=next_ver_num,
            storage_key=new_key,
            size=target_ver.size,
            checksum=target_ver.checksum,
            mime_type=target_ver.mime_type,
            uploaded_by=user.id
        )
        self.db.add(new_ver)

        file_rec.storage_key = new_key
        file_rec.size = target_ver.size
        file_rec.checksum = target_ver.checksum
        file_rec.current_version_id = new_ver.id

        await self.db.commit()
        await self.log_activity(file_rec.id, user.id, "VERSION_RESTORED", {"restored_from": target_ver.version_number, "new_version": next_ver_num})
        
        updated = await self.get_by_id(file_id)
        return await self.format_file(updated)

    async def get_by_id(self, file_id: str) -> Optional[FileRecord]:
        res = await self.db.execute(select(FileRecord).where(FileRecord.id == file_id))
        return res.scalars().first()

    async def get_organization_files(self, org_id: str, limit: int = 50) -> List[dict]:
        res = await self.db.execute(
            select(FileRecord)
            .where(FileRecord.organization_id == org_id, FileRecord.deleted_at.is_(None))
            .order_by(FileRecord.created_at.desc())
            .limit(limit)
        )
        files = res.scalars().all()
        formatted = []
        for f in files:
            formatted.append(await self.format_file(f))
        return formatted

    async def get_trash_files(self, org_id: str) -> List[dict]:
        res = await self.db.execute(
            select(FileRecord)
            .where(FileRecord.organization_id == org_id, FileRecord.deleted_at.is_not(None))
            .order_by(FileRecord.deleted_at.desc())
        )
        files = res.scalars().all()
        formatted = []
        for f in files:
            formatted.append(await self.format_file(f))
        return formatted

    async def soft_delete(self, file_id: str, user: User) -> bool:
        f = await self.get_by_id(file_id)
        if not f or str(f.organization_id) != str(user.organization_id):
            return False

        f.deleted_at = datetime.utcnow()
        f.status = FileStatus.DELETED
        await self.db.commit()
        await self.log_activity(file_id, user.id, "DELETED")
        return True

    async def restore_file(self, file_id: str, user: User) -> bool:
        f = await self.get_by_id(file_id)
        if not f or str(f.organization_id) != str(user.organization_id):
            return False

        f.deleted_at = None
        f.status = FileStatus.READY
        await self.db.commit()
        await self.log_activity(file_id, user.id, "RESTORED")
        return True

    async def permanent_delete(self, file_id: str, user: User) -> bool:
        f = await self.get_by_id(file_id)
        if not f or str(f.organization_id) != str(user.organization_id):
            return False

        file_path = os.path.join(UPLOAD_DIR, f.storage_key)
        if os.path.exists(file_path):
            os.remove(file_path)

        await self.db.delete(f)
        await self.db.commit()
        return True

    async def generate_signed_url(self, file_id: str, user: User, action: str = "download") -> Optional[str]:
        f = await self.get_by_id(file_id)
        if not f or f.deleted_at is not None or str(f.organization_id) != str(user.organization_id):
            return None
        expires = int(time.time()) + SIGNED_URL_TTL_SECONDS
        sig = _sign_file_url(file_id, expires)
        return f"/api/v1/files/{file_id}/raw?action={action}&expires={expires}&sig={sig}"

    async def verify_signed_url(self, file_id: str, expires: int, sig: str) -> bool:
        if int(time.time()) > expires:
            return False
        return hmac.compare_digest(_sign_file_url(file_id, expires), sig)

    async def log_activity(self, file_id: str, user_id: str, action: str, metadata: Optional[dict] = None):
        import json
        activity = FileActivity(
            file_id=file_id,
            user_id=user_id,
            action=action,
            metadata_json=json.dumps(metadata) if metadata else None
        )
        self.db.add(activity)
        await self.db.commit()
