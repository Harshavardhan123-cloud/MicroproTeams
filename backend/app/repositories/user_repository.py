from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.models import User

class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: str) -> Optional[User]:
        res = await self.db.execute(select(User).where(User.id == user_id))
        return res.scalars().first()

    async def get_by_email(self, email: str) -> Optional[User]:
        res = await self.db.execute(select(User).where(User.email == email))
        return res.scalars().first()

    async def get_by_username(self, username: str) -> Optional[User]:
        res = await self.db.execute(select(User).where(User.username == username))
        return res.scalars().first()

    async def get_all_by_org(self, organization_id: str) -> List[User]:
        res = await self.db.execute(select(User).where(User.organization_id == organization_id))
        return list(res.scalars().all())

    async def create(self, user: User) -> User:
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user
