from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import Channel, ChannelMember, Team, TeamMember, User, ChannelType, ChannelMemberRole
from app.api.deps import get_current_user
from app.services.authorization_service import AuthorizationService
from app.services.audit_service import AuditService
from app.core.response import success_response, error_response

router = APIRouter(tags=["Channels"])

class ChannelCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    channel_type: ChannelType = ChannelType.STANDARD

class ChannelUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class AddChannelMemberRequest(BaseModel):
    user_id: str

@router.post("/teams/{team_id}/channels")
async def create_channel(
    team_id: str,
    req: ChannelCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_access_team(current_user, team_id, db):
        raise HTTPException(status_code=403, detail="Access denied to team")

    # Case-insensitive duplicate check within team
    existing = await db.execute(
        select(Channel).where(
            Channel.team_id == team_id,
            Channel.deleted_at == None
        )
    )
    for c in existing.scalars().all():
        if c.name.lower() == req.name.strip().lower():
            return error_response("CHANNEL_NAME_EXISTS", f"Channel with name '{c.name}' already exists in this team.", status_code=400)

    channel = Channel(
        team_id=team_id,
        name=req.name.strip(),
        description=req.description,
        type=req.channel_type,
        created_by=current_user.id
    )
    db.add(channel)
    await db.flush()

    # For PRIVATE channel, add creator as OWNER
    if req.channel_type == ChannelType.PRIVATE:
        cm = ChannelMember(
            channel_id=channel.id,
            user_id=current_user.id,
            role=ChannelMemberRole.OWNER
        )
        db.add(cm)

    await db.commit()
    await db.refresh(channel)

    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "CHANNEL_CREATED", "channel", str(channel.id),
        details=f"Created channel '{channel.name}' (type: {channel.type})"
    )

    return success_response({
        "id": str(channel.id),
        "team_id": str(channel.team_id),
        "name": channel.name,
        "description": channel.description,
        "type": channel.type,
        "created_by": str(channel.created_by)
    }, status_code=201)

