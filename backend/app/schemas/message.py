from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from app.models.models import MessageType

class MessageReactionResponse(BaseModel):
    id: UUID
    emoji: str
    user_id: UUID
    user_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class MessageCreate(BaseModel):
    content: str
    parent_message_id: Optional[UUID] = None
    message_type: MessageType = MessageType.TEXT

class MessageResponse(BaseModel):
    id: UUID
    channel_id: Optional[UUID]
    sender_id: UUID
    sender_name: str
    sender_avatar: Optional[str] = None
    parent_message_id: Optional[UUID] = None
    message_type: MessageType
    content: str
    is_edited: bool
    is_pinned: bool
    reactions: List[MessageReactionResponse] = []
    reply_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ReactionCreate(BaseModel):
    emoji: str
