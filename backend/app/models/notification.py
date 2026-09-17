import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey
from app.core.database import Base
from app.models.models import GUID

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False, default="MESSAGE")
    priority = Column(String(20), nullable=False, default="NORMAL")
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    icon = Column(String(512), nullable=True)
    entity_id = Column(String(255), nullable=True)
    conversation_id = Column(String(255), nullable=True)
    call_id = Column(String(255), nullable=True)
    meeting_id = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, default="UNREAD")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    read_at = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "notificationId": str(self.id),
            "userId": str(self.user_id),
            "user_id": str(self.user_id),
            "type": self.type,
            "priority": self.priority,
            "title": self.title,
            "body": self.body,
            "icon": self.icon,
            "entityId": self.entity_id,
            "entity_id": self.entity_id,
            "conversationId": self.conversation_id,
            "conversation_id": self.conversation_id,
            "callId": self.call_id,
            "call_id": self.call_id,
            "meetingId": self.meeting_id,
            "meeting_id": self.meeting_id,
            "status": self.status,
            "is_read": self.status == "READ",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "read_at": self.read_at.isoformat() if self.read_at else None
        }

class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, unique=True, index=True)
    enable_messages = Column(Boolean, default=True, nullable=False)
    enable_mentions = Column(Boolean, default=True, nullable=False)
    enable_calls = Column(Boolean, default=True, nullable=False)
    enable_meetings = Column(Boolean, default=True, nullable=False)
    enable_files = Column(Boolean, default=True, nullable=False)
    enable_system = Column(Boolean, default=True, nullable=False)
    enable_sound = Column(Boolean, default=True, nullable=False)
    enable_desktop_notifs = Column(Boolean, default=True, nullable=False)
    enable_browser_notifs = Column(Boolean, default=True, nullable=False)
    dnd_enabled = Column(Boolean, default=False, nullable=False)
    dnd_start_time = Column(String(10), default="22:00", nullable=False)
    dnd_end_time = Column(String(10), default="07:00", nullable=False)
    allow_calls_in_dnd = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "enableMessages": self.enable_messages,
            "enableMentions": self.enable_mentions,
            "enableCalls": self.enable_calls,
            "enableMeetings": self.enable_meetings,
            "enableFiles": self.enable_files,
            "enableSystem": self.enable_system,
            "enableSound": self.enable_sound,
            "enableDesktopNotifs": self.enable_desktop_notifs,
            "enableBrowserNotifs": self.enable_browser_notifs,
            "dndEnabled": self.dnd_enabled,
            "dndStartTime": self.dnd_start_time,
            "dndEndTime": self.dnd_end_time,
            "allowCallsInDnd": self.allow_calls_in_dnd
        }
