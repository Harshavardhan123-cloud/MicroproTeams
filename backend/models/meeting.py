"""
Meeting, MeetingParticipant, MeetingRecording, MeetingSummary ORM models.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
import enum


class MeetingStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    ENDED = "ended"
    CANCELLED = "cancelled"


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    channel_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("channels.id"))
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"))
    host_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default=MeetingStatus.SCHEDULED.value)
    room_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    passcode: Mapped[str | None] = mapped_column(String(20))
    is_waiting_room_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_recording: Mapped[bool] = mapped_column(Boolean, default=False)
    is_transcription_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    max_participants: Mapped[int] = mapped_column(Integer, default=500)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    agenda: Mapped[dict | None] = mapped_column(JSON)  # List of agenda items
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    participants = relationship("MeetingParticipant", back_populates="meeting", lazy="select")
    recordings = relationship("MeetingRecording", back_populates="meeting", lazy="select")
    summary = relationship("MeetingSummary", back_populates="meeting", uselist=False, lazy="select")


class MeetingParticipant(Base):
    __tablename__ = "meeting_participants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    meeting_id: Mapped[str] = mapped_column(String(36), ForeignKey("meetings.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    speaking_time_seconds: Mapped[int] = mapped_column(Integer, default=0)
    is_host: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="waiting")  # waiting, admitted, left

    meeting = relationship("Meeting", back_populates="participants")


class MeetingRecording(Base):
    __tablename__ = "meeting_recordings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    meeting_id: Mapped[str] = mapped_column(String(36), ForeignKey("meetings.id", ondelete="CASCADE"))
    storage_path: Mapped[str] = mapped_column(String(512))
    file_size: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    transcript_path: Mapped[str | None] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(20), default="processing")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    meeting = relationship("Meeting", back_populates="recordings")


class MeetingSummary(Base):
    __tablename__ = "meeting_summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    meeting_id: Mapped[str] = mapped_column(String(36), ForeignKey("meetings.id"), unique=True)
    summary_text: Mapped[str | None] = mapped_column(Text)
    key_decisions: Mapped[list | None] = mapped_column(JSON)
    action_items: Mapped[list | None] = mapped_column(JSON)  # [{task, assignee, due_date}]
    open_questions: Mapped[list | None] = mapped_column(JSON)
    topic_timeline: Mapped[list | None] = mapped_column(JSON)  # [{timestamp, topic}]
    sentiment_analysis: Mapped[dict | None] = mapped_column(JSON)  # per-speaker
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    meeting = relationship("Meeting", back_populates="summary")
