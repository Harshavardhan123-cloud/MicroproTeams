import socket
import redis.asyncio as redis
from app.core.config import settings

class MockRedis:
    """Fallback in-memory storage when Redis server is offline."""
    def __init__(self):
        self._data = {}

    async def get(self, key: str):
        return self._data.get(key)

    async def set(self, key: str, value: str, ex: int = None):
        self._data[key] = value
        return True

    async def delete(self, key: str):
        self._data.pop(key, None)
        return True

    async def close(self):
        pass

redis_client = None

def is_redis_reachable() -> bool:
    try:
        parts = settings.REDIS_URL.split("//")[-1].split("/")[0].split(":")
        host = parts[0]
        port = int(parts[1]) if len(parts) > 1 else 6379
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.0)
        res = sock.connect_ex((host, port))
        sock.close()
        return res == 0
    except Exception:
        return False

async def get_redis():
    global redis_client
    if redis_client is None:
        if is_redis_reachable():
            redis_client = redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
        else:
            redis_client = MockRedis()
    return redis_client

async def close_redis():
    global redis_client
    if redis_client:
        await redis_client.close()
        redis_client = None
