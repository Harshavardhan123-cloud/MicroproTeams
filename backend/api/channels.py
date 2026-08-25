"""
Channels API — create, list, join, leave, update channels.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from core.database import get_db
from core.dependencies import CurrentUser
from models.workspace import Channel, ChannelMember, ChannelType
from models.user import User
from schemas.auth import UserPublicResponse

router = APIRouter()


class ChannelCreateRequest(BaseModel):
    workspace_id: str
    team_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    type: str = ChannelType.PUBLIC.value
    topic: Optional[str] = None


class DMCreateRequest(BaseModel):
    workspace_id: str
    member_ids: List[str]  # User IDs to chat with (can include self for personal chat)


class ChannelResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    workspace_id: str
    team_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    type: str
    topic: Optional[str] = None
    is_archived: bool
    message_count: int
    created_by: str
    created_at: datetime
    member_ids: Optional[List[str]] = None  # Populated for DM/group_dm channels


@router.post("/", response_model=ChannelResponse, status_code=201)
async def create_channel(payload: ChannelCreateRequest, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    channel = Channel(
        workspace_id=payload.workspace_id,
        team_id=payload.team_id,
        name=payload.name,
        description=payload.description,
        type=payload.type,
        topic=payload.topic,
        created_by=current_user.id,
    )
    db.add(channel)
    await db.flush()
    # Auto-add creator as owner member
    member = ChannelMember(channel_id=channel.id, user_id=current_user.id, role="owner")
    db.add(member)
    await db.refresh(channel)
    return ChannelResponse.model_validate(channel)


@router.post("/dm", response_model=ChannelResponse, status_code=201)
async def create_dm(payload: DMCreateRequest, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """
    Create a DM or group-DM channel.

    - If member_ids contains only the current user's own ID → personal/self-chat (sole member).
    - If member_ids contains exactly one *other* user → 1:1 DM.
    - If member_ids contains multiple users → group DM.

    Duplicate prevention: if a DM/group_dm channel already exists with the
    *exact* same set of members in the same workspace, return it instead of
    creating a new one.
    """
    # Build the full member set (always includes the creator)
    all_member_ids = list(set(payload.member_ids) | {current_user.id})
    all_member_ids.sort()  # deterministic ordering for duplicate detection

    is_self_chat = len(all_member_ids) == 1 and all_member_ids[0] == current_user.id
    channel_type = ChannelType.DM.value if len(all_member_ids) <= 2 else ChannelType.GROUP_DM.value

    # ── Duplicate detection ───────────────────────────────────────────
    # Find channels of matching type in this workspace where the current
    # user is a member, then verify exact member-set match.
    candidate_ids_q = (
        select(ChannelMember.channel_id)
        .where(ChannelMember.user_id == current_user.id)
    )
    candidates = await db.execute(
        select(Channel)
        .where(
            Channel.workspace_id == payload.workspace_id,
            Channel.type.in_([ChannelType.DM.value, ChannelType.GROUP_DM.value]),
            Channel.is_archived.is_(False),
            Channel.id.in_(candidate_ids_q),
        )
    )
    for candidate in candidates.scalars().all():
        # Fetch this channel's member IDs
        members_result = await db.execute(
            select(ChannelMember.user_id).where(ChannelMember.channel_id == candidate.id)
        )
        existing_members = sorted(members_result.scalars().all())
        if existing_members == all_member_ids:
            resp = ChannelResponse.model_validate(candidate)
            resp.member_ids = existing_members
            return resp

    # ── Create new DM channel ─────────────────────────────────────────
    # Build a human-readable name from member display names
    member_users_result = await db.execute(
        select(User).where(User.id.in_(all_member_ids))
    )
    member_users = member_users_result.scalars().all()
    member_map = {u.id: u for u in member_users}

    if is_self_chat:
        channel_name = f"{member_map[current_user.id].display_name} (You)"
        description = "Personal space for drafts and notes"
    elif len(all_member_ids) == 2:
        other_id = [mid for mid in all_member_ids if mid != current_user.id][0]
        other_user = member_map.get(other_id)
        channel_name = other_user.display_name if other_user else "Direct Message"
        description = "Direct message"
    else:
        names = [member_map[mid].display_name for mid in all_member_ids if mid in member_map]
        channel_name = ", ".join(names[:4])
        if len(names) > 4:
            channel_name += f" +{len(names) - 4}"
        description = "Group chat"

    channel = Channel(
        workspace_id=payload.workspace_id,
        name=channel_name,
        description=description,
        type=channel_type,
        created_by=current_user.id,
    )
    db.add(channel)
    await db.flush()

    # Add all members
    for i, uid in enumerate(all_member_ids):
        role = "owner" if uid == current_user.id else "member"
        db.add(ChannelMember(channel_id=channel.id, user_id=uid, role=role))

    await db.refresh(channel)

    resp = ChannelResponse.model_validate(channel)
    resp.member_ids = all_member_ids
    return resp


@router.get("/workspace/{workspace_id}", response_model=List[ChannelResponse])
async def list_channels(workspace_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """List all public channels and channels the user is a member of in a workspace."""
    from sqlalchemy import or_
    member_subq = select(ChannelMember.channel_id).where(ChannelMember.user_id == current_user.id)

    result = await db.execute(
        select(Channel)
        .where(
            Channel.workspace_id == workspace_id,
            Channel.is_archived.is_(False),
            or_(
                Channel.type == ChannelType.PUBLIC.value,
                Channel.id.in_(member_subq)
            )
        )
    )
    channels = result.scalars().all()

    # Enrich DM/group_dm channels with member_ids
    responses = []
    for c in channels:
        resp = ChannelResponse.model_validate(c)
        if c.type in (ChannelType.DM.value, ChannelType.GROUP_DM.value):
            members_result = await db.execute(
                select(ChannelMember.user_id).where(ChannelMember.channel_id == c.id)
            )
            resp.member_ids = list(members_result.scalars().all())
        responses.append(resp)
    return responses


@router.post("/{channel_id}/join", status_code=200)
async def join_channel(channel_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    channel = await db.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found")
    if channel.type == ChannelType.PRIVATE.value:
        raise HTTPException(403, "Private channel — must be invited")

    existing = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == current_user.id
        )
    )
    if existing.scalar_one_or_none():
        return {"message": "Already a member"}

    db.add(ChannelMember(channel_id=channel_id, user_id=current_user.id))
    return {"message": "Joined channel"}


@router.delete("/{channel_id}/leave", status_code=204)
async def leave_channel(channel_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == current_user.id
        )
    )
    member = result.scalar_one_or_none()
    if member:
        await db.delete(member)


@router.get("/{channel_id}/members", response_model=List[UserPublicResponse])
async def get_channel_members(channel_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User)
        .join(ChannelMember, ChannelMember.user_id == User.id)
        .where(ChannelMember.channel_id == channel_id)
    )
    return [UserPublicResponse.model_validate(u) for u in result.scalars().all()]
