import os
import re
import logging
from fastapi import FastAPI, Depends
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
    calls, meetings_signaling
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
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "null",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Static Files Directory
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

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

@app.get("/api/v1/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT
    }
