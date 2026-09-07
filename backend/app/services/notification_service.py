import logging
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.notification import Notification, NotificationPreference
from app.core.websocket import ws_manager

logger = logging.getLogger(__name__)

async def create_notification(
    db: AsyncSession,
    user_id: str,
    title: str,
    body: str,
    type: str = "MESSAGE",
    priority: str = "NORMAL",
    icon: Optional[str] = None,
    entity_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    call_id: Optional[str] = None,
    meeting_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Optional[Notification]:
    """
    Create a persistent notification in DB and emit real-time WebSocket notification event.
    Safely handles invalid user_id UUIDs and DB errors.
    """
    try:
        try:
            uid = uuid.UUID(str(user_id))
        except (ValueError, TypeError):
            logger.warning(f"Invalid user_id UUID for notification: {user_id}")
            return None

        notif = Notification(
            id=uuid.uuid4(),
            user_id=uid,
            type=type,
            priority=priority,
            title=title,
            body=body,
            icon=icon,
            entity_id=entity_id,
            conversation_id=conversation_id,
            call_id=call_id,
            meeting_id=meeting_id,
            status="UNREAD",
            created_at=datetime.utcnow()
        )
        db.add(notif)
        await db.commit()
        await db.refresh(notif)

        payload = {
            "type": "notification.new",
            "notification": notif.to_dict()
        }
        await ws_manager.send_personal_message(str(user_id), payload)
        return notif
    except Exception as e:
        logger.error(f"Error creating notification: {e}")
        return None

async def get_user_preferences(db: AsyncSession, user_id: str) -> NotificationPreference:
    """Get or create default notification preferences for a user."""
    u_uuid = uuid.UUID(str(user_id))
    stmt = select(NotificationPreference).where(NotificationPreference.user_id == u_uuid)
    res = await db.execute(stmt)
    pref = res.scalars().first()
    if not pref:
        pref = NotificationPreference(user_id=u_uuid)
        db.add(pref)
        await db.commit()
        await db.refresh(pref)
    return pref

async def update_user_preferences(db: AsyncSession, user_id: str, updates: Dict[str, Any]) -> NotificationPreference:
    """Update notification preferences for a user."""
    pref = await get_user_preferences(db, user_id)
    field_map = {
        "enableMessages": "enable_messages",
        "enableMentions": "enable_mentions",
        "enableCalls": "enable_calls",
        "enableMeetings": "enable_meetings",
        "enableFiles": "enable_files",
        "enableSystem": "enable_system",
        "enableSound": "enable_sound",
        "enableDesktopNotifs": "enable_desktop_notifs",
        "enableBrowserNotifs": "enable_browser_notifs",
        "dndEnabled": "dnd_enabled",
        "dndStartTime": "dnd_start_time",
        "dndEndTime": "dnd_end_time",
        "allowCallsInDnd": "allow_calls_in_dnd"
    }
    for k, v in updates.items():
        attr = field_map.get(k, k)
        if hasattr(pref, attr):
            setattr(pref, attr, v)
    pref.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(pref)
    return pref
