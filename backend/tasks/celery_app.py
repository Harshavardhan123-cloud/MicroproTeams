"""
Celery application and AI tasks — Whisper transcription, LangChain meeting notes.
"""
from celery import Celery
from core.config import settings

celery_app = Celery(
    "microproteams",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "tasks.ai_tasks.*": {"queue": "ai_tasks"},
        "tasks.*": {"queue": "default"},
    },
)

celery_app.autodiscover_tasks(["tasks"])