@router.get("/teams/{team_id}/channels")
async def get_team_channels(
    team_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_access_team(current_user, team_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    res = await db.execute(
        select(Channel).where(Channel.team_id == team_id, Channel.deleted_at == None)
    )
    channels = res.scalars().all()

    output = []
    for c in channels:
        if await AuthorizationService.can_access_channel(current_user, str(c.id), db):
            output.append({
                "id": str(c.id),
                "team_id": str(c.team_id),
                "name": c.name,
                "description": c.description,
                "type": c.type,
                "created_by": str(c.created_by)
            })

    return success_response(output)

@router.get("/channels/{channel_id}")
async def get_channel_details(
    channel_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_access_channel(current_user, channel_id, db):
        raise HTTPException(status_code=403, detail="Access denied to channel")

    res = await db.execute(
        select(Channel)
        .options(selectinload(Channel.members))
        .where(Channel.id == channel_id, Channel.deleted_at == None)
    )
    channel = res.scalars().first()
    if not channel:
        return error_response("CHANNEL_NOT_FOUND", "Channel not found.", status_code=404)

    return success_response({
        "id": str(channel.id),
        "team_id": str(channel.team_id),
        "name": channel.name,
        "description": channel.description,
        "type": channel.type,
        "created_by": str(channel.created_by),
        "member_count": len(channel.members) if channel.type == ChannelType.PRIVATE else None
    })

@router.patch("/channels/{channel_id}")
async def update_channel(
    channel_id: str,
    req: ChannelUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_manage_channel(current_user, channel_id, db):
        raise HTTPException(status_code=403, detail="Permission denied to update channel")

    res = await db.execute(select(Channel).where(Channel.id == channel_id, Channel.deleted_at == None))
    channel = res.scalars().first()
    if not channel:
        return error_response("CHANNEL_NOT_FOUND", "Channel not found.", status_code=404)

    if req.name is not None:
        channel.name = req.name.strip()
    if req.description is not None:
        channel.description = req.description

    await db.commit()
    await db.refresh(channel)

    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "CHANNEL_UPDATED", "channel", str(channel.id),
        details=f"Updated channel '{channel.name}'"
    )

    return success_response({
        "id": str(channel.id),
        "name": channel.name,
        "description": channel.description,
        "type": channel.type
    })

@router.delete("/channels/{channel_id}")
async def delete_channel(
    channel_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_manage_channel(current_user, channel_id, db):
        raise HTTPException(status_code=403, detail="Permission denied to delete channel")

    res = await db.execute(select(Channel).where(Channel.id == channel_id, Channel.deleted_at == None))
    channel = res.scalars().first()
    if not channel:
        return error_response("CHANNEL_NOT_FOUND", "Channel not found.", status_code=404)

    # Prevent deleting default General channel
    if channel.name.lower() == "general":
        return error_response("CANNOT_DELETE_GENERAL", "General channel cannot be deleted.", status_code=400)

    channel.deleted_at = datetime.utcnow()
    await db.commit()

    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "CHANNEL_DELETED", "channel", str(channel.id),
        details=f"Soft deleted channel '{channel.name}'"
    )

    return success_response({"message": "Channel deleted successfully."})

@router.get("/channels/{channel_id}/members")
async def get_private_channel_members(
    channel_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_access_channel(current_user, channel_id, db):
        raise HTTPException(status_code=403, detail="Access denied to channel")

    res = await db.execute(
        select(ChannelMember)
        .options(selectinload(ChannelMember.user))
        .where(ChannelMember.channel_id == channel_id)
    )
    members = res.scalars().all()

    data = [
        {
            "id": str(m.id),
            "channel_id": str(m.channel_id),
            "user_id": str(m.user_id),
            "role": m.role,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            "user": {
                "id": str(m.user.id),
                "display_name": m.user.display_name,
                "email": m.user.email,
                "avatar_url": m.user.avatar_url
            } if m.user else None
        }
        for m in members
    ]
    return success_response(data)

@router.post("/channels/{channel_id}/members")
async def add_private_channel_member(
    channel_id: str,
    req: AddChannelMemberRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_manage_channel(current_user, channel_id, db):
        raise HTTPException(status_code=403, detail="Only channel manager or team owner can add members")

    ch_res = await db.execute(select(Channel).where(Channel.id == channel_id, Channel.deleted_at == None))
    channel = ch_res.scalars().first()
    if not channel:
        return error_response("CHANNEL_NOT_FOUND", "Channel not found.", status_code=404)

    if channel.type != ChannelType.PRIVATE:
        return error_response("NOT_PRIVATE_CHANNEL", "Standard channels automatically include all team members.", status_code=400)

    # Verify user is a member of the parent team
    tm_res = await db.execute(select(TeamMember).where(TeamMember.team_id == channel.team_id, TeamMember.user_id == req.user_id))
    if not tm_res.scalars().first():
        return error_response("USER_NOT_IN_TEAM", "User must be a member of the team before joining private channels.", status_code=400)

    # Check if already member
    existing = await db.execute(select(ChannelMember).where(ChannelMember.channel_id == channel_id, ChannelMember.user_id == req.user_id))
    if existing.scalars().first():
        return error_response("MEMBER_EXISTS", "User is already a member of this private channel.", status_code=400)

    cm = ChannelMember(channel_id=channel_id, user_id=req.user_id, role=ChannelMemberRole.MEMBER)
    db.add(cm)
    await db.commit()
    await db.refresh(cm)

    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "CHANNEL_MEMBER_ADDED", "channel_member", str(cm.id),
        details=f"Added user '{req.user_id}' to private channel '{channel_id}'"
    )

    return success_response({
        "id": str(cm.id),
        "channel_id": str(cm.channel_id),
        "user_id": str(cm.user_id),
        "role": cm.role
    }, status_code=201)

@router.delete("/channels/{channel_id}/members/{user_id}")
async def remove_private_channel_member(
    channel_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_manage_channel(current_user, channel_id, db):
        raise HTTPException(status_code=403, detail="Only channel manager or team owner can remove members")

    res = await db.execute(select(ChannelMember).where(ChannelMember.channel_id == channel_id, ChannelMember.user_id == user_id))
    cm = res.scalars().first()
    if not cm:
        return error_response("MEMBER_NOT_FOUND", "Private channel member not found.", status_code=404)

    await db.delete(cm)
    await db.commit()

    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "CHANNEL_MEMBER_REMOVED", "channel_member", user_id,
        details=f"Removed user '{user_id}' from private channel '{channel_id}'"
    )

    return success_response({"message": "Channel member removed successfully."})
