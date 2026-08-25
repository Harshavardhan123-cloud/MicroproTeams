"""
Meetings API — create, join, end meetings and get AI summaries.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from core.database import get_db
from core.dependencies import CurrentUser
from models.meeting import Meeting, MeetingParticipant, MeetingSummary, MeetingStatus
from core.security import generate_secure_token

router = APIRouter()


class MeetingCreateRequest(BaseModel):
    title: str
    workspace_id: str
    channel_id: Optional[str] = None
    description: Optional[str] = None
    is_waiting_room_enabled: bool = True
    is_transcription_enabled: bool = True
    scheduled_at: Optional[datetime] = None


class MeetingResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    title: str
    workspace_id: str
    channel_id: Optional[str]
    room_id: str
    status: str
    is_waiting_room_enabled: bool
    is_transcription_enabled: bool
    is_recording: bool
    scheduled_at: Optional[datetime]
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    host_id: str
    created_at: datetime


class SummaryResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    meeting_id: str
    summary_text: Optional[str]
    key_decisions: Optional[list]
    action_items: Optional[list]
    open_questions: Optional[list]
    topic_timeline: Optional[list]
    sentiment_analysis: Optional[dict]
    generated_at: Optional[datetime]


@router.post("/", response_model=MeetingResponse, status_code=201)
async def create_meeting(payload: MeetingCreateRequest, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    meeting = Meeting(
        title=payload.title,
        workspace_id=payload.workspace_id,
        channel_id=payload.channel_id,
        description=payload.description,
        host_id=current_user.id,
        is_waiting_room_enabled=payload.is_waiting_room_enabled,
        is_transcription_enabled=payload.is_transcription_enabled,
        scheduled_at=payload.scheduled_at,
    )
    db.add(meeting)
    await db.flush()
    # Auto-add host as participant
    db.add(MeetingParticipant(meeting_id=meeting.id, user_id=current_user.id, is_host=True, status="admitted"))
    await db.refresh(meeting)
    return MeetingResponse.model_validate(meeting)


@router.post("/{meeting_id}/start", response_model=MeetingResponse)
async def start_meeting(meeting_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if meeting.host_id != current_user.id and current_user.role not in ("admin",):
        raise HTTPException(403, "Only host can start the meeting")
    meeting.status = MeetingStatus.ACTIVE.value
    meeting.started_at = datetime.utcnow()
    await db.flush()  # must flush before refresh — session is autoflush=False
    await db.refresh(meeting)
    return MeetingResponse.model_validate(meeting)


@router.post("/{meeting_id}/end", response_model=MeetingResponse)
async def end_meeting(meeting_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    meeting.status = MeetingStatus.ENDED.value
    meeting.ended_at = datetime.utcnow()
    if meeting.started_at:
        meeting.duration_seconds = int((meeting.ended_at - meeting.started_at).total_seconds())

    await db.flush()  # must flush before refresh — session is autoflush=False

    # Trigger async AI summary generation
    from tasks.ai_tasks import generate_meeting_summary
    generate_meeting_summary.delay(meeting_id)

    await db.refresh(meeting)
    return MeetingResponse.model_validate(meeting)


@router.post("/{meeting_id}/join")
async def join_meeting(meeting_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    meeting = await db.get(Meeting, meeting_id)
    if not meeting or meeting.status == MeetingStatus.ENDED.value:
        raise HTTPException(404, "Meeting not found or already ended")

    # Check if already participant
    existing = await db.execute(
        select(MeetingParticipant).where(
            MeetingParticipant.meeting_id == meeting_id,
            MeetingParticipant.user_id == current_user.id
        )
    )
    participant = existing.scalar_one_or_none()
    if not participant:
        status = "waiting" if meeting.is_waiting_room_enabled else "admitted"
        db.add(MeetingParticipant(meeting_id=meeting_id, user_id=current_user.id, status=status, joined_at=datetime.utcnow()))

    # Return mediasoup room token
    return {
        "meeting": MeetingResponse.model_validate(meeting),
        "room_token": generate_secure_token(16),
        "mediasoup_url": f"/api/v1/meetings/{meeting.room_id}/mediasoup",
    }


@router.get("/{meeting_id}/summary", response_model=SummaryResponse)
async def get_summary(meeting_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MeetingSummary).where(MeetingSummary.meeting_id == meeting_id))
    summary = result.scalar_one_or_none()
    if not summary:
        raise HTTPException(404, "Summary not yet generated")
    return SummaryResponse.model_validate(summary)


@router.get("/workspace/{workspace_id}", response_model=List[MeetingResponse])
async def list_meetings(workspace_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Meeting).where(Meeting.workspace_id == workspace_id).order_by(Meeting.created_at.desc()).limit(50)
    )
    return [MeetingResponse.model_validate(m) for m in result.scalars().all()]
