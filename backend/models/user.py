"""
User ORM model.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from core.database import Base
import enum


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    MEMBER = "member"
    GUEST = "guest"


class PresenceStatus(str, enum.Enum):
    ONLINE = "online"
    AWAY = "away"
    DND = "dnd"
    OFFLINE = "offline"
    IN_MEETING = "in_meeting"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255))  # None for SSO users
    avatar_url: Mapped[str | None] = mapped_column(String(512))
    role: Mapped[str] = mapped_column(String(20), default=UserRole.MEMBER.value)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    keycloak_id: Mapped[str | None] = mapped_column(String(36), unique=True)

    # Presence
    presence_status: Mapped[str] = mapped_column(String(20), default=PresenceStatus.OFFLINE.value)
    custom_status: Mapped[str | None] = mapped_column(String(150))
    custom_status_emoji: Mapped[str | None] = mapped_column(String(50))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # E2E Encryption
    public_key: Mapped[str | None] = mapped_column(Text)  # NaCl public key (base64)
    encrypted_private_key: Mapped[str | None] = mapped_column(Text)  # Encrypted with user password

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    messages = relationship("Message", back_populates="author", lazy="select")
    channel_memberships = relationship("ChannelMember", back_populates="user", lazy="select")

    def __repr__(self):
        return f"<User {self.email}>"
