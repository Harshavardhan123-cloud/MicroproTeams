import os
import re
import logging
from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter

class _RedactSensitiveQueryParamsFilter(logging.Filter):
    """Uvicorn's access log prints the full request path, including query
    strings — our WebSocket endpoints authenticate via ?token=... (browsers
    can't set headers on the WebSocket handshake), which would otherwise land
    in backend.log in plaintext on every connection."""
    _pattern = re.compile(r'(token|sig)=[^&\s"]+', re.IGNORECASE)

    def _redact(self, value):
        return self._pattern.sub(r'\1=***REDACTED***', value) if isinstance(value, str) else value

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(self._redact(a) for a in record.args)
        record.msg = self._redact(record.msg) if isinstance(record.msg, str) else record.msg
        return True

logging.getLogger("uvicorn.access").addFilter(_RedactSensitiveQueryParamsFilter())

from app.core.config import settings
from app.core.database import engine, Base, init_db
from app.core.redis import get_redis, close_redis
from app.api.v1 import (
    auth, users, teams, channels, messages, websocket, files,
    direct_messages, search, audit_logs, meetings, calendar, notifications,
    calls, meetings_signaling, recordings, meeting_ai, admin
)
from app.services.seed import seed_data
from app.services.file_service import UPLOAD_DIR

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    
    try:
        await seed_data()
    except Exception as e:
        print(f"Seed note: {e}")
        
    yield
    await close_redis()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/v1/openapi.json",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# The app authenticates via a Bearer token (not cookies), so credentialed CORS
# isn't needed; combining a wildcard origin with allow_credentials=True would let
# any site make authenticated cross-origin requests on a logged-in user's behalf.
# "null" covers Electron's packaged app, which loads its UI from a file:// page.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Depends
from fastapi.responses import Response, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.models import FileRecord, MessageAttachment
from sqlalchemy.future import select

@app.api_route("/uploads/{file_name:path}", methods=["GET", "HEAD"])
async def serve_upload_file(
    file_name: str,
    download: int = 0,
    db: AsyncSession = Depends(get_db)
):
    # 1. Try DB lookup first (BLOB/TOAST storage in DB)
    try:
        import urllib.parse
        base_name = os.path.basename(file_name)
        decoded_name = urllib.parse.unquote(base_name)
        res = await db.execute(
            select(FileRecord).where(
                (FileRecord.storage_key == base_name) |
                (FileRecord.storage_key == decoded_name) |
                (FileRecord.name == base_name) |
                (FileRecord.name == decoded_name) |
                (FileRecord.original_name == base_name) |
                (FileRecord.original_name == decoded_name)
            )
        )
        rec = res.scalars().first()
        if rec and (rec.file_data or rec.base64_data):
            data_bytes = rec.file_data
            if not data_bytes and rec.base64_data:
                import base64
                data_bytes = base64.b64decode(rec.base64_data)
            final_bytes = bytes(data_bytes) if isinstance(data_bytes, (bytes, memoryview, bytearray)) else str(data_bytes).encode('utf-8')
            headers = {"Access-Control-Allow-Origin": "*"}
            if download == 1 or download:
                headers["Content-Disposition"] = f'attachment; filename="{rec.original_name or rec.name}"'
            return Response(content=final_bytes, media_type=rec.mime_type or "application/octet-stream", headers=headers)

        res_att = await db.execute(
            select(MessageAttachment).where(
                (MessageAttachment.display_name == base_name) |
                (MessageAttachment.display_name == decoded_name) |
                (MessageAttachment.file_url.endswith(base_name)) |
                (MessageAttachment.file_url.endswith(decoded_name))
            )
        )
        att = res_att.scalars().first()
        if att and (att.file_data or att.base64_data):
            data_bytes = att.file_data
            if not data_bytes and att.base64_data:
                import base64
                data_bytes = base64.b64decode(att.base64_data)
            final_bytes = bytes(data_bytes) if isinstance(data_bytes, (bytes, memoryview, bytearray)) else str(data_bytes).encode('utf-8')
            headers = {"Access-Control-Allow-Origin": "*"}
            if download == 1 or download:
                headers["Content-Disposition"] = f'attachment; filename="{att.display_name}"'
            return Response(content=final_bytes, media_type=att.mime_type or "application/octet-stream", headers=headers)
    except Exception as db_err:
        import traceback
        traceback.print_exc()

    # 2. Disk fallback if not in DB
    target_path = os.path.join(UPLOAD_DIR, file_name)

    # Extension fallback check if direct path doesn't exist (e.g., UUID without extension or legacy original filename)
    if not os.path.exists(target_path):
        base_name = os.path.basename(file_name)
        ext_target = os.path.splitext(base_name)[1].lower()
        if os.path.exists(UPLOAD_DIR):
            for candidate in os.listdir(UPLOAD_DIR):
                if candidate.startswith(base_name):
                    target_path = os.path.join(UPLOAD_DIR, candidate)
                    break
            if not os.path.exists(target_path) and ext_target:
                for candidate in sorted(os.listdir(UPLOAD_DIR), reverse=True):
                    if candidate.endswith(ext_target):
                        target_path = os.path.join(UPLOAD_DIR, candidate)
                        break

    if not os.path.exists(target_path) or not os.path.isfile(target_path):
        raise HTTPException(status_code=404, detail="File not found")

    ext = os.path.splitext(target_path)[1].lstrip('.').lower()
    mime_types = {
        "pdf": "application/pdf",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
        "svg": "image/svg+xml",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls": "application/vnd.ms-excel",
        "zip": "application/zip",
        "txt": "text/plain",
    }
    media_type = mime_types.get(ext, "application/octet-stream")
    filename_header = os.path.basename(target_path)

    return FileResponse(
        target_path,
        media_type=media_type,
        filename=filename_header if download == 1 else None,
        headers={"Access-Control-Allow-Origin": "*"}
    )

# Mount API Routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(teams.router, prefix="/api/v1")
app.include_router(channels.router, prefix="/api/v1")
app.include_router(messages.router, prefix="/api/v1")
app.include_router(files.router, prefix="/api/v1")
app.include_router(websocket.router, prefix="/api/v1")
app.include_router(direct_messages.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(audit_logs.router, prefix="/api/v1")
app.include_router(meetings.router, prefix="/api/v1")
app.include_router(calendar.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(calls.router, prefix="/api/v1")
app.include_router(meetings_signaling.router, prefix="/api/v1")
app.include_router(recordings.router, prefix="/api/v1")
app.include_router(meeting_ai.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT
    }
