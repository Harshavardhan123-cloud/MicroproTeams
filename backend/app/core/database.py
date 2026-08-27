import os
import socket
from typing import AsyncGenerator
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings

def is_db_reachable(db_url: str) -> bool:
    """Check if the database host and port are reachable."""
    if "sqlite" in db_url:
        return True
    try:
        parts = db_url.split("@")[-1].split("/")[0].split(":")
        host = parts[0]
        port = int(parts[1]) if len(parts) > 1 else 5432
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.5)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception:
        return False

# Determine final Database URL: PostgreSQL if online, else SQLite fallback
if is_db_reachable(settings.DATABASE_URL):
    effective_db_url = settings.DATABASE_URL
else:
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "teams_local.db")
    effective_db_url = f"sqlite+aiosqlite:///{db_path}"
    print(f"ℹ️ PostgreSQL server offline/unreachable. Falling back to embedded database: {effective_db_url}")

engine = create_async_engine(
    effective_db_url,
    echo=False,
    future=True,
    pool_pre_ping=True
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

def sync_db_schema_sync(sync_conn):
    """Sync missing columns on existing SQLite/Postgres tables dynamically."""
    try:
        inspector = inspect(sync_conn)
        existing_tables = inspector.get_table_names()
        
        for table_name, table in Base.metadata.tables.items():
            if table_name in existing_tables:
                existing_cols = {c['name'] for c in inspector.get_columns(table_name)}
                for col in table.columns:
                    if col.name not in existing_cols:
                        col_type = col.type.compile(sync_conn.dialect)
                        sql = f'ALTER TABLE "{table_name}" ADD COLUMN "{col.name}" {col_type}'
                        try:
                            sync_conn.execute(text(sql))
                            print(f"✨ Auto-migrated: Added missing column '{col.name}' to table '{table_name}'")
                        except Exception as e:
                            print(f"Note: Could not add column '{col.name}' to '{table_name}': {e}")
    except Exception as e:
        print(f"Schema sync note: {e}")

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(sync_db_schema_sync)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
