"""
Application Configuration — all settings via environment variables.
"""
import socket
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "MicroproTeams"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION"
    API_SECRET: str = "api_secret"

    # CORS / Hosts
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]
    ALLOWED_HOSTS: List[str] = ["*"]

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://micropro:micropro_secret@localhost:5432/microproteams"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def resolve_db_host(cls, v: str) -> str:
        if isinstance(v, str) and "@postgres:" in v:
            try:
                socket.gethostbyname("postgres")
            except socket.gaierror:
                v = v.replace("@postgres:", "@localhost:")
        return v

    # Redis
    REDIS_URL: str = "redis://:redis_secret@localhost:6379/0"
    REDIS_PASSWORD: str = "redis_secret"

    @field_validator("REDIS_URL", mode="before")
    @classmethod
    def resolve_redis_host(cls, v: str) -> str:
        if isinstance(v, str):
            if "@redis:" in v or "//redis:" in v:
                try:
                    socket.gethostbyname("redis")
                except socket.gaierror:
                    v = v.replace("@redis:", "@localhost:").replace("//redis:", "//localhost:")
        return v

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin_secret"
    MINIO_SECURE: bool = False
    MINIO_BUCKET_FILES: str = "micropro-files"
    MINIO_BUCKET_RECORDINGS: str = "micropro-recordings"
    MINIO_BUCKET_AVATARS: str = "micropro-avatars"

    # Auth / JWT
    JWT_SECRET: str = "CHANGE_ME_JWT_SECRET"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Keycloak
    KEYCLOAK_URL: str = "http://localhost:8080"
    KEYCLOAK_REALM: str = "microproteams"
    KEYCLOAK_CLIENT_ID: str = "micropro-api"
    KEYCLOAK_CLIENT_SECRET: str = "CHANGE_ME_KC_SECRET"

    # AI Provider ("ollama" | "whisper" | "openai")
    AI_PROVIDER: str = "ollama"

    # Ollama (primary)
    OLLAMA_BASE_URL: str = "http://192.168.1.199:11434"
    OLLAMA_MODEL: str = "llama3.1"
    OLLAMA_EMBED_MODEL: str = "nomic-embed-text"

    # Whisper (transcription fallback)
    WHISPER_MODEL: str = "base"  # tiny, base, small, medium, large
    WHISPER_DEVICE: str = "cpu"  # cpu or cuda
    WHISPER_LANGUAGE: str = "en"
    HF_TOKEN: str = ""  # HuggingFace token for pyannote

    # E2E Encryption
    E2E_MASTER_KEY: str = "CHANGE_ME_E2E_MASTER_KEY_32BYTES"

    # mediasoup
    MEDIASOUP_URL: str = "http://localhost:3000"

    # Server
    SERVER_IP: str = "127.0.0.1"


settings = Settings()
