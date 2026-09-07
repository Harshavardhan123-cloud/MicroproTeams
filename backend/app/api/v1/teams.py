from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import Team, TeamMember, Channel, ChannelMember, User, TeamPrivacy, ChannelType, MemberRole, ChannelMemberRole
from app.api.deps import get_current_user
from app.permissions.permissions import PermissionChecker, SystemPermissions
from app.services.authorization_service import AuthorizationService
from app.services.audit_service import AuditService
from app.core.response import success_response, error_response

router = APIRouter(prefix="/teams", tags=["Teams"])

class TeamCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    privacy: TeamPrivacy = TeamPrivacy.PUBLIC
    avatar_url: Optional[str] = None
    member_ids: Optional[List[str]] = None

class TeamUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    privacy: Optional[TeamPrivacy] = None
    avatar_url: Optional[str] = None

class AddMemberRequest(BaseModel):
    user_id: str
    role: MemberRole = MemberRole.MEMBER

class UpdateMemberRoleRequest(BaseModel):
    role: MemberRole

class TransferOwnershipRequest(BaseModel):
    new_owner_id: str

@router.get("")
async def list_teams(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Team)
        .options(selectinload(Team.channels), selectinload(Team.members))
        .where(
            Team.organization_id == current_user.organization_id,
            Team.deleted_at == None
        )
    )
    teams = res.scalars().all()
    
    data = []
    for team in teams:
        can_access = await AuthorizationService.can_access_team(current_user, str(team.id), db)
        if not can_access:
            continue

        # Filter channels accessible to current user
        accessible_channels = []
        for c in team.channels:
            if c.deleted_at is not None:
                continue
            if await AuthorizationService.can_access_channel(current_user, str(c.id), db):
                accessible_channels.append({
                    "id": str(c.id),
                    "name": c.name,
                    "description": c.description,
                    "type": c.type
                })

        data.append({
            "id": str(team.id),
            "organization_id": str(team.organization_id),
            "name": team.name,
            "description": team.description,
            "privacy": team.privacy,
            "avatar_url": team.avatar_url,
            "owner_id": str(team.owner_id),
            "channels": accessible_channels,
            "members_count": len(team.members)
        })

    return success_response(data)

@router.post("")
async def create_team(
    req: TeamCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    team = Team(
        organization_id=current_user.organization_id,
        name=req.name,
        description=req.description,
        privacy=req.privacy,
        avatar_url=req.avatar_url,
        owner_id=current_user.id
    )
    db.add(team)
    await db.flush()

    # Creator becomes OWNER
    member = TeamMember(
        team_id=team.id,
        user_id=current_user.id,
        role=MemberRole.OWNER
    )
    db.add(member)

    # Add initial specified team members
    if req.member_ids:
        for uid in req.member_ids:
            if str(uid) != str(current_user.id):
                u_res = await db.execute(
                    select(User.id).where(User.id == uid, User.organization_id == current_user.organization_id)
                )
                if u_res.scalars().first():
                    db.add(TeamMember(
                        team_id=team.id,
                        user_id=uid,
                        role=MemberRole.MEMBER
                    ))

    # Create default General channel
    general_channel = Channel(
        team_id=team.id,
        name="General",
        description="General discussions and announcements",
        type=ChannelType.STANDARD,
        created_by=current_user.id
    )
    db.add(general_channel)

    await db.commit()
    await db.refresh(team)

    # Audit Log
    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "TEAM_CREATED", "team", str(team.id), details=f"Created team '{team.name}'"
    )

    return success_response({
        "id": str(team.id),
        "organization_id": str(team.organization_id),
        "name": team.name,
        "description": team.description,
        "privacy": team.privacy,
        "avatar_url": team.avatar_url,
        "owner_id": str(team.owner_id),
        "channels": [
            {
                "id": str(general_channel.id),
                "name": general_channel.name,
                "description": general_channel.description,
                "type": general_channel.type
            }
        ]
    }, status_code=201)

