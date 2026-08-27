from pydantic import ConfigDict
from pydantic_settings import BaseSettings

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
    JWT_SECRET: str = "super_secret_jwt_key_change_in_production_32bytes_min!"
    JWT_REFRESH_SECRET: str = "super_secret_refresh_jwt_key_change_in_production!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours for dev
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # MinIO / Object Storage
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET: str = "teams-uploads"
    S3_REGION: str = "us-east-1"

    model_config = ConfigDict(env_file=".env", extra="allow")

settings = Settings()
