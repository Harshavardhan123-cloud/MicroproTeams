from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import User, Meeting, MeetingParticipant, MeetingPolicy, MeetingStatus, ParticipantRole
from app.api.deps import get_current_user
from app.services.meeting_service import generate_meeting_code
from app.services.authorization_service import AuthorizationService
from app.services.notification_service import create_notification
from app.core.websocket import ws_manager
from app.core.response import success_response, error_response

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
            "meeting_code": m.meeting_code,
            "meeting_link": m.meeting_link or (f"/meet/{m.meeting_code}" if m.meeting_code else None),
            "host": {
                "id": str(m.host.id),
                "display_name": m.host.display_name,
                "email": m.host.email,
                "avatar_url": m.host.avatar_url
            } if m.host else None,
            "status": m.status,
            "is_scheduled": m.is_scheduled,
            "scheduled_start": (m.scheduled_start.isoformat() + "Z") if m.scheduled_start and not m.scheduled_start.isoformat().endswith("Z") and "+" not in m.scheduled_start.isoformat() else (m.scheduled_start.isoformat() if m.scheduled_start else None),
            "scheduled_end": (m.scheduled_end.isoformat() + "Z") if m.scheduled_end and not m.scheduled_end.isoformat().endswith("Z") and "+" not in m.scheduled_end.isoformat() else (m.scheduled_end.isoformat() if m.scheduled_end else None),
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
        return error_response("INVALID_DATE", "scheduled_start/scheduled_end must be valid ISO-8601 timestamps.", status_code=400)

    # Check for time overlap / meeting clash for host and attendees
    target_users = {str(current_user.id)}
    if req.attendee_ids:
        target_users.update({str(aid) for aid in req.attendee_ids})

    clash_query = select(Meeting).options(
        selectinload(Meeting.participants)
    ).where(
        Meeting.organization_id == current_user.organization_id,
        Meeting.is_scheduled == True,
        Meeting.scheduled_start < end_dt,
        Meeting.scheduled_end > start_dt
    )
    clash_res = await db.execute(clash_query)
    existing_meetings = clash_res.scalars().all()

    for ex in existing_meetings:
        ex_users = {str(ex.host_id)}
        if ex.participants:
            for p in ex.participants:
                if p.user_id:
                    ex_users.add(str(p.user_id))

        if target_users.intersection(ex_users):
            s_time = ex.scheduled_start.strftime("%I:%M %p") if ex.scheduled_start else ""
            e_time = ex.scheduled_end.strftime("%I:%M %p") if ex.scheduled_end else ""
            return error_response(
                "MEETING_CLASH",
                f"Schedule Conflict: Meeting '{ex.title}' is already scheduled for this time ({s_time} - {e_time}). Please select a non-overlapping time slot.",
                status_code=409
            )

    code = generate_meeting_code()
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
        meeting_code=code,
        meeting_link=f"/meet/{code}"
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)

    # Add host as participant, using the same role values (and MeetingPolicy
    # row) that the real join/policy flow expects — a scheduled meeting used
    # to be unjoinable/unmanageable through that flow because of a mismatch.
    host_part = MeetingParticipant(meeting_id=meeting.id, user_id=current_user.id, role=ParticipantRole.HOST, is_host=True)
    db.add(host_part)
    db.add(MeetingPolicy(meeting_id=meeting.id))

    # Add optional attendees — restricted to the caller's own org, same as a
    # direct-message conversation's members.
    if req.attendee_ids:
        candidate_ids = {aid for aid in set(req.attendee_ids) if aid != str(current_user.id)}
        if candidate_ids:
            valid_res = await db.execute(
                select(User.id).where(User.id.in_(candidate_ids), User.organization_id == current_user.organization_id)
            )
            valid_ids = {str(uid) for uid in valid_res.scalars().all()}
            for att_id in valid_ids:
                db.add(MeetingParticipant(meeting_id=meeting.id, user_id=att_id, role=ParticipantRole.ATTENDEE))
                try:
                    time_formatted = start_dt.strftime('%b %d at %I:%M %p')
                    notif_body = f"{current_user.display_name} invited you to '{meeting.title}' scheduled for {time_formatted}."
                    await create_notification(
                        db=db,
                        user_id=att_id,
                        organization_id=str(current_user.organization_id),
                        type="meeting_scheduled",
                        title=f"New Meeting Scheduled: {meeting.title}",
                        body=notif_body,
                        resource_type="meeting",
                        resource_id=str(meeting.id)
                    )
                    await ws_manager.send_personal_message(att_id, {
                        "type": "meeting.scheduled",
                        "meeting_id": str(meeting.id),
                        "title": f"📅 Meeting Invitation: {meeting.title}",
                        "body": notif_body,
                        "meeting_code": meeting.meeting_code,
                        "host_name": current_user.display_name,
                        "scheduled_start": start_dt.isoformat() + "Z"
                    })
                except Exception as notif_err:
                    print(f"Failed to send notification to attendee {att_id}: {notif_err}")

    await db.commit()
    return success_response({
        "id": str(meeting.id),
        "title": meeting.title,
        "meeting_code": meeting.meeting_code,
        "meeting_link": f"/meet/{meeting.meeting_code}",
        "scheduled_start": start_dt.isoformat() + "Z",
        "scheduled_end": end_dt.isoformat() + "Z"
    }, status_code=201)

