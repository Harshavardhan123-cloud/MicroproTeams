from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import User, Meeting, MeetingParticipant, MeetingStatus
from app.api.deps import get_current_user
from app.core.response import success_response

router = APIRouter(prefix="/calendar", tags=["Calendar & Scheduling"])

class ScheduleMeetingRequest(BaseModel):
    title: str
    description: Optional[str] = None
    channel_id: Optional[str] = None
    scheduled_start: str
    scheduled_end: str
    attendee_ids: Optional[List[str]] = []

@router.get("/events")
async def get_calendar_events(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Meeting)
        .options(
            selectinload(Meeting.host),
            selectinload(Meeting.participants).selectinload(MeetingParticipant.user)
        )
        .where(
            Meeting.organization_id == current_user.organization_id,
            Meeting.is_scheduled == True
        )
        .order_by(Meeting.scheduled_start.asc())
    )
    meetings = res.scalars().all()

    output = []
    for m in meetings:
        output.append({
            "id": str(m.id),
            "title": m.title,
            "description": m.description,
            "channel_id": str(m.channel_id) if m.channel_id else None,
            "host": {
                "id": str(m.host.id),
                "display_name": m.host.display_name,
                "email": m.host.email,
                "avatar_url": m.host.avatar_url
            } if m.host else None,
            "status": m.status,
            "is_scheduled": m.is_scheduled,
            "scheduled_start": m.scheduled_start.isoformat() if m.scheduled_start else None,
            "scheduled_end": m.scheduled_end.isoformat() if m.scheduled_end else None,
            "participants": [
                {
                    "id": str(p.user.id),
                    "display_name": p.user.display_name,
                    "email": p.user.email
                }
                for p in m.participants if p.user
            ]
        })

    return success_response(output)

@router.post("/events")
async def schedule_meeting(
    req: ScheduleMeetingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        start_dt = datetime.fromisoformat(req.scheduled_start.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(req.scheduled_end.replace('Z', '+00:00'))
    except Exception:
        start_dt = datetime.utcnow()
        end_dt = datetime.utcnow()

    meeting = Meeting(
        organization_id=current_user.organization_id,
        channel_id=req.channel_id,
        title=req.title,
        description=req.description,
        host_id=current_user.id,
        status=MeetingStatus.SCHEDULED,
        is_scheduled=True,
        scheduled_start=start_dt,
        scheduled_end=end_dt,
        meeting_link=f"/meeting/room"
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)

    # Add host as participant
    host_part = MeetingParticipant(meeting_id=meeting.id, user_id=current_user.id, role="host")
    db.add(host_part)

    # Add optional attendees
    if req.attendee_ids:
        for att_id in set(req.attendee_ids):
            if att_id != str(current_user.id):
                db.add(MeetingParticipant(meeting_id=meeting.id, user_id=att_id, role="attendee"))

    await db.commit()
    return success_response({"id": str(meeting.id), "title": meeting.title}, status_code=201)

@router.delete("/events/{meeting_id}")
async def cancel_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = res.scalars().first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    await db.delete(meeting)
    await db.commit()
    return success_response({"status": "cancelled"})

@router.get("/history")
async def get_call_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.host), selectinload(Meeting.participants))
        .where(Meeting.organization_id == current_user.organization_id)
        .order_by(Meeting.started_at.desc())
        .limit(20)
    )
    meetings = res.scalars().all()

    output = [
        {
            "id": str(m.id),
            "title": m.title,
            "host_name": m.host.display_name if m.host else "Unknown",
            "status": m.status,
            "started_at": m.started_at.isoformat() if m.started_at else None,
            "ended_at": m.ended_at.isoformat() if m.ended_at else None,
            "participant_count": len(m.participants)
        }
        for m in meetings
    ]
    return success_response(output)
