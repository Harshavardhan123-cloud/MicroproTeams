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
    calls, meetings_signaling, recordings, meeting_ai, admin, organization_units
)
from app.services.seed import seed_data
from app.services.file_service import UPLOAD_DIR

import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from app.core.response import error_response

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    
    # In production, do not automatically seed demo accounts unless explicitly configured
    if settings.ENVIRONMENT == "development" or settings.SEED_DEMO_DATA:
        try:
            await seed_data()
        except Exception as e:
            logging.getLogger("uvicorn.error").warning(f"Seed note: {e}")
        
    yield
    await close_redis()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/v1/openapi.json",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.exception_handler(Exception)
async def global_unhandled_exception_handler(request: Request, exc: Exception):
    req_id = getattr(request.state, "request_id", "unknown")
    logging.getLogger("uvicorn.error").error(
        f"Unhandled Exception [Request-ID: {req_id}] on {request.method} {request.url.path}: {exc}",
        exc_info=True
    )
    return error_response(
        "INTERNAL_SERVER_ERROR",
        "An unexpected error occurred. Please contact support with the request ID.",
        status_code=500
    )

class SecurityAndTracingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = req_id

        response = await call_next(request)

        response.headers["X-Request-ID"] = req_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityAndTracingMiddleware)

cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if cors_origins else ["*"],
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
    clean_name = os.path.basename(file_name)
    if ".." in file_name or "/" in file_name or "\\" in file_name:
        raise HTTPException(status_code=400, detail="Invalid file path")
    canonical_upload_dir = os.path.realpath(UPLOAD_DIR)
    target_path = os.path.realpath(os.path.join(UPLOAD_DIR, clean_name))
    if not target_path.startswith(canonical_upload_dir):
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Extension fallback check if direct path doesn't exist (e.g., UUID without extension or legacy original filename)
    if not os.path.exists(target_path):
        base_name = clean_name
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
app.include_router(organization_units.router, prefix="/api/v1")
app.include_router(organization_units.alias_router, prefix="/api/v1")


from sqlalchemy import text
from app.core.database import AsyncSessionLocal
from fastapi import Query
from fastapi.responses import JSONResponse

@app.get("/api/v1/health")
@app.get("/api/v1/health/liveness")
async def health_check(deep: bool = Query(False)):
    status_info = {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT
    }
    if deep:
        db_ok = False
        try:
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
                db_ok = True
        except Exception as e:
            logging.getLogger("uvicorn.error").warning(f"Health check DB probe error: {e}")

        redis_ok = False
        try:
            r = await get_redis()
            if hasattr(r, "ping"):
                await r.ping()
            redis_ok = True
        except Exception as e:
            logging.getLogger("uvicorn.error").warning(f"Health check Redis probe error: {e}")

        status_info["checks"] = {
            "database": "connected" if db_ok else "unreachable",
            "redis": "connected" if redis_ok else "unreachable"
        }
        if not db_ok:
            status_info["status"] = "degraded" if settings.ENVIRONMENT == "development" else "unhealthy"
            return JSONResponse(status_code=503 if settings.ENVIRONMENT == "production" else 200, content=status_info)

    return status_info

@app.get("/api/v1/health/readiness")
async def readiness_check():
    return await health_check(deep=True)
