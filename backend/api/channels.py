"""
Channels API — create, list, join, leave, update channels.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from core.database import get_db
from core.dependencies import CurrentUser
from models.workspace import Channel, ChannelMember, ChannelType
from schemas.auth import UserPublicResponse
from sqlalchemy import func

router = APIRouter()


class ChannelCreateRequest(BaseModel):
    workspace_id: str
    team_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    type: str = ChannelType.PRIVATE.value
    topic: Optional[str] = None


class DMCreateRequest(BaseModel):
    target_user_id: str
    workspace_id: str


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
async def get_or_create_dm(payload: DMCreateRequest, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Channel)
        .join(ChannelMember, Channel.id == ChannelMember.channel_id)
        .where(
            Channel.type == ChannelType.DM.value,
            Channel.workspace_id == payload.workspace_id,
            ChannelMember.user_id.in_([current_user.id, payload.target_user_id])
        )
        .group_by(Channel.id)
        .having(func.count(ChannelMember.user_id) == 2)
    )
    existing = result.scalars().first()
    if existing:
        return ChannelResponse.model_validate(existing)
        
    channel = Channel(
        workspace_id=payload.workspace_id,
        name=f"dm-{current_user.id}-{payload.target_user_id}",
        type=ChannelType.DM.value,
        created_by=current_user.id
    )
    db.add(channel)
    await db.flush()
    db.add(ChannelMember(channel_id=channel.id, user_id=current_user.id, role="member"))
    if current_user.id != payload.target_user_id:
        db.add(ChannelMember(channel_id=channel.id, user_id=payload.target_user_id, role="member"))
    await db.commit()
    await db.refresh(channel)
    return ChannelResponse.model_validate(channel)


@router.get("/workspace/{workspace_id}", response_model=List[ChannelResponse])
async def list_channels(workspace_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """List all public channels and channels the user is a member of in a workspace."""
    from sqlalchemy import or_
    member_subq = select(ChannelMember.channel_id).where(ChannelMember.user_id == current_user.id)

    result = await db.execute(
        select(Channel)
        .where(
            Channel.workspace_id == workspace_id,
            Channel.is_archived == False,
            Channel.id.in_(member_subq)
        )
    )
    return [ChannelResponse.model_validate(c) for c in result.scalars().all()]


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
    from models.user import User
    result = await db.execute(
        select(User)
        .join(ChannelMember, ChannelMember.user_id == User.id)
        .where(ChannelMember.channel_id == channel_id)
    )
    return [UserPublicResponse.model_validate(u) for u in result.scalars().all()]
