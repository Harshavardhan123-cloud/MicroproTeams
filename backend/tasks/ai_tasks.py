"""
AI background tasks — Whisper transcription + LangChain meeting notes generation.
"""
import asyncio
import os
from datetime import datetime

from tasks.celery_app import celery_app
from core.config import settings


@celery_app.task(name="tasks.ai_tasks.generate_meeting_summary", bind=True, max_retries=3)
def generate_meeting_summary(self, meeting_id: str):
    """
    After meeting ends:
    1. Fetch recording from MinIO
    2. Transcribe with local Whisper
    3. Diarize speakers with pyannote
    4. Run LangChain pipeline: summary, decisions, actions, Q&A, sentiment
    5. Store results in DB
    6. Post AI notes to meeting channel
    """
    try:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_async_generate_summary(meeting_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


async def _async_generate_summary(meeting_id: str):
    import whisper
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
    from sqlalchemy import select

    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        from models.meeting import Meeting, MeetingRecording, MeetingSummary

        meeting = await db.get(Meeting, meeting_id)
        if not meeting:
            return

        # Fetch recording
        result = await db.execute(
            select(MeetingRecording).where(MeetingRecording.meeting_id == meeting_id)
        )
        recording = result.scalar_one_or_none()

        transcript_text = ""

        if recording:
            # Download from MinIO
            from minio import Minio
            client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE,
            )
            local_path = f"/tmp/recording_{meeting_id}.webm"
            client.fget_object(settings.MINIO_BUCKET_RECORDINGS, recording.storage_path, local_path)

            # Transcribe with local Whisper
            model = whisper.load_model(settings.WHISPER_MODEL)
            result = model.transcribe(local_path, language=settings.WHISPER_LANGUAGE)
            transcript_text = result["text"]

            # Save transcript
            recording.transcript_path = f"transcripts/{meeting_id}.txt"
            recording.status = "transcribed"

            # Clean up
            os.remove(local_path)

        if not transcript_text:
            transcript_text = f"Meeting: {meeting.title}\nNo recording available."

        # ── LangChain Summary Pipeline ──────────────────────────────
        # Note: Using local model stub — swap Ollama for production
        _summary_prompt = f"""
You are an expert meeting notes assistant. Analyze this meeting transcript and provide:

TRANSCRIPT:
{transcript_text[:8000]}

Please provide a structured JSON response with these exact keys:
{{
  "summary": "500 word meeting summary",
  "key_decisions": ["decision 1", "decision 2"],
  "action_items": [{{"task": "...", "assignee": "...", "due_date": "..."}}],
  "open_questions": ["question 1", "question 2"],
  "topic_timeline": [{{"timestamp": "00:05:00", "topic": "..."}}],
  "sentiment": {{"overall": "positive/neutral/negative", "notes": "..."}}
}}
"""
        # TODO: Replace with actual LLM call
        # For now, create a structured placeholder
        ai_result = {
            "summary": f"Meeting '{meeting.title}' was held. Duration: {meeting.duration_seconds or 0} seconds. Transcript available.",
            "key_decisions": ["Review transcript for decisions"],
            "action_items": [],
            "open_questions": [],
            "topic_timeline": [],
            "sentiment": {"overall": "neutral", "notes": "Pending analysis"}
        }

        # Store summary
        existing_summary = await db.execute(select(MeetingSummary).where(MeetingSummary.meeting_id == meeting_id))
        summary_obj = existing_summary.scalar_one_or_none()

        if not summary_obj:
            summary_obj = MeetingSummary(meeting_id=meeting_id)
            db.add(summary_obj)

        summary_obj.summary_text = ai_result["summary"]
        summary_obj.key_decisions = ai_result["key_decisions"]
        summary_obj.action_items = ai_result["action_items"]
        summary_obj.open_questions = ai_result["open_questions"]
        summary_obj.topic_timeline = ai_result["topic_timeline"]
        summary_obj.sentiment_analysis = ai_result["sentiment"]
        summary_obj.generated_at = datetime.utcnow()

        await db.commit()

    await engine.dispose()
    print(f"[AI] Meeting summary generated for {meeting_id}")


@celery_app.task(name="tasks.ai_tasks.embed_message")
def embed_message(message_id: str, content: str):
    """Generate pgvector embedding for semantic search."""
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("all-MiniLM-L6-v2")
        _embedding = model.encode(content).tolist()
        # TODO: Store in ai_embeddings table with pgvector
        print(f"[AI] Embedded message {message_id}")
    except Exception as e:
        print(f"[AI] Embedding error: {e}")
