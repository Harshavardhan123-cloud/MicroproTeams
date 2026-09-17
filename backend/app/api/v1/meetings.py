from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import User, Meeting, MeetingParticipant, MeetingPolicy, MeetingType, MeetingStatus
from app.services.meeting_service import MeetingService
from app.services.authorization_service import AuthorizationService
from app.core.response import success_response, error_response

router = APIRouter(prefix="/meetings", tags=["Meetings"])

class CreateMeetingRequest(BaseModel):
    title: str
    description: Optional[str] = None
    meeting_type: MeetingType = MeetingType.INSTANT
    lobby_enabled: bool = False
    is_scheduled: bool = False
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None

class MeetingPolicyUpdateRequest(BaseModel):
    allow_guests: Optional[bool] = None
    allow_lobby: Optional[bool] = None
    allow_screen_share: Optional[bool] = None
    allow_chat: Optional[bool] = None
    allow_reactions: Optional[bool] = None
    max_participants: Optional[int] = None

@router.post("", status_code=201)
async def create_meeting(
    req: CreateMeetingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    res = await svc.create_meeting(
        user=current_user,
        title=req.title,
        meeting_type=req.meeting_type,
        description=req.description,
        lobby_enabled=req.lobby_enabled,
        is_scheduled=req.is_scheduled,
        scheduled_start=req.scheduled_start,
        scheduled_end=req.scheduled_end
    )
    return success_response(res, status_code=201)

@router.get("")
async def list_meetings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Meeting)
        # `policy` and `participants` are read below by format_meeting. Without
        # eager loading, touching them here lazy-loads outside the async
        # greenlet context and raises MissingGreenlet, so listing meetings
        # 500s as soon as the organization has any meeting at all.
        .options(selectinload(Meeting.participants), selectinload(Meeting.policy))
        .where(Meeting.organization_id == current_user.organization_id)
        .order_by(Meeting.created_at.desc())
    )
    meetings = res.scalars().all()
    svc = MeetingService(db)
    return success_response([svc.format_meeting(m, m.policy) for m in meetings])

