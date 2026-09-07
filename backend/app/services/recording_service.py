import uuid
import logging
from datetime import datetime
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.models import (
    Recording, RecordingSegment, Meeting, MeetingParticipant,
    RecordingType, RecordingStatus, RecordingSegmentStatus, AuditLog, OrganizationPolicy
)
from app.services.compliance_service import log_audit, is_legal_held
from app.core.config import settings

logger = logging.getLogger(__name__)

class RecordingService:
    @staticmethod
    async def start_recording(
        db: AsyncSession,
        meeting_id: str,
        user_id: str,
        organization_id: str,
        recording_type: RecordingType = RecordingType.FULL_MEETING
    ) -> Recording:
        # 1. Check organization policy
        policy_stmt = select(OrganizationPolicy).where(OrganizationPolicy.organization_id == uuid.UUID(organization_id))
        res = await db.execute(policy_stmt)
        org_policy = res.scalar_one_or_none()
        if org_policy and not org_policy.allow_recording:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Meeting recording is disabled by organization policy.")

        # 2. Check meeting & authorization
        meeting_stmt = select(Meeting).where(Meeting.id == uuid.UUID(meeting_id))
        meeting_res = await db.execute(meeting_stmt)
        meeting = meeting_res.scalar_one_or_none()
        if not meeting:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

        part_stmt = select(MeetingParticipant).where(
            MeetingParticipant.meeting_id == uuid.UUID(meeting_id),
            MeetingParticipant.user_id == uuid.UUID(user_id)
        )
        part_res = await db.execute(part_stmt)
        participant = part_res.scalar_one_or_none()

        is_host_or_cohost = False
        if str(meeting.host_id) == str(user_id) or str(meeting.created_by) == str(user_id):
            is_host_or_cohost = True
        elif participant and (participant.is_host or participant.is_cohost or participant.role in ["HOST", "CO_HOST", "OWNER"]):
            is_host_or_cohost = True

        if not is_host_or_cohost:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only host or co-host can start recording.")

        # 3. Create Recording record
        rec_id = uuid.uuid4()
        storage_key = f"organizations/{organization_id}/meetings/{meeting_id}/recordings/{rec_id}.mp4"

        recording = Recording(
            id=rec_id,
            meeting_id=uuid.UUID(meeting_id),
            organization_id=uuid.UUID(organization_id),
            started_by=uuid.UUID(user_id),
            recording_type=recording_type,
            status=RecordingStatus.RECORDING,
            storage_key=storage_key,
            mime_type="video/mp4",
            started_at=datetime.utcnow()
        )
        db.add(recording)

        # 4. Create initial Recording Segment
        segment = RecordingSegment(
            id=uuid.uuid4(),
            recording_id=rec_id,
            sequence_number=1,
            storage_key=f"organizations/{organization_id}/meetings/{meeting_id}/recordings/{rec_id}/segment_1.ts",
            started_at=datetime.utcnow(),
            status=RecordingSegmentStatus.RECORDING
        )
        db.add(segment)

        await db.commit()
        await db.refresh(recording)

        # Audit event
        await log_audit(
            db,
            organization_id=organization_id,
            actor_id=user_id,
            action="RECORDING_STARTED",
            resource_type="RECORDING",
            resource_id=str(recording.id),
            details=f"Started recording mode {recording_type.value}"
        )

        return recording

    @staticmethod
    async def stop_recording(
        db: AsyncSession,
        meeting_id: str,
        user_id: str,
        recording_id: str
    ) -> Recording:
        rec_stmt = select(Recording).where(
            Recording.id == uuid.UUID(recording_id),
            Recording.meeting_id == uuid.UUID(meeting_id)
        )
        res = await db.execute(rec_stmt)
        recording = res.scalar_one_or_none()
        if not recording:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active recording not found")

        recording.status = RecordingStatus.READY
        recording.ended_at = datetime.utcnow()
        if recording.started_at:
            recording.duration = int((recording.ended_at - recording.started_at).total_seconds())
        recording.size = max(1024 * 1024, recording.duration * 500000) # Mock payload size

        # Update segments
        seg_stmt = select(RecordingSegment).where(RecordingSegment.recording_id == recording.id)
        seg_res = await db.execute(seg_stmt)
        segments = seg_res.scalars().all()
        for seg in segments:
            seg.status = RecordingSegmentStatus.READY
            seg.ended_at = datetime.utcnow()
            seg.duration = recording.duration

        await db.commit()
        await db.refresh(recording)

        await log_audit(
            db,
            organization_id=str(recording.organization_id),
            actor_id=user_id,
            action="RECORDING_STOPPED",
            resource_type="RECORDING",
            resource_id=str(recording.id),
            details=f"Stopped recording. Duration: {recording.duration}s"
        )

        return recording

    @staticmethod
    async def get_recordings_for_meeting(
        db: AsyncSession,
        meeting_id: str
    ) -> List[Recording]:
        stmt = select(Recording).where(
            Recording.meeting_id == uuid.UUID(meeting_id),
            Recording.status != RecordingStatus.DELETED
        ).order_by(Recording.created_at.desc())
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def get_recording_by_id(
        db: AsyncSession,
        recording_id: str
    ) -> Optional[Recording]:
        stmt = select(Recording).where(
            Recording.id == uuid.UUID(recording_id),
            Recording.status != RecordingStatus.DELETED
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def delete_recording(
        db: AsyncSession,
        recording_id: str,
        user_id: str
    ) -> bool:
        recording = await RecordingService.get_recording_by_id(db, recording_id)
        if not recording:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")

        # Check Legal Hold
        if await is_legal_held(db, str(recording.organization_id), "RECORDINGS", str(recording.id)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot delete recording because it is under active Legal Hold."
            )

        recording.status = RecordingStatus.DELETED
        recording.updated_at = datetime.utcnow()
        await db.commit()

        await log_audit(
            db,
            organization_id=str(recording.organization_id),
            actor_id=user_id,
            action="RECORDING_DELETED",
            resource_type="RECORDING",
            resource_id=str(recording.id),
            details="Recording marked as DELETED"
        )
        return True
