from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.models.models import Team, TeamMember, MemberRole

class TeamRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, team_id: str) -> Optional[Team]:
        res = await self.db.execute(
            select(Team)
            .options(selectinload(Team.channels), selectinload(Team.members))
            .where(Team.id == team_id)
        )
        return res.scalars().first()

    async def get_all_by_org(self, organization_id: str) -> List[Team]:
        res = await self.db.execute(
            select(Team)
            .options(selectinload(Team.channels), selectinload(Team.members))
            .where(Team.organization_id == organization_id)
        )
        return list(res.scalars().all())

    async def create(self, team: Team) -> Team:
        self.db.add(team)
        await self.db.commit()
        await self.db.refresh(team)
        return team

    async def update(self, team: Team) -> Team:
        await self.db.commit()
        await self.db.refresh(team)
        return team

    async def delete(self, team: Team) -> None:
        await self.db.delete(team)
        await self.db.commit()

    async def add_member(self, team_id: str, user_id: str, role: MemberRole = MemberRole.MEMBER) -> TeamMember:
        member = TeamMember(team_id=team_id, user_id=user_id, role=role)
        self.db.add(member)
        await self.db.commit()
        await self.db.refresh(member)
        return member

    async def remove_member(self, team_id: str, user_id: str) -> bool:
        res = await self.db.execute(
            select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        )
        member = res.scalars().first()
        if member:
            await self.db.delete(member)
            await self.db.commit()
            return True
        return False
