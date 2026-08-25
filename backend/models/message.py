"""
Message, Reaction, Attachment, Thread ORM models.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    channel_id: Mapped[str] = mapped_column(String(36), ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_encrypted: Mapped[str | None] = mapped_column(Text)  # E2E encrypted payload for DMs
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=False)
    thread_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("messages.id"))  # Parent message
    reply_count: Mapped[int] = mapped_column(Integer, default=0)
    is_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON)  # link previews, polls, etc.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    channel = relationship("Channel", back_populates="messages")
    author = relationship("User", back_populates="messages")
    reactions = relationship("MessageReaction", back_populates="message", lazy="select")
    attachments = relationship("MessageAttachment", back_populates="message", lazy="select")
    thread_replies = relationship("Message", foreign_keys=[thread_id], lazy="select")


class MessageReaction(Base):
    __tablename__ = "message_reactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    message_id: Mapped[str] = mapped_column(String(36), ForeignKey("messages.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    emoji: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    message = relationship("Message", back_populates="reactions")


class MessageAttachment(Base):
    __tablename__ = "message_attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    message_id: Mapped[str] = mapped_column(String(36), ForeignKey("messages.id", ondelete="CASCADE"))
    file_name: Mapped[str] = mapped_column(String(255))
    file_size: Mapped[int] = mapped_column(Integer)
    mime_type: Mapped[str] = mapped_column(String(100))
    storage_path: Mapped[str] = mapped_column(String(512))  # MinIO object path
    thumbnail_path: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    message = relationship("Message", back_populates="attachments")
