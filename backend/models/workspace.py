"""
Workspace, Team, Channel, ChannelMember ORM models.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey, Integer, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
import enum


class ChannelType(str, enum.Enum):
    PUBLIC = "public"
    PRIVATE = "private"
    DM = "dm"
    GROUP_DM = "group_dm"
    ANNOUNCEMENT = "announcement"


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(512))
    primary_color: Mapped[str] = mapped_column(String(7), default="#6366f1")
    domain: Mapped[str | None] = mapped_column(String(255))  # Custom domain
    storage_quota_gb: Mapped[int] = mapped_column(Integer, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    teams = relationship("Team", back_populates="workspace", lazy="select")


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(String(512))
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="teams")
    channels = relationship("Channel", back_populates="team", lazy="select")


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("teams.id", ondelete="CASCADE"))
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(20), default=ChannelType.PUBLIC.value)
    topic: Mapped[str | None] = mapped_column(String(250))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    is_read_only: Mapped[bool] = mapped_column(Boolean, default=False)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    team = relationship("Team", back_populates="channels")
    members = relationship("ChannelMember", back_populates="channel", lazy="select")
    messages = relationship("Message", back_populates="channel", lazy="select")


class ChannelMember(Base):
    __tablename__ = "channel_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    channel_id: Mapped[str] = mapped_column(String(36), ForeignKey("channels.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20), default="member")  # owner, admin, member
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    is_muted: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_preference: Mapped[str] = mapped_column(String(20), default="all")  # all, mentions, none

    channel = relationship("Channel", back_populates="members")
    user = relationship("User", back_populates="channel_memberships")
