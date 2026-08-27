import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
