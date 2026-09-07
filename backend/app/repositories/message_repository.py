from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.models.models import Message, MessageReaction

class MessageRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, message_id: str) -> Optional[Message]:
        self.db.expire_all()
        res = await self.db.execute(
            select(Message)
            .options(
                selectinload(Message.sender),
                selectinload(Message.reactions).selectinload(MessageReaction.user),
                selectinload(Message.attachments),
                selectinload(Message.replies)
            )
            .where(Message.id == message_id)
        )
        return res.scalars().first()

    async def get_channel_messages(self, channel_id: str, limit: int = 300) -> List[Message]:
        res = await self.db.execute(
            select(Message)
            .options(
                selectinload(Message.sender),
                selectinload(Message.reactions).selectinload(MessageReaction.user),
                selectinload(Message.attachments),
                selectinload(Message.replies)
            )
            .where(Message.channel_id == channel_id, Message.parent_message_id.is_(None))
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        return list(reversed(res.scalars().all()))

    async def get_replies(self, parent_message_id: str) -> List[Message]:
        res = await self.db.execute(
            select(Message)
            .options(
                selectinload(Message.sender),
                selectinload(Message.reactions).selectinload(MessageReaction.user),
                selectinload(Message.attachments),
                selectinload(Message.replies)
            )
            .where(Message.parent_message_id == parent_message_id)
            .order_by(Message.created_at.asc())
        )
        return list(res.scalars().all())

    async def create(self, message: Message) -> Message:
        self.db.add(message)
        await self.db.commit()
        await self.db.refresh(message)
        return await self.get_by_id(message.id)

    async def update(self, message: Message) -> Message:
        await self.db.commit()
        await self.db.refresh(message)
        return await self.get_by_id(message.id)

    async def delete(self, message: Message) -> None:
        await self.db.delete(message)
        await self.db.commit()

    async def toggle_reaction(self, message_id: str, user_id: str, emoji: str) -> bool:
        res = await self.db.execute(
            select(MessageReaction).where(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == user_id,
                MessageReaction.emoji == emoji
            )
        )
        existing = res.scalars().first()
        if existing:
            await self.db.delete(existing)
            await self.db.commit()
            return False
        else:
            reaction = MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji)
            self.db.add(reaction)
            await self.db.commit()
            return True
