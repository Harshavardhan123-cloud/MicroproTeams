"""
MicroproTeams — FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from core.config import settings
from core.database import engine, Base
from api.router import api_router
from websocket_server import sio_app, shutdown_redis

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    log.info("MicroproTeams API starting", version="1.0.0")
    # Create DB tables (use Alembic for production migrations)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("Database tables initialized")
    yield
    log.info("MicroproTeams API shutting down")
    await shutdown_redis()
    await engine.dispose()


app = FastAPI(
    title="MicroproTeams API",
    description="Enterprise communication platform API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── Middleware ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)

# ── Prometheus Metrics ──────────────────────────────────────────────
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# ── API Routes ──────────────────────────────────────────────────────
app.include_router(api_router, prefix="/api/v1")

# ── Mount Socket.io ─────────────────────────────────────────────────
app.mount("/ws", sio_app)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "MicroproTeams API", "version": "1.0.0"}
