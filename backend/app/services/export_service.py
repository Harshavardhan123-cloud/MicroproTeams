import uuid
import json
import logging
from datetime import datetime
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import ExportJob, ExportJobStatus, User, Team, Channel, AuditLog
from app.services.compliance_service import log_audit

logger = logging.getLogger(__name__)

class ExportService:
    @staticmethod
    async def create_export_job(
        db: AsyncSession,
        organization_id: str,
        requested_by: str,
        resource_type: str = "ALL"
    ) -> ExportJob:
        job = ExportJob(
            id=uuid.uuid4(),
            organization_id=uuid.UUID(organization_id),
            requested_by=uuid.UUID(requested_by),
            resource_type=resource_type,
            status=ExportJobStatus.QUEUED,
            created_at=datetime.utcnow()
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        await log_audit(
            db, organization_id, requested_by, "EXPORT_JOB_CREATED", "EXPORT_JOB", str(job.id), f"Type: {resource_type}"
        )
        return job

    @staticmethod
    async def process_export_job(db: AsyncSession, job_id: str) -> ExportJob:
        stmt = select(ExportJob).where(ExportJob.id == uuid.UUID(job_id))
        res = await db.execute(stmt)
        job = res.scalar_one_or_none()
        if not job:
            raise ValueError("Export job not found")

        job.status = ExportJobStatus.PROCESSING
        await db.commit()

        # Simulate generating export zip / json package in object storage
        storage_key = f"organizations/{job.organization_id}/exports/export_{job.id}.zip"

        job.status = ExportJobStatus.READY
        job.storage_key = storage_key
        job.completed_at = datetime.utcnow()
        await db.commit()
        await db.refresh(job)

        await log_audit(
            db, str(job.organization_id), str(job.requested_by), "EXPORT_JOB_COMPLETED", "EXPORT_JOB", str(job.id)
        )
        return job

    @staticmethod
    async def list_export_jobs(db: AsyncSession, organization_id: str) -> List[ExportJob]:
        stmt = select(ExportJob).where(
            ExportJob.organization_id == uuid.UUID(organization_id)
        ).order_by(ExportJob.created_at.desc())
        res = await db.execute(stmt)
        return list(res.scalars().all())
