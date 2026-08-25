import asyncio
from core.database import AsyncSessionLocal
from models.user import User
from models.workspace import Channel
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        users = await db.execute(select(User))
        print([u.username for u in users.scalars().all()])

asyncio.run(main())
