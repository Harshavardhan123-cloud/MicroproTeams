import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Boolean, DateTime, ForeignKey, Enum as SQLEnum, Table, UniqueConstraint, Index, Integer
)
from sqlalchemy.orm import relationship
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from app.core.database import Base

class GUID(TypeDecorator):
    """Platform-independent GUID type.
    Uses PostgreSQL's UUID type when on Postgres, CHAR(36) on SQLite.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, uuid.UUID):
            try:
                return str(uuid.UUID(str(value)))
            except ValueError:
                return str(value)
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, uuid.UUID):
            try:
                return uuid.UUID(str(value))
            except ValueError:
                return value
        return value

class PresenceStatus(str, enum.Enum):
    AVAILABLE = "available"
    BUSY = "busy"
    DND = "dnd"
    AWAY = "away"
    OFFLINE = "offline"

class TeamPrivacy(str, enum.Enum):
    PUBLIC = "public"
    PRIVATE = "private"

class ChannelType(str, enum.Enum):
    STANDARD = "standard"
    PRIVATE = "private"
    SHARED = "shared"

class MemberRole(str, enum.Enum):
    OWNER = "owner"
    MEMBER = "member"
    GUEST = "guest"

class ChannelMemberRole(str, enum.Enum):
    OWNER = "OWNER"
    MEMBER = "MEMBER"

class ConversationType(str, enum.Enum):
    DIRECT = "DIRECT"
    GROUP = "GROUP"
    CHANNEL = "CHANNEL"

class MentionType(str, enum.Enum):
    USER = "USER"
    TEAM = "TEAM"
    CHANNEL = "CHANNEL"
    EVERYONE = "EVERYONE"

class MessageType(str, enum.Enum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    FILE = "file"
    LINK = "link"
    SYSTEM = "system"
    MEETING = "meeting"

class MeetingType(str, enum.Enum):
    INSTANT = "INSTANT"
    SCHEDULED = "SCHEDULED"
    DIRECT_CALL = "DIRECT_CALL"
    GROUP_CALL = "GROUP_CALL"

class MeetingStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    LOBBY = "LOBBY"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    CANCELLED = "CANCELLED"

class ParticipantRole(str, enum.Enum):
    HOST = "HOST"
    CO_HOST = "CO_HOST"
    PRESENTER = "PRESENTER"
    ATTENDEE = "ATTENDEE"

class ParticipantStatus(str, enum.Enum):
    REQUESTED = "REQUESTED"
    WAITING = "WAITING"
    ADMITTED = "ADMITTED"
    REJECTED = "REJECTED"
    JOINED = "JOINED"
    LEFT = "LEFT"

class CallType(str, enum.Enum):
    AUDIO = "AUDIO"
    VIDEO = "VIDEO"

class CallStatus(str, enum.Enum):
    CALLING = "CALLING"
    RINGING = "RINGING"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    DECLINED = "DECLINED"
    MISSED = "MISSED"
    FAILED = "FAILED"
    ENDED = "ENDED"

class FileStatus(str, enum.Enum):
    UPLOADING = "UPLOADING"
    READY = "READY"
    PROCESSING = "PROCESSING"
    FAILED = "FAILED"
    DELETED = "DELETED"

class FileVisibility(str, enum.Enum):
    PRIVATE = "PRIVATE"
    CONVERSATION = "CONVERSATION"
    CHANNEL = "CHANNEL"
    TEAM = "TEAM"
    ORGANIZATION = "ORGANIZATION"

# Association table for Roles and Permissions
role_permissions = Table(
    'role_permissions',
    Base.metadata,
    Column('role_id', GUID(), ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
    Column('permission_id', GUID(), ForeignKey('permissions.id', ondelete='CASCADE'), primary_key=True)
)

class Organization(Base):
    __tablename__ = 'organizations'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    domain = Column(String(255), nullable=True, index=True)
    logo_url = Column(String(512), nullable=True)
    description = Column(Text, nullable=True)
    owner_id = Column(GUID(), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="organization", cascade="all, delete-orphan")
    members = relationship("OrganizationMember", back_populates="organization", cascade="all, delete-orphan")

class OrganizationMember(Base):
    __tablename__ = 'organization_members'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    role = Column(String(50), default="USER", nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint('organization_id', 'user_id', name='_org_user_uc'),)

    organization = relationship("Organization", back_populates="members")
    user = relationship("User")

class Role(Base):
    __tablename__ = 'roles'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)

    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles")

class Permission(Base):
    __tablename__ = 'permissions'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    code = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)

    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")

class User(Base):
    __tablename__ = 'users'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    role_id = Column(GUID(), ForeignKey('roles.id'), nullable=True)

    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)

    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    display_name = Column(String(200), nullable=False)

    avatar_url = Column(String(512), nullable=True)
    job_title = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    timezone = Column(String(50), default="UTC", nullable=False)
    phone = Column(String(50), nullable=True)

    presence = Column(SQLEnum(PresenceStatus), default=PresenceStatus.OFFLINE, nullable=False)
    status_message = Column(String(255), nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)

    last_seen = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    organization = relationship("Organization", back_populates="users")
    role = relationship("Role")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")

class UserSession(Base):
    __tablename__ = 'user_sessions'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    refresh_token = Column(String(512), unique=True, nullable=False, index=True)
    user_agent = Column(String(512), nullable=True)
    ip_address = Column(String(50), nullable=True)
    is_revoked = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="sessions")

class Team(Base):
    __tablename__ = 'teams'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    avatar_url = Column(String(512), nullable=True)
    owner_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    privacy = Column(SQLEnum(TeamPrivacy), default=TeamPrivacy.PUBLIC, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    organization = relationship("Organization", back_populates="teams")
    channels = relationship("Channel", back_populates="team", cascade="all, delete-orphan")
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")

class TeamMember(Base):
    __tablename__ = 'team_members'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    team_id = Column(GUID(), ForeignKey('teams.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    role = Column(SQLEnum(MemberRole), default=MemberRole.MEMBER, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint('team_id', 'user_id', name='_team_user_uc'),)

    team = relationship("Team", back_populates="members")
    user = relationship("User")

class Channel(Base):
    __tablename__ = 'channels'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    team_id = Column(GUID(), ForeignKey('teams.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    type = Column(SQLEnum(ChannelType), default=ChannelType.STANDARD, nullable=False)
    created_by = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    team = relationship("Team", back_populates="channels")
    messages = relationship("Message", back_populates="channel", cascade="all, delete-orphan")
    members = relationship("ChannelMember", back_populates="channel", cascade="all, delete-orphan")

class ChannelMember(Base):
    __tablename__ = 'channel_members'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    channel_id = Column(GUID(), ForeignKey('channels.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    role = Column(SQLEnum(ChannelMemberRole), default=ChannelMemberRole.MEMBER, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint('channel_id', 'user_id', name='_channel_user_uc'),)

    channel = relationship("Channel", back_populates="members")
    user = relationship("User")

class Conversation(Base):
    __tablename__ = 'conversations'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    type = Column(SQLEnum(ConversationType), default=ConversationType.DIRECT, nullable=False)
    name = Column(String(255), nullable=True)
    created_by = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    members = relationship("ConversationMember", back_populates="conversation", cascade="all, delete-orphan")

class ConversationMember(Base):
    __tablename__ = 'conversation_members'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(GUID(), ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    role = Column(String(50), default="MEMBER", nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_read_message_id = Column(GUID(), nullable=True)
    last_read_at = Column(DateTime, nullable=True)
    muted_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint('conversation_id', 'user_id', name='_conv_gen_user_uc'),)

    conversation = relationship("Conversation", back_populates="members")
    user = relationship("User")

class DirectConversation(Base):
    __tablename__ = 'direct_conversations'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    title = Column(String(255), nullable=True)
    is_group = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    members = relationship("DirectConversationMember", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

class DirectConversationMember(Base):
    __tablename__ = 'direct_conversation_members'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(GUID(), ForeignKey('direct_conversations.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint('conversation_id', 'user_id', name='_conv_user_uc'),)

    conversation = relationship("DirectConversation", back_populates="members")
    user = relationship("User")

class Message(Base):
    __tablename__ = 'messages'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    client_message_id = Column(String(255), nullable=True, index=True)
    channel_id = Column(GUID(), ForeignKey('channels.id', ondelete='CASCADE'), nullable=True, index=True)
    conversation_id = Column(GUID(), ForeignKey('direct_conversations.id', ondelete='CASCADE'), nullable=True, index=True)
    sender_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    parent_message_id = Column(GUID(), ForeignKey('messages.id', ondelete='SET NULL'), nullable=True, index=True)

    message_type = Column(SQLEnum(MessageType), default=MessageType.TEXT, nullable=False)
    content = Column(Text, nullable=False)
    
    is_edited = Column(Boolean, default=False, nullable=False)
    is_pinned = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    channel = relationship("Channel", back_populates="messages")
    conversation = relationship("DirectConversation", back_populates="messages")
    sender = relationship("User")
    reactions = relationship("MessageReaction", back_populates="message", cascade="all, delete-orphan")
    attachments = relationship("MessageAttachment", back_populates="message", cascade="all, delete-orphan")
    mentions = relationship("MessageMention", back_populates="message", cascade="all, delete-orphan")
    parent = relationship("Message", remote_side=[id], back_populates="replies")
    replies = relationship("Message", back_populates="parent")

class MessageAttachment(Base):
    __tablename__ = 'message_attachments'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    message_id = Column(GUID(), ForeignKey('messages.id', ondelete='CASCADE'), nullable=False, index=True)
    file_id = Column(GUID(), nullable=True)
    display_name = Column(String(255), nullable=False)
    sort_order = Column(String(50), default="0", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    message = relationship("Message", back_populates="attachments")

class MessageMention(Base):
    __tablename__ = 'message_mentions'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    message_id = Column(GUID(), ForeignKey('messages.id', ondelete='CASCADE'), nullable=False, index=True)
    mentioned_user_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    mention_type = Column(SQLEnum(MentionType), default=MentionType.USER, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    message = relationship("Message", back_populates="mentions")
    user = relationship("User")

class PinnedMessage(Base):
    __tablename__ = 'pinned_messages'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(GUID(), nullable=False, index=True)
    message_id = Column(GUID(), ForeignKey('messages.id', ondelete='CASCADE'), nullable=False, index=True)
    pinned_by = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    pinned_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    message = relationship("Message")

class MessageReaction(Base):
    __tablename__ = 'message_reactions'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    message_id = Column(GUID(), ForeignKey('messages.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    emoji = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint('message_id', 'user_id', 'emoji', name='_msg_user_emoji_uc'),)

    message = relationship("Message", back_populates="reactions")
    user = relationship("User")

class Notification(Base):
    __tablename__ = 'notifications'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    type = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    resource_type = Column(String(100), nullable=True)
    resource_id = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    read_at = Column(DateTime, nullable=True)

class FileRecord(Base):
    __tablename__ = 'file_records'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    owner_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    current_version_id = Column(GUID(), nullable=True)
    name = Column(String(255), nullable=False, index=True)
    original_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    extension = Column(String(20), nullable=False)
    size = Column(Integer, default=0, nullable=False)
    storage_provider = Column(String(50), default="local", nullable=False)
    storage_key = Column(String(512), nullable=False)
    checksum = Column(String(128), nullable=True)
    status = Column(SQLEnum(FileStatus), default=FileStatus.READY, nullable=False)
    visibility = Column(SQLEnum(FileVisibility), default=FileVisibility.ORGANIZATION, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    owner = relationship("User")
    versions = relationship("FileVersion", back_populates="file_record", cascade="all, delete-orphan")
    activities = relationship("FileActivity", back_populates="file_record", cascade="all, delete-orphan")

class FileVersion(Base):
    __tablename__ = 'file_versions'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    file_id = Column(GUID(), ForeignKey('file_records.id', ondelete='CASCADE'), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    storage_key = Column(String(512), nullable=False)
    size = Column(Integer, nullable=False)
    checksum = Column(String(128), nullable=True)
    mime_type = Column(String(100), nullable=False)
    uploaded_by = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint('file_id', 'version_number', name='_file_version_uc'),)

    file_record = relationship("FileRecord", back_populates="versions")

class FilePermission(Base):
    __tablename__ = 'file_permissions'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    file_id = Column(GUID(), ForeignKey('file_records.id', ondelete='CASCADE'), nullable=False, index=True)
    subject_type = Column(String(50), nullable=False)
    subject_id = Column(GUID(), nullable=False)
    permission = Column(String(50), nullable=False)
    created_by = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class FileShare(Base):
    __tablename__ = 'file_shares'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    file_id = Column(GUID(), ForeignKey('file_records.id', ondelete='CASCADE'), nullable=False, index=True)
    created_by = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    token_hash = Column(String(255), nullable=False, index=True)
    permission = Column(String(50), default="VIEW", nullable=False)
    expires_at = Column(DateTime, nullable=True)
    password_hash = Column(String(255), nullable=True)
    max_downloads = Column(Integer, nullable=True)
    download_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

class FileActivity(Base):
    __tablename__ = 'file_activities'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    file_id = Column(GUID(), ForeignKey('file_records.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    action = Column(String(100), nullable=False)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    file_record = relationship("FileRecord", back_populates="activities")
    user = relationship("User")

class Folder(Base):
    __tablename__ = 'folders'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    parent_folder_id = Column(GUID(), ForeignKey('folders.id', ondelete='SET NULL'), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    owner_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

class StorageUsage(Base):
    __tablename__ = 'storage_usages'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, unique=True, index=True)
    used_bytes = Column(Integer, default=0, nullable=False)
    file_count = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

class Meeting(Base):
    __tablename__ = 'meetings'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    created_by = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    channel_id = Column(GUID(), ForeignKey('channels.id', ondelete='SET NULL'), nullable=True, index=True)
    conversation_id = Column(GUID(), ForeignKey('conversations.id', ondelete='SET NULL'), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    host_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    meeting_type = Column(SQLEnum(MeetingType), default=MeetingType.INSTANT, nullable=False)
    status = Column(SQLEnum(MeetingStatus), default=MeetingStatus.ACTIVE, nullable=False, index=True)
    meeting_code = Column(String(64), unique=True, nullable=False, default=lambda: f"meet-{uuid.uuid4().hex[:8]}", index=True)
    join_policy = Column(String(50), default="ANYONE_IN_ORG", nullable=False)
    lobby_enabled = Column(Boolean, default=False, nullable=False)
    is_scheduled = Column(Boolean, default=False, nullable=False)
    scheduled_start = Column(DateTime, nullable=True)
    scheduled_end = Column(DateTime, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    actual_start = Column(DateTime, default=datetime.utcnow, nullable=False)
    actual_end = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    meeting_link = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    host = relationship("User", foreign_keys=[host_id])
    creator = relationship("User", foreign_keys=[created_by])
    participants = relationship("MeetingParticipant", back_populates="meeting", cascade="all, delete-orphan")
    policy = relationship("MeetingPolicy", uselist=False, back_populates="meeting", cascade="all, delete-orphan")

class MeetingParticipant(Base):
    __tablename__ = 'meeting_participants'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(GUID(), ForeignKey('meetings.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    role = Column(String(50), default="ATTENDEE", nullable=False)
    status = Column(SQLEnum(ParticipantStatus), default=ParticipantStatus.JOINED, nullable=False)
    is_host = Column(Boolean, default=False, nullable=False)
    is_cohost = Column(Boolean, default=False, nullable=False)
    audio_muted = Column(Boolean, default=False, nullable=False)
    is_muted = Column(Boolean, default=False, nullable=False)
    video_muted = Column(Boolean, default=False, nullable=False)
    camera_enabled = Column(Boolean, default=True, nullable=False)
    screen_sharing = Column(Boolean, default=False, nullable=False)
    raised_hand = Column(Boolean, default=False, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    left_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint('meeting_id', 'user_id', name='_meeting_user_uc'),)

    meeting = relationship("Meeting", back_populates="participants")
    user = relationship("User")

class MeetingPolicy(Base):
    __tablename__ = 'meeting_policies'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(GUID(), ForeignKey('meetings.id', ondelete='CASCADE'), nullable=False, unique=True, index=True)
    allow_guests = Column(Boolean, default=True, nullable=False)
    allow_lobby = Column(Boolean, default=False, nullable=False)
    allow_screen_share = Column(Boolean, default=True, nullable=False)
    allow_chat = Column(Boolean, default=True, nullable=False)
    allow_reactions = Column(Boolean, default=True, nullable=False)
    allow_participant_unmute = Column(Boolean, default=True, nullable=False)
    allow_recording = Column(Boolean, default=False, nullable=False)
    allow_external_users = Column(Boolean, default=False, nullable=False)
    max_participants = Column(Integer, default=100, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    meeting = relationship("Meeting", back_populates="policy")

class CallHistory(Base):
    __tablename__ = 'call_history'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    meeting_id = Column(GUID(), ForeignKey('meetings.id', ondelete='SET NULL'), nullable=True, index=True)
    caller_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    callee_id = Column(GUID(), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    call_type = Column(SQLEnum(CallType), default=CallType.VIDEO, nullable=False)
    status = Column(SQLEnum(CallStatus), default=CallStatus.ENDED, nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    connected_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    duration = Column(Integer, default=0, nullable=False) # Duration in seconds
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    caller = relationship("User", foreign_keys=[caller_id])
    callee = relationship("User", foreign_keys=[callee_id])
    meeting = relationship("Meeting")

class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(GUID(), nullable=True)
    action = Column(String(255), nullable=False)
    resource_type = Column(String(100), nullable=False)
    resource_id = Column(String(255), nullable=True)
    ip_address = Column(String(50), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
