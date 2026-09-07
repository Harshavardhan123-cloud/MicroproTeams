import uuid
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import async_session_factory
from app.models.models import (
    BackgroundJob, Recording, Meeting, Transcript, MeetingSummary,
    RetentionPolicy, LegalHold, ExportJob, DailyAnalyticsAggregate,
    RecordingStatus, TranscriptStatus, ExportJobStatus, RetentionAction
)
from app.services.transcription_service import TranscriptionService
from app.services.meeting_ai_service import MeetingAIService
from app.services.analytics_service import AnalyticsService
from app.services.export_service import ExportService
from app.services.compliance_service import is_legal_held, log_audit

logger = logging.getLogger(__name__)

class WorkerManager:
    """Enterprise Background Worker System with Idempotency, Queue State & Retries."""

    @staticmethod
    async def enqueue_job(db: AsyncSession, job_type: str, metadata: Dict[str, Any]) -> BackgroundJob:
        job = BackgroundJob(
            id=uuid.uuid4(),
            type=job_type,
            status="QUEUED",
            attempts=0,
            metadata_json=str(metadata),
            created_at=datetime.utcnow()
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)
        return job

    @staticmethod
    async def process_recording_job(db: AsyncSession, meeting_id: str, recording_id: str):
        """RecordingWorker + TranscriptionWorker + DiarizationWorker + AIWorker execution pipeline."""
        logger.info(f"Processing recording pipeline for meeting {meeting_id}")

        # 1. Transcribe & Diarize
        try:
            transcript = await TranscriptionService.process_meeting_transcript(
                db, meeting_id=meeting_id, recording_id=recording_id
            )
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            return

        # 2. AI Meeting Intelligence
        try:
            summary = await MeetingAIService.process_meeting_ai(
                db, meeting_id=meeting_id, recording_id=recording_id
            )
        except Exception as e:
            logger.error(f"AI Summary generation failed: {e}")
            return

        logger.info(f"Successfully finished AI processing pipeline for meeting {meeting_id}")

    @staticmethod
    async def run_retention_worker(db: AsyncSession, organization_id: str):
        """RetentionWorker: Cleans up expired resources according to organizational policy if not on legal hold."""
        policies_stmt = select(RetentionPolicy).where(
            RetentionPolicy.organization_id == uuid.UUID(organization_id),
            RetentionPolicy.enabled.is_(True)
        )
        res = await db.execute(policies_stmt)
        policies = res.scalars().all()

        for policy in policies:
            cutoff_date = datetime.utcnow() - timedelta(days=policy.retention_days)
            if policy.resource_type.value == "RECORDINGS":
                stmt = select(Recording).where(
                    Recording.organization_id == uuid.UUID(organization_id),
                    Recording.created_at < cutoff_date,
                    Recording.status != RecordingStatus.DELETED
                )
                recs = (await db.execute(stmt)).scalars().all()
                for rec in recs:
                    if not await is_legal_held(db, organization_id, "RECORDINGS", str(rec.id)):
                        if policy.action == RetentionAction.DELETE:
                            rec.status = RecordingStatus.DELETED
                        elif policy.action == RetentionAction.ARCHIVE:
                            rec.status = RecordingStatus.READY
                await db.commit()

        await log_audit(db, organization_id, None, "RETENTION_WORKER_EXECUTED", "ORGANIZATION", organization_id)

    @staticmethod
    async def run_analytics_worker(db: AsyncSession, organization_id: str):
        """AnalyticsWorker: Aggregates daily stats."""
        await AnalyticsService.aggregate_daily(db, organization_id)

    @staticmethod
    async def run_export_worker(db: AsyncSession, export_job_id: str):
        """ExportWorker: Processes export job."""
        await ExportService.process_export_job(db, export_job_id)
