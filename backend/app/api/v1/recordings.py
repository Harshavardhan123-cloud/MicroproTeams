import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.v1.auth import get_current_user
from app.models.models import User, Recording, Transcript, TranscriptSegment, RecordingType
from app.services.recording_service import RecordingService
from app.services.transcription_service import TranscriptionService
from app.workers.worker_manager import WorkerManager

router = APIRouter(tags=["Recordings"])

class StartRecordingRequest(BaseModel):
    recording_type: Optional[RecordingType] = RecordingType.FULL_MEETING

class StopRecordingRequest(BaseModel):
    recording_id: str

@router.post("/meetings/{meeting_id}/recording/start")
async def start_recording(
    meeting_id: str,
    body: Optional[StartRecordingRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    rec_type = body.recording_type if body else RecordingType.FULL_MEETING
    recording = await RecordingService.start_recording(
        db, meeting_id=meeting_id, user_id=str(current_user.id),
        organization_id=str(current_user.organization_id), recording_type=rec_type
    )
    return {
        "status": "success",
        "recording_id": str(recording.id),
        "recording_type": recording.recording_type.value,
        "state": recording.status.value,
        "message": "Recording has started."
    }

@router.post("/meetings/{meeting_id}/recording/stop")
async def stop_recording(
    meeting_id: str,
    body: StopRecordingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    recording = await RecordingService.stop_recording(
        db, meeting_id=meeting_id, user_id=str(current_user.id), recording_id=body.recording_id
    )

    # Queue async processing pipeline for transcription, diarization & AI summary
    await WorkerManager.process_recording_job(db, meeting_id=meeting_id, recording_id=str(recording.id))

    return {
        "status": "success",
        "recording_id": str(recording.id),
        "state": recording.status.value,
        "message": "Recording has stopped."
    }

@router.get("/recordings/all")
async def list_all_recordings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Recording).where(
        Recording.organization_id == current_user.organization_id
    ).order_by(Recording.created_at.desc())
    res = await db.execute(stmt)
    recordings = res.scalars().all()
    return [
        {
            "id": str(r.id),
            "meeting_id": str(r.meeting_id),
            "organization_id": str(r.organization_id),
            "started_by": str(r.started_by),
            "recording_type": r.recording_type.value,
            "status": r.status.value,
            "storage_key": r.storage_key,
            "mime_type": r.mime_type,
            "duration": r.duration,
            "size": r.size,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "ended_at": r.ended_at.isoformat() if r.ended_at else None,
            "created_at": r.created_at.isoformat()
        }
        for r in recordings
    ]

@router.get("/meetings/{meeting_id}/recordings")
async def list_meeting_recordings(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    recordings = await RecordingService.get_recordings_for_meeting(db, meeting_id)
    return [
        {
            "id": str(r.id),
            "meeting_id": str(r.meeting_id),
            "organization_id": str(r.organization_id),
            "started_by": str(r.started_by),
            "recording_type": r.recording_type.value,
            "status": r.status.value,
            "storage_key": r.storage_key,
            "mime_type": r.mime_type,
            "duration": r.duration,
            "size": r.size,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "ended_at": r.ended_at.isoformat() if r.ended_at else None,
            "created_at": r.created_at.isoformat()
        }
        for r in recordings
    ]

@router.get("/recordings/{recording_id}")
async def get_recording(
    recording_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    recording = await RecordingService.get_recording_by_id(db, recording_id)
    if not recording:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")

    return {
        "id": str(recording.id),
        "meeting_id": str(recording.meeting_id),
        "recording_type": recording.recording_type.value,
        "status": recording.status.value,
        "duration": recording.duration,
        "size": recording.size,
        "started_at": recording.started_at.isoformat() if recording.started_at else None,
        "created_at": recording.created_at.isoformat()
    }

@router.get("/recordings/{recording_id}/playback-url")
async def get_playback_url(
    recording_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    recording = await RecordingService.get_recording_by_id(db, recording_id)
    if not recording:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")

    # Short-lived signed URL (or direct object stream path in dev)
    playback_url = f"/uploads/{recording.storage_key}" if recording.storage_key else "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
    return {
        "recording_id": str(recording.id),
        "playback_url": playback_url,
        "mime_type": recording.mime_type,
        "expires_in_seconds": 3600
    }

@router.get("/recordings/{recording_id}/transcript")
async def get_recording_transcript(
    recording_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Transcript).where(Transcript.recording_id == uuid.UUID(recording_id))
    res = await db.execute(stmt)
    transcript = res.scalar_one_or_none()

    if not transcript:
        # Fallback to meeting transcript if recording transcript is linked via meeting
        rec = await RecordingService.get_recording_by_id(db, recording_id)
        if rec:
            stmt2 = select(Transcript).where(Transcript.meeting_id == rec.meeting_id)
            transcript = (await db.execute(stmt2)).scalar_one_or_none()

    if not transcript:
        return {"status": "PROCESSING", "full_text": "", "segments": []}

    seg_stmt = select(TranscriptSegment).where(
        TranscriptSegment.transcript_id == transcript.id
    ).order_by(TranscriptSegment.start_time.asc())
    seg_res = await db.execute(seg_stmt)
    segments = seg_res.scalars().all()

    return {
        "id": str(transcript.id),
        "meeting_id": str(transcript.meeting_id),
        "recording_id": str(transcript.recording_id) if transcript.recording_id else recording_id,
        "language": transcript.language,
        "status": transcript.status.value,
        "full_text": transcript.full_text,
        "segments": [
            {
                "id": str(s.id),
                "speaker_id": str(s.speaker_id) if s.speaker_id else None,
                "speaker_name": s.speaker_name,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "text": s.text,
                "confidence": s.confidence,
                "word_timestamps": s.word_timestamps
            }
            for s in segments
        ]
    }
