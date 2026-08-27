from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.repositories.message_repository import MessageRepository
from app.models.models import Message, MessageType, PinnedMessage, Notification, User
from app.core.websocket import ws_manager

class MessageService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = MessageRepository(db)

    def format_message(self, m: Message) -> dict:
        sender_obj = m.__dict__.get("sender")
        reactions_list = m.__dict__.get("reactions", [])
        replies_list = m.__dict__.get("replies", [])

        return {
            "id": str(m.id),
            "client_message_id": m.client_message_id,
            "channel_id": str(m.channel_id) if m.channel_id else None,
            "conversation_id": str(m.conversation_id) if m.conversation_id else None,
            "sender_id": str(m.sender_id),
            "parent_message_id": str(m.parent_message_id) if m.parent_message_id else None,
            "message_type": m.message_type,
            "content": m.content,
            "is_edited": m.is_edited,
            "is_pinned": m.is_pinned,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "sender": {
                "id": str(sender_obj.id),
                "display_name": sender_obj.display_name,
                "email": sender_obj.email,
                "avatar_url": sender_obj.avatar_url,
                "presence": sender_obj.presence
            } if sender_obj else None,
            "reactions": [
                {
                    "id": str(r.id),
                    "emoji": r.emoji,
                    "user_id": str(r.user_id),
                    "user_name": r.user.display_name if ("user" in r.__dict__ and r.user) else ""
                }
                for r in (reactions_list or [])
            ],
            "replies_count": len(replies_list) if replies_list else 0
        }

    async def get_channel_messages(self, channel_id: str, limit: int = 50) -> List[dict]:
        messages = await self.repo.get_channel_messages(channel_id, limit)
        return [self.format_message(m) for m in messages]

    async def get_replies(self, parent_id: str) -> List[dict]:
        replies = await self.repo.get_replies(parent_id)
        return [self.format_message(m) for m in replies]

    async def create_message(
        self,
        sender_id: str,
        channel_id: Optional[str],
        content: str,
        parent_message_id: Optional[str] = None,
        message_type: MessageType = MessageType.TEXT,
        client_message_id: Optional[str] = None,
        conversation_id: Optional[str] = None
    ) -> dict:
        # Idempotency check
        if client_message_id:
            existing_res = await self.db.execute(
                select(Message).where(
                    Message.sender_id == sender_id,
                    Message.client_message_id == client_message_id
                )
            )
            existing = existing_res.scalars().first()
            if existing:
                full_existing = await self.repo.get_by_id(existing.id)
                return self.format_message(full_existing)

        msg = Message(
            sender_id=sender_id,
            channel_id=channel_id,
            conversation_id=conversation_id,
            content=content,
            parent_message_id=parent_message_id,
            message_type=message_type,
            client_message_id=client_message_id
        )
        created = await self.repo.create(msg)
        formatted = self.format_message(created)

        # Broadcast via WebSocket to channel members
        if channel_id:
            await ws_manager.broadcast_to_channel(channel_id, {
                "type": "message.new",
                "message": formatted
            })

        return formatted

    async def update_message(self, message_id: str, sender_id: str, content: str) -> Optional[dict]:
        msg = await self.repo.get_by_id(message_id)
        if not msg or str(msg.sender_id) != str(sender_id):
            return None

        msg.content = content
        msg.is_edited = True
        updated = await self.repo.update(msg)
        formatted = self.format_message(updated)

        if msg.channel_id:
            await ws_manager.broadcast_to_channel(str(msg.channel_id), {
                "type": "message.update",
                "message": formatted
            })

        return formatted

    async def delete_message(self, message_id: str, sender_id: str) -> bool:
        msg = await self.repo.get_by_id(message_id)
        if not msg or str(msg.sender_id) != str(sender_id):
            return False

        channel_id = str(msg.channel_id) if msg.channel_id else None
        await self.repo.delete(msg)

        if channel_id:
            await ws_manager.broadcast_to_channel(channel_id, {
                "type": "message.delete",
                "message_id": message_id
            })

        return True

    async def toggle_reaction(self, message_id: str, user_id: str, emoji: str) -> Optional[dict]:
        msg = await self.repo.get_by_id(message_id)
        if not msg:
            return None

        added = await self.repo.toggle_reaction(message_id, user_id, emoji)
        updated_msg = await self.repo.get_by_id(message_id)
        formatted = self.format_message(updated_msg)

        if msg.channel_id:
            await ws_manager.broadcast_to_channel(str(msg.channel_id), {
                "type": "reaction.toggle",
                "message": formatted,
                "emoji": emoji,
                "user_id": user_id,
                "added": added
            })

        return formatted

    async def pin_message(self, message_id: str, user_id: str) -> Optional[dict]:
        msg = await self.repo.get_by_id(message_id)
        if not msg:
            return None

        msg.is_pinned = True
        await self.db.commit()

        pin_target = str(msg.channel_id) if msg.channel_id else str(msg.conversation_id or message_id)
        pinned = PinnedMessage(conversation_id=pin_target, message_id=msg.id, pinned_by=user_id)
        self.db.add(pinned)
        await self.db.commit()

        formatted = self.format_message(msg)
        if msg.channel_id:
            await ws_manager.broadcast_to_channel(str(msg.channel_id), {
                "type": "message.pinned",
                "message": formatted
            })

        return formatted

    async def unpin_message(self, message_id: str, user_id: str) -> Optional[dict]:
        msg = await self.repo.get_by_id(message_id)
        if not msg:
            return None

        msg.is_pinned = False
        await self.db.commit()

        res = await self.db.execute(select(PinnedMessage).where(PinnedMessage.message_id == message_id))
        pinned_entries = res.scalars().all()
        for p in pinned_entries:
            await self.db.delete(p)
        await self.db.commit()

        formatted = self.format_message(msg)
        if msg.channel_id:
            await ws_manager.broadcast_to_channel(str(msg.channel_id), {
                "type": "message.unpinned",
                "message": formatted
            })

        return formatted