@router.delete("/events/{meeting_id}")
async def cancel_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = res.scalars().first()
    if not meeting or str(meeting.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Meeting not found")

    is_host = str(meeting.host_id) == str(current_user.id)
    if not is_host and not await AuthorizationService.is_org_admin(current_user, db):
        raise HTTPException(status_code=403, detail="Only the meeting host or an org admin can cancel this meeting.")

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

@router.post("/events/{meeting_id}/notify_start")
async def notify_meeting_start(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.host), selectinload(Meeting.participants).selectinload(MeetingParticipant.user))
        .where(Meeting.id == meeting_id)
    )
    meeting = res.scalars().first()
    if not meeting or str(meeting.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Meeting not found")

    host_name = current_user.display_name or current_user.username
    target_users = set()
    if meeting.participants:
        for p in meeting.participants:
            if p.user and str(p.user.id) != str(current_user.id):
                target_users.add(str(p.user.id))

    for uid in target_users:
        try:
            await create_notification(
                db=db,
                user_id=uid,
                organization_id=str(current_user.organization_id),
                type="meeting_started",
                title=f"Meeting Started: {meeting.title}",
                body=f"Host {host_name} has started the meeting. Click to join now!",
                resource_type="meeting",
                resource_id=str(meeting.id)
            )
            await ws_manager.send_personal_message(uid, {
                "type": "meeting.started",
                "meeting_id": str(meeting.id),
                "title": meeting.title,
                "host_name": host_name,
                "meeting_code": meeting.meeting_code,
                "body": f"Host {host_name} has started '{meeting.title}'"
            })
        except Exception as err:
            print(f"Failed to notify user {uid}: {err}")

    return success_response({"status": "notified", "attendee_count": len(target_users)})

@router.post("/events/{meeting_id}/notify_reminder_5m")
async def notify_meeting_reminder_5m(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.host), selectinload(Meeting.participants).selectinload(MeetingParticipant.user))
        .where(Meeting.id == meeting_id)
    )
    meeting = res.scalars().first()
    if not meeting or str(meeting.organization_id) != str(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Meeting not found")

    host_name = meeting.host.display_name if meeting.host else "Organizer"
    start_time_str = meeting.scheduled_start.strftime("%I:%M %p") if meeting.scheduled_start else "5 minutes"

    target_users = set()
    if meeting.participants:
        for p in meeting.participants:
            if p.user:
                target_users.add(str(p.user.id))

    for uid in target_users:
        try:
            await create_notification(
                db=db,
                user_id=uid,
                organization_id=str(current_user.organization_id),
                type="meeting_reminder_5m",
                title=f"Upcoming Meeting: {meeting.title}",
                body=f"Meeting starting in 5 minutes ({start_time_str}). Click to join!",
                resource_type="meeting",
                resource_id=str(meeting.id)
            )
            await ws_manager.send_personal_message(uid, {
                "type": "meeting.reminder_5m",
                "meeting_id": str(meeting.id),
                "title": meeting.title,
                "host_name": host_name,
                "meeting_code": meeting.meeting_code,
                "body": f"Meeting '{meeting.title}' starts in 5 minutes at {start_time_str}"
            })
        except Exception as err:
            print(f"Failed to send 5m reminder to user {uid}: {err}")

    return success_response({"status": "notified_reminder", "attendee_count": len(target_users)})