@router.get("/{team_id}")
async def get_team(
    team_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_access_team(current_user, team_id, db):
        raise HTTPException(status_code=403, detail="Access denied to team")

    res = await db.execute(
        select(Team)
        .options(selectinload(Team.channels), selectinload(Team.members))
        .where(Team.id == team_id, Team.deleted_at == None)
    )
    team = res.scalars().first()
    if not team:
        return error_response("TEAM_NOT_FOUND", "Team not found.", status_code=404)

    accessible_channels = []
    for c in team.channels:
        if c.deleted_at is not None:
            continue
        if await AuthorizationService.can_access_channel(current_user, str(c.id), db):
            accessible_channels.append({
                "id": str(c.id),
                "name": c.name,
                "description": c.description,
                "type": c.type
            })

    return success_response({
        "id": str(team.id),
        "organization_id": str(team.organization_id),
        "name": team.name,
        "description": team.description,
        "privacy": team.privacy,
        "avatar_url": team.avatar_url,
        "owner_id": str(team.owner_id),
        "channels": accessible_channels,
        "members_count": len(team.members)
    })

@router.patch("/{team_id}")
async def update_team(
    team_id: str,
    req: TeamUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_manage_team(current_user, team_id, db):
        raise HTTPException(status_code=403, detail="Only team owner or org admin can update team")

    res = await db.execute(select(Team).where(Team.id == team_id, Team.deleted_at == None))
    team = res.scalars().first()
    if not team:
        return error_response("TEAM_NOT_FOUND", "Team not found.", status_code=404)

    if req.name is not None:
        team.name = req.name
    if req.description is not None:
        team.description = req.description
    if req.privacy is not None:
        team.privacy = req.privacy
    if req.avatar_url is not None:
        team.avatar_url = req.avatar_url

    await db.commit()
    await db.refresh(team)

    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "TEAM_UPDATED", "team", str(team.id), details=f"Updated team '{team.name}'"
    )

    return success_response({
        "id": str(team.id),
        "name": team.name,
        "description": team.description,
        "privacy": team.privacy,
        "avatar_url": team.avatar_url
    })

@router.delete("/{team_id}")
async def delete_team(
    team_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_manage_team(current_user, team_id, db):
        raise HTTPException(status_code=403, detail="Only team owner or org admin can delete team")

    res = await db.execute(select(Team).where(Team.id == team_id, Team.deleted_at == None))
    team = res.scalars().first()
    if not team:
        return error_response("TEAM_NOT_FOUND", "Team not found.", status_code=404)

    # Soft deletion
    team.deleted_at = datetime.utcnow()
    await db.commit()

    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "TEAM_DELETED", "team", str(team.id), details=f"Soft deleted team '{team.name}'"
    )

    return success_response({"message": "Team deleted successfully."})

@router.get("/{team_id}/members")
async def get_team_members(
    team_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_access_team(current_user, team_id, db):
        raise HTTPException(status_code=403, detail="Access denied")

    res = await db.execute(
        select(TeamMember)
        .options(selectinload(TeamMember.user))
        .where(TeamMember.team_id == team_id)
    )
    members = res.scalars().all()

    data = [
        {
            "id": str(m.id),
            "team_id": str(m.team_id),
            "user_id": str(m.user_id),
            "role": m.role,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            "user": {
                "id": str(m.user.id),
                "display_name": m.user.display_name,
                "email": m.user.email,
                "avatar_url": m.user.avatar_url,
                "presence": m.user.presence
            } if m.user else None
        }
        for m in members
    ]
    return success_response(data)

@router.post("/{team_id}/members")
async def add_team_member(
    team_id: str,
    req: AddMemberRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_manage_team(current_user, team_id, db):
        raise HTTPException(status_code=403, detail="Only team owner or org admin can add members")

    # Verify user belongs to same org
    u_res = await db.execute(select(User).where(User.id == req.user_id, User.organization_id == current_user.organization_id))
    target_user = u_res.scalars().first()
    if not target_user:
        return error_response("USER_NOT_FOUND", "User not found in organization.", status_code=404)

    existing = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == req.user_id)
    )
    if existing.scalars().first():
        return error_response("MEMBER_EXISTS", "User is already a member of this team.", status_code=400)

    member = TeamMember(team_id=team_id, user_id=req.user_id, role=req.role)
    db.add(member)
    await db.commit()
    await db.refresh(member)

    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "TEAM_MEMBER_ADDED", "team_member", str(member.id),
        details=f"Added user '{target_user.display_name}' to team '{team_id}' with role '{req.role}'"
    )

    return success_response({
        "id": str(member.id),
        "team_id": str(member.team_id),
        "user_id": str(member.user_id),
        "role": member.role
    }, status_code=201)

