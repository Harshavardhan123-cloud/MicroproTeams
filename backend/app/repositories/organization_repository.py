from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.models import Organization

class OrganizationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, org_id: str) -> Optional[Organization]:
        res = await self.db.execute(select(Organization).where(Organization.id == org_id))
        return res.scalars().first()

    async def get_by_slug(self, slug: str) -> Optional[Organization]:
        res = await self.db.execute(select(Organization).where(Organization.slug == slug))
        return res.scalars().first()

    async def create(self, org: Organization) -> Organization:
        self.db.add(org)
        await self.db.commit()
        await self.db.refresh(org)
        return org
