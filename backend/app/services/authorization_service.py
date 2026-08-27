from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.models import User, Team, TeamMember, Channel, ChannelMember, ChannelType, MemberRole, Role

class AuthorizationService:
    @staticmethod
    async def get_user_role_name(user: User, db: AsyncSession) -> str:
        if user.is_superuser:
            return "SUPER_ADMIN"
        if not user.role_id:
            return "USER"
        # Queried explicitly by role_id rather than via `user.role` — callers
        # may pass a `user` whose relationships aren't (or are no longer)
        # eagerly loaded in this session, and a bare lazy-relationship access
        # can't complete outside SQLAlchemy's async greenlet context.
        res = await db.execute(select(Role).where(Role.id == user.role_id))
        role = res.scalars().first()
        return role.name.upper() if role else "USER"

    @staticmethod
    async def is_org_admin(user: User, db: AsyncSession) -> bool:
        role = await AuthorizationService.get_user_role_name(user, db)
        return role in ["SUPER_ADMIN", "ORG_ADMIN"]

    @staticmethod
    async def can_access_team(user: User, team_id: str, db: AsyncSession) -> bool:
        # The org-scoping filter must run before any admin bypass: an
        # ORG_ADMIN is only an admin of their OWN org, so "is_org_admin"
        # can never short-circuit this without first confirming the team
        # actually belongs to that org — otherwise any self-appointed admin
        # of a brand-new org could reach every other org's teams.
        res = await db.execute(
            select(Team).where(
                Team.id == team_id,
                Team.organization_id == user.organization_id,
                Team.deleted_at == None
            )
        )
        team = res.scalars().first()
        if not team:
            return False

        if await AuthorizationService.is_org_admin(user, db):
            return True

        if team.privacy == "public":
            return True

        mem_res = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user.id
            )
        )
        return mem_res.scalars().first() is not None

    @staticmethod
    async def can_manage_team(user: User, team_id: str, db: AsyncSession) -> bool:
        # Same ordering requirement as can_access_team above: confirm the
        # team belongs to the caller's org before any admin bypass applies.
        res = await db.execute(
            select(Team).where(
                Team.id == team_id,
                Team.organization_id == user.organization_id,
                Team.deleted_at == None
            )
        )
        team = res.scalars().first()
        if not team:
            return False

        if await AuthorizationService.is_org_admin(user, db):
            return True

        mem_res = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user.id,
                TeamMember.role == MemberRole.OWNER
            )
        )
        return mem_res.scalars().first() is not None

    @staticmethod
    async def can_access_channel(user: User, channel_id: str, db: AsyncSession) -> bool:
        res = await db.execute(
            select(Channel).where(
                Channel.id == channel_id,
                Channel.deleted_at == None
            )
        )
        channel = res.scalars().first()
        if not channel:
            return False

        # First check team access
        team_access = await AuthorizationService.can_access_team(user, str(channel.team_id), db)
        if not team_access:
            return False

        if channel.type == ChannelType.STANDARD:
            return True

        # Private Channel: Must be channel member or team owner/org admin
        if await AuthorizationService.can_manage_team(user, str(channel.team_id), db):
            return True

        cm_res = await db.execute(
            select(ChannelMember).where(
                ChannelMember.channel_id == channel_id,
                ChannelMember.user_id == user.id
            )
        )
        return cm_res.scalars().first() is not None

    @staticmethod
    async def can_manage_channel(user: User, channel_id: str, db: AsyncSession) -> bool:
        res = await db.execute(
            select(Channel).where(
                Channel.id == channel_id,
                Channel.deleted_at == None
            )
        )
        channel = res.scalars().first()
        if not channel:
            return False

        if await AuthorizationService.can_manage_team(user, str(channel.team_id), db):
            return True

        if str(channel.created_by) == str(user.id):
            return True

        cm_res = await db.execute(
            select(ChannelMember).where(
                ChannelMember.channel_id == channel_id,
                ChannelMember.user_id == user.id,
                ChannelMember.role == "OWNER"
            )
        )
        return cm_res.scalars().first() is not None