@router.patch("/{team_id}/members/{user_id}")
async def update_team_member_role(
    team_id: str,
    user_id: str,
    req: UpdateMemberRoleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_manage_team(current_user, team_id, db):
        raise HTTPException(status_code=403, detail="Only team owner or org admin can update member roles")

    res = await db.execute(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id))
    member = res.scalars().first()
    if not member:
        return error_response("MEMBER_NOT_FOUND", "Member not found.", status_code=404)

    member.role = req.role
    await db.commit()

    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "TEAM_MEMBER_ROLE_CHANGED", "team_member", str(member.id),
        details=f"Updated member '{user_id}' role to '{req.role}'"
    )

    return success_response({"status": "updated", "role": member.role})

@router.delete("/{team_id}/members/{user_id}")
async def remove_team_member(
    team_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_manage_team(current_user, team_id, db):
        raise HTTPException(status_code=403, detail="Only team owner or org admin can remove members")

    res = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )
    member = res.scalars().first()
    if not member:
        return error_response("MEMBER_NOT_FOUND", "Team member not found.", status_code=404)

    if member.role == MemberRole.OWNER:
        owner_count_res = await db.execute(
            select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.role == MemberRole.OWNER)
        )
        if len(owner_count_res.scalars().all()) <= 1:
            return error_response(
                "LAST_OWNER",
                "This is the team's only owner. Transfer ownership to another member before removing them.",
                status_code=400
            )

    await db.delete(member)

    # Cascade remove user from all private channels in this team
    ch_res = await db.execute(select(Channel.id).where(Channel.team_id == team_id, Channel.type == ChannelType.PRIVATE))
    private_channel_ids = ch_res.scalars().all()
    if private_channel_ids:
        cm_res = await db.execute(
            select(ChannelMember).where(
                ChannelMember.channel_id.in_(private_channel_ids),
                ChannelMember.user_id == user_id
            )
        )
        for cm in cm_res.scalars().all():
            await db.delete(cm)

    await db.commit()

    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "TEAM_MEMBER_REMOVED", "team_member", user_id,
        details=f"Removed user '{user_id}' from team '{team_id}'"
    )

    return success_response({"message": "Member removed successfully."})

@router.post("/{team_id}/transfer-ownership")
async def transfer_team_ownership(
    team_id: str,
    req: TransferOwnershipRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_manage_team(current_user, team_id, db):
        raise HTTPException(status_code=403, detail="Only current owner or org admin can transfer ownership")

    t_res = await db.execute(select(Team).where(Team.id == team_id, Team.deleted_at == None))
    team = t_res.scalars().first()
    if not team:
        return error_response("TEAM_NOT_FOUND", "Team not found.", status_code=404)

    # Verify target user is a member of the team
    target_mem_res = await db.execute(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == req.new_owner_id))
    target_mem = target_mem_res.scalars().first()
    if not target_mem:
        return error_response("NEW_OWNER_NOT_MEMBER", "New owner must be an existing team member.", status_code=400)

    # Change current owner role to MEMBER
    curr_mem_res = await db.execute(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == team.owner_id))
    curr_mem = curr_mem_res.scalars().first()
    if curr_mem:
        curr_mem.role = MemberRole.MEMBER

    # Change new owner role to OWNER
    target_mem.role = MemberRole.OWNER
    team.owner_id = req.new_owner_id

    await db.commit()

    await AuditService.log_action(
        db, str(current_user.organization_id), str(current_user.id),
        "TEAM_OWNERSHIP_TRANSFERRED", "team", str(team.id),
        details=f"Transferred ownership of team '{team.name}' to user '{req.new_owner_id}'"
    )

    return success_response({"message": "Ownership transferred successfully.", "new_owner_id": req.new_owner_id})
