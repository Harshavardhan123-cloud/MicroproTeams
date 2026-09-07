import logging
import os
import secrets as _secrets

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# pydantic-settings resolves a relative env_file against the process's current
# working directory, not this file's location — but run-local.sh launches
# uvicorn from backend/, one level below the project-root .env. A relative
# path here silently found nothing and fell back to the hardcoded defaults
# below for every setting, not just secrets (e.g. a 24h token lifetime instead
# of .env's 60 minutes). Resolve it explicitly so it works from any cwd.
_ENV_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), ".env")

# Obviously-fake placeholders: used only if JWT_SECRET/JWT_REFRESH_SECRET are
# missing from the environment. A real deployment must set these via .env;
# each process gets its own random fallback so it's never a known/public value,
# but tokens won't survive a restart (multi-worker/reload setups will disagree).
_FALLBACK_JWT_SECRET = f"UNSET-DEV-ONLY-{_secrets.token_hex(32)}"
_FALLBACK_JWT_REFRESH_SECRET = f"UNSET-DEV-ONLY-{_secrets.token_hex(32)}"

class Settings(BaseSettings):
    PROJECT_NAME: str = "Enterprise Teams Platform"
    ENVIRONMENT: str = "development"

    # PostgreSQL
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "teams_user"
    POSTGRES_PASSWORD: str = "teams_password_secret"
    POSTGRES_DB: str = "teams_db"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str = "postgresql+asyncpg://teams_user:teams_password_secret@localhost:5432/teams_db"

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_URL: str = "redis://localhost:6379/0"

    # Security & Tokens
    JWT_SECRET: str = _FALLBACK_JWT_SECRET
    JWT_REFRESH_SECRET: str = _FALLBACK_JWT_REFRESH_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours for dev
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # MinIO / Object Storage
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET: str = "teams-uploads"
    S3_REGION: str = "us-east-1"

    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="allow")

settings = Settings()

if settings.JWT_SECRET == _FALLBACK_JWT_SECRET or settings.JWT_REFRESH_SECRET == _FALLBACK_JWT_REFRESH_SECRET:
    logger.warning(
        "JWT_SECRET/JWT_REFRESH_SECRET not set in the environment — using a random "
        "per-process fallback. Set them in .env (see .env.example) for stable sessions "
        "across restarts and before any real deployment."
    )