@router.get("/code/{meeting_code}")
async def get_meeting_by_code(
    meeting_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    m = await svc.get_by_code(meeting_code)
    if not m or str(m.organization_id) != str(current_user.organization_id):
        return error_response("NOT_FOUND", "Meeting not found.", status_code=404)
    return success_response(svc.format_meeting(m, m.policy))

@router.get("/{meeting_id}")
async def get_meeting_details(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    m = await svc.get_by_id(meeting_id)
    if not m or str(m.organization_id) != str(current_user.organization_id):
        return error_response("NOT_FOUND", "Meeting not found.", status_code=404)
    return success_response(svc.format_meeting(m, m.policy))

@router.post("/{meeting_id}/join")
async def join_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    try:
        res = await svc.join_meeting(meeting_id, current_user)
        return success_response(res)
    except ValueError as e:
        return error_response("JOIN_ERROR", str(e), status_code=400)

@router.post("/{meeting_id}/leave")
async def leave_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    await svc.leave_meeting(meeting_id, current_user)
    return success_response({"message": "Left meeting."})

@router.post("/{meeting_id}/end")
async def end_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    ended = await svc.end_meeting(meeting_id, current_user)
    if not ended:
        return error_response("PERMISSION_DENIED", "Only host can end meeting.", status_code=403)
    return success_response({"message": "Meeting ended."})

@router.get("/{meeting_id}/participants")
async def list_participants(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    m = await svc.get_by_id(meeting_id)
    if not m or str(m.organization_id) != str(current_user.organization_id):
        return error_response("NOT_FOUND", "Meeting not found.", status_code=404)

    res = await db.execute(
        select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting_id)
    )
    parts = res.scalars().all()
    data = [
        {
            "id": str(p.id),
            "user_id": str(p.user_id),
            "role": p.role,
            "status": p.status,
            "is_host": p.is_host,
            "is_muted": p.is_muted or p.audio_muted,
            "camera_enabled": p.camera_enabled,
            "screen_sharing": p.screen_sharing,
            "raised_hand": p.raised_hand,
            "joined_at": p.joined_at.isoformat() if p.joined_at else None
        }
        for p in parts
    ]
    return success_response(data)

@router.post("/{meeting_id}/participants/{user_id}/admit")
async def admit_participant(
    meeting_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    ok = await svc.admit_participant(meeting_id, user_id, current_user)
    if not ok:
        return error_response("NOT_FOUND", "Participant or permission error.", status_code=400)
    return success_response({"message": "Participant admitted."})

@router.post("/{meeting_id}/participants/{user_id}/remove")
async def remove_participant(
    meeting_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    ok = await svc.remove_participant(meeting_id, user_id, current_user)
    if not ok:
        return error_response("NOT_FOUND", "Participant or permission error.", status_code=400)
    return success_response({"message": "Participant removed."})

@router.post("/{meeting_id}/participants/{user_id}/mute")
async def mute_participant(
    meeting_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    ok = await svc.mute_participant(meeting_id, user_id, current_user)
    if not ok:
        return error_response("NOT_FOUND", "Participant or permission error.", status_code=400)
    return success_response({"message": "Participant muted."})

@router.get("/{meeting_id}/policy")
async def get_meeting_policy(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    m = await svc.get_by_id(meeting_id)
    if not m or str(m.organization_id) != str(current_user.organization_id):
        return error_response("NOT_FOUND", "Meeting not found.", status_code=404)

    res = await db.execute(select(MeetingPolicy).where(MeetingPolicy.meeting_id == meeting_id))
    pol = res.scalars().first()
    if not pol:
        return error_response("NOT_FOUND", "Policy not found.", status_code=404)
    return success_response({
        "allow_guests": pol.allow_guests,
        "allow_lobby": pol.allow_lobby,
        "allow_screen_share": pol.allow_screen_share,
        "allow_chat": pol.allow_chat,
        "allow_reactions": pol.allow_reactions,
        "max_participants": pol.max_participants
    })

@router.patch("/{meeting_id}/policy")
async def update_meeting_policy(
    meeting_id: str,
    req: MeetingPolicyUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    m = await svc.get_by_id(meeting_id)
    if not m or str(m.organization_id) != str(current_user.organization_id):
        return error_response("NOT_FOUND", "Meeting not found.", status_code=404)

    is_host = str(m.host_id) == str(current_user.id)
    if not is_host and not await AuthorizationService.is_org_admin(current_user, db):
        return error_response("FORBIDDEN", "Only the meeting host or an org admin can update its policy.", status_code=403)

    res = await db.execute(select(MeetingPolicy).where(MeetingPolicy.meeting_id == meeting_id))
    pol = res.scalars().first()
    if not pol:
        pol = MeetingPolicy(meeting_id=meeting_id)
        db.add(pol)

    if req.allow_guests is not None:
        pol.allow_guests = req.allow_guests
    if req.allow_lobby is not None:
        pol.allow_lobby = req.allow_lobby
    if req.allow_screen_share is not None:
        pol.allow_screen_share = req.allow_screen_share
    if req.allow_chat is not None:
        pol.allow_chat = req.allow_chat
    if req.allow_reactions is not None:
        pol.allow_reactions = req.allow_reactions
    if req.max_participants is not None:
        pol.max_participants = req.max_participants

    await db.commit()
    return success_response({"message": "Policy updated successfully."})

@router.get("/{meeting_id}/state")
async def get_meeting_state(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Resync endpoint used by clients upon reconnection (Wi-Fi switches, tab suspension).
    Returns a complete state snapshot of the meeting, participants, policy, and media endpoint.
    """
    svc = MeetingService(db)
    m = await svc.get_by_id(meeting_id)
    if not m:
        # Fallback search by code
        m = await svc.get_by_code(meeting_id)
    if not m or str(m.organization_id) != str(current_user.organization_id):
        return error_response("NOT_FOUND", "Meeting not found.", status_code=404)

    # Verify participant membership or active state
    res_parts = await db.execute(
        select(MeetingParticipant).where(MeetingParticipant.meeting_id == m.id)
    )
    parts = res_parts.scalars().all()

    participant_data = [
        {
            "id": str(p.id),
            "user_id": str(p.user_id),
            "role": p.role,
            "status": p.status,
            "is_host": p.is_host,
            "is_muted": p.is_muted or p.audio_muted,
            "camera_enabled": p.camera_enabled,
            "screen_sharing": p.screen_sharing,
            "raised_hand": p.raised_hand,
            "joined_at": p.joined_at.isoformat() if p.joined_at else None
        }
        for p in parts
    ]

    return success_response({
        "meeting": svc.format_meeting(m, m.policy),
        "participants": participant_data,
        "policy": {
            "allow_guests": m.policy.allow_guests if m.policy else True,
            "allow_lobby": m.policy.allow_lobby if m.policy else False,
            "allow_screen_share": m.policy.allow_screen_share if m.policy else True,
            "allow_chat": m.policy.allow_chat if m.policy else True,
            "allow_reactions": m.policy.allow_reactions if m.policy else True,
        },
        "sfu_endpoint": "ws://localhost:3010"
    })

