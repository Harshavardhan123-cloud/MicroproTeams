from typing import List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.repositories.message_repository import MessageRepository
from app.models.models import Message, MessageType, PinnedMessage, User, DirectConversationMember, UserMessageDeletion
from app.models.models import (
    Message, MessageType, PinnedMessage, User, DirectConversationMember,
    UserMessageDeletion, Channel, ChannelMember, TeamMember, ChannelType
)
from app.core.websocket import ws_manager
from app.services.authorization_service import AuthorizationService

class MessageAccessError(Exception):
    """Raised when a user has no access to a message's channel/conversation."""

class MessageService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = MessageRepository(db)

    async def _get_visible_history_from(self, channel: Channel, user: User) -> Optional[datetime]:
        """Check if user has a visible_history_from restriction on the channel/team."""
        is_admin = getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or await AuthorizationService.is_org_admin(user, self.db)
        if is_admin:
            return None

        # If team owner, no restriction
        if await AuthorizationService.can_manage_team(user, str(channel.team_id), self.db):
            return None

        if channel.type == ChannelType.PRIVATE:
            cm_res = await self.db.execute(
                select(ChannelMember.visible_history_from).where(
                    ChannelMember.channel_id == channel.id,
                    ChannelMember.user_id == user.id
                )
            )
            return cm_res.scalars().first()
        else:
            tm_res = await self.db.execute(
                select(TeamMember.visible_history_from).where(
                    TeamMember.team_id == channel.team_id,
                    TeamMember.user_id == user.id
                )
            )
            return tm_res.scalars().first()

    async def _ensure_can_access_message(self, msg: Message, current_user: User) -> None:
        if msg.channel_id:
            allowed = await AuthorizationService.can_access_channel(current_user, str(msg.channel_id), self.db)
            if allowed:
                ch_res = await self.db.execute(select(Channel).where(Channel.id == msg.channel_id))
                ch = ch_res.scalars().first()
                if ch:
                    visible_from = await self._get_visible_history_from(ch, current_user)
                    if visible_from is not None and msg.created_at and msg.created_at < visible_from:
                        if str(msg.sender_id) != str(current_user.id):
                            allowed = False
        elif msg.conversation_id:
            res = await self.db.execute(
                select(DirectConversationMember).where(
                    DirectConversationMember.conversation_id == msg.conversation_id,
                    DirectConversationMember.user_id == current_user.id
                )
            )
            allowed = res.scalars().first() is not None
        else:
            allowed = False

        if not allowed:
            raise MessageAccessError("You do not have access to this message.")

    def format_message(self, m: Message) -> dict:
        sender_obj = m.__dict__.get("sender")
        reactions_list = m.__dict__.get("reactions", [])
        replies_list = m.__dict__.get("replies", [])
        attachments_list = m.__dict__.get("attachments", [])

        formatted_attachments = []
        if attachments_list:
            for att in attachments_list:
                formatted_attachments.append({
                    "id": str(att.id),
                    "name": att.display_name,
                    "url": getattr(att, "file_url", None) or getattr(att, "url", ""),
                    "type": getattr(att, "mime_type", None),
                    "size": getattr(att, "size", None),
                    "file_id": str(att.file_id) if getattr(att, "file_id", None) else None
                })

        return {
            "id": str(m.id),
            "client_message_id": m.client_message_id,
            "channel_id": str(m.channel_id) if m.channel_id else None,
            "conversation_id": str(m.conversation_id) if m.conversation_id else None,
            "sender_id": str(m.sender_id),
            "parent_message_id": str(m.parent_message_id) if m.parent_message_id else None,
            "message_type": m.message_type,
            "content": m.content,
            "attachments": formatted_attachments,
            "is_edited": m.is_edited,
            "is_pinned": m.is_pinned,
            "is_read": getattr(m, "is_read", False),
            "read_at": m.read_at.isoformat() if getattr(m, "read_at", None) else None,
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

    async def get_channel_messages(self, channel_id: str, limit: int = 300, current_user: Optional[User] = None) -> List[dict]:
        messages = await self.repo.get_channel_messages(channel_id, limit)
        if current_user:
            del_res = await self.db.execute(
                select(UserMessageDeletion.message_id).where(UserMessageDeletion.user_id == current_user.id)
            )
            deleted_ids = set(del_res.scalars().all())
            messages = [m for m in messages if m.id not in deleted_ids]

            ch_res = await self.db.execute(select(Channel).where(Channel.id == channel_id))
            channel = ch_res.scalars().first()
            if channel:
                visible_from = await self._get_visible_history_from(channel, current_user)
                if visible_from is not None:
                    messages = [
                        m for m in messages
                        if (m.created_at and m.created_at >= visible_from) or str(m.sender_id) == str(current_user.id)
                    ]

        return [self.format_message(m) for m in messages]

    async def get_replies(self, parent_id: str, current_user: User) -> List[dict]:
        parent = await self.repo.get_by_id(parent_id)
        if not parent:
            return []
        await self._ensure_can_access_message(parent, current_user)
        replies = await self.repo.get_replies(parent_id)

        if parent.channel_id:
            ch_res = await self.db.execute(select(Channel).where(Channel.id == parent.channel_id))
            channel = ch_res.scalars().first()
            if channel:
                visible_from = await self._get_visible_history_from(channel, current_user)
                if visible_from is not None:
                    replies = [
                        r for r in replies
                        if (r.created_at and r.created_at >= visible_from) or str(r.sender_id) == str(current_user.id)
                    ]

        return [self.format_message(m) for m in replies]

    async def create_message(
        self,
        sender_id: str,
        channel_id: Optional[str],
        content: str,
        parent_message_id: Optional[str] = None,
        message_type: MessageType = MessageType.TEXT,
        client_message_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        attachments: Optional[List[dict]] = None
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
        self.db.add(msg)
        await self.db.commit()
        await self.db.refresh(msg)

        if attachments:
            from app.models.models import MessageAttachment, FileRecord
            for att in attachments:
                att_name = att.get("name") if isinstance(att, dict) else getattr(att, "name", "Attachment")
                att_url = att.get("url") if isinstance(att, dict) else getattr(att, "url", None)
                att_type = att.get("type") if isinstance(att, dict) else getattr(att, "type", None)
                att_size = att.get("size") if isinstance(att, dict) else getattr(att, "size", None)
                att_file_id = att.get("file_id") if isinstance(att, dict) else getattr(att, "file_id", None)
                
                f_bytes = None
                b64_val = None
                if att_file_id:
                    try:
                        f_res = await self.db.execute(select(FileRecord).where(FileRecord.id == att_file_id))
                        f_rec = f_res.scalars().first()
                        if f_rec:
                            f_bytes = f_rec.file_data
                            b64_val = f_rec.base64_data
                    except Exception:
                        pass

                att_obj = MessageAttachment(
                    message_id=msg.id,
                    display_name=att_name or "Attachment",
                    file_url=att_url,
                    mime_type=att_type,
                    size=att_size,
                    file_id=att_file_id,
                    file_data=f_bytes,
                    base64_data=b64_val,
                    sort_order="0"
                )
                self.db.add(att_obj)
            await self.db.commit()

        full_msg = await self.repo.get_by_id(msg.id)
        formatted = self.format_message(full_msg or msg)

        # Broadcast via WebSocket to channel members
        if channel_id:
            await ws_manager.broadcast_to_channel(channel_id, {
                "type": "message.new",
                "message": formatted
            })

        return formatted

    async def update_message(self, message_id: str, current_user: User, content: str, attachments: Optional[list] = None) -> Optional[dict]:
        msg = await self.repo.get_by_id(message_id)
        if not msg or str(msg.sender_id) != str(current_user.id):
            return None
        await self._ensure_can_access_message(msg, current_user)

        msg.content = content
        msg.is_edited = True

        # Replace attachments if provided (e.g., annotated image edit)
        if attachments is not None:
            from sqlalchemy import delete as sa_delete
            from app.models.models import MessageAttachment, FileRecord
            await self.db.execute(sa_delete(MessageAttachment).where(MessageAttachment.message_id == msg.id))
            for att in attachments:
                att_name = att.get("name") if isinstance(att, dict) else getattr(att, "name", "Attachment")
                att_url = att.get("url") if isinstance(att, dict) else getattr(att, "url", None)
                att_type = att.get("type") if isinstance(att, dict) else getattr(att, "type", None)
                att_size = att.get("size") if isinstance(att, dict) else getattr(att, "size", None)
                att_file_id = att.get("file_id") if isinstance(att, dict) else getattr(att, "file_id", None)

                f_bytes = None
                b64_val = None
                if att_file_id:
                    try:
                        f_res = await self.db.execute(select(FileRecord).where(FileRecord.id == att_file_id))
                        f_rec = f_res.scalars().first()
                        if f_rec:
                            f_bytes = f_rec.file_data
                            b64_val = f_rec.base64_data
                    except Exception:
                        pass

                att_obj = MessageAttachment(
                    message_id=msg.id,
                    display_name=att_name or "Attachment",
                    file_url=att_url,
                    mime_type=att_type,
                    size=att_size,
                    file_id=att_file_id,
                    file_data=f_bytes,
                    base64_data=b64_val,
                    sort_order="0"
                )
                self.db.add(att_obj)

        updated = await self.repo.update(msg)
        formatted = self.format_message(updated)

        if msg.channel_id:
            await ws_manager.broadcast_to_channel(str(msg.channel_id), {
                "type": "message.update",
                "message": formatted
            })

        return formatted

    async def delete_message(self, message_id: str, current_user: User) -> bool:
        msg = await self.repo.get_by_id(message_id)
        if not msg:
            return False

        is_sender = str(msg.sender_id) == str(current_user.id)
        is_admin = getattr(current_user, 'is_superuser', False) or await AuthorizationService.is_org_admin(current_user, self.db)
        can_manage = False
        if msg.channel_id:
            can_manage = await AuthorizationService.can_manage_channel(current_user, str(msg.channel_id), self.db)

        if not (is_sender or is_admin or can_manage):
            return False

        await self._ensure_can_access_message(msg, current_user)

        channel_id = str(msg.channel_id) if msg.channel_id else None
        conv_id = str(msg.conversation_id) if msg.conversation_id else None
        await self.repo.delete(msg)

        if channel_id:
            await ws_manager.broadcast_to_channel(channel_id, {
                "type": "message.delete",
                "message_id": message_id
            })
        elif conv_id:
            mem_res = await self.db.execute(select(DirectConversationMember.user_id).where(DirectConversationMember.conversation_id == conv_id))
            member_user_ids = [str(uid) for uid in mem_res.scalars().all()]
            for target_user_id in member_user_ids:
                await ws_manager.send_personal_message(target_user_id, {
                    "type": "direct_message.delete",
                    "conversation_id": conv_id,
                    "message_id": message_id
                })

        return True

    async def toggle_reaction(self, message_id: str, current_user: User, emoji: str) -> Optional[dict]:
        msg = await self.repo.get_by_id(message_id)
        if not msg:
            return None
        await self._ensure_can_access_message(msg, current_user)
        user_id = str(current_user.id)

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

    async def pin_message(self, message_id: str, current_user: User) -> Optional[dict]:
        msg = await self.repo.get_by_id(message_id)
        if not msg:
            return None
        await self._ensure_can_access_message(msg, current_user)

        msg.is_pinned = True
        await self.db.commit()

        pin_target = str(msg.channel_id) if msg.channel_id else str(msg.conversation_id or message_id)
        pinned = PinnedMessage(conversation_id=pin_target, message_id=msg.id, pinned_by=current_user.id)
        self.db.add(pinned)
        await self.db.commit()

        formatted = self.format_message(msg)
        if msg.channel_id:
            await ws_manager.broadcast_to_channel(str(msg.channel_id), {
                "type": "message.pinned",
                "message": formatted
            })

        return formatted

    async def unpin_message(self, message_id: str, current_user: User) -> Optional[dict]:
        msg = await self.repo.get_by_id(message_id)
        if not msg:
            return None
        await self._ensure_can_access_message(msg, current_user)

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
