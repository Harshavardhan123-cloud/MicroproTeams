"""
Messages API — send, edit, delete, react, thread, paginate.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from core.database import get_db
from core.dependencies import CurrentUser
from models.message import Message, MessageReaction
from models.workspace import ChannelMember

router = APIRouter()


class MessageCreateRequest(BaseModel):
    channel_id: str
    content: str
    thread_id: Optional[str] = None
    is_encrypted: bool = False
    content_encrypted: Optional[str] = None


class MessageEditRequest(BaseModel):
    content: str


class ReactionRequest(BaseModel):
    emoji: str


class AttachmentResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    file_name: str
    file_size: int
    mime_type: str
    storage_path: str
    thumbnail_path: Optional[str] = None


class MessageResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    channel_id: str
    author_id: str
    content: str
    content_encrypted: Optional[str] = None
    is_encrypted: bool
    thread_id: Optional[str] = None
    reply_count: int
    is_edited: bool
    is_deleted: bool
    is_pinned: bool
    created_at: datetime
    edited_at: Optional[datetime] = None


@router.get("/channel/{channel_id}", response_model=List[MessageResponse])
async def get_messages(
    channel_id: str,
    current_user: CurrentUser,
    before: Optional[str] = None,
    limit: int = Query(50, le=100),
    db: AsyncSession = Depends(get_db)
):
    """Paginated message history (cursor-based, newest first)."""
    query = (
        select(Message)
        .where(Message.channel_id == channel_id, Message.is_deleted.is_(False), Message.thread_id.is_(None))
        .order_by(desc(Message.created_at))
        .limit(limit)
    )
    if before:
        cursor_msg = await db.get(Message, before)
        if cursor_msg:
            query = query.where(Message.created_at < cursor_msg.created_at)

    result = await db.execute(query)
    messages = result.scalars().all()
    return [MessageResponse.model_validate(m) for m in reversed(messages)]


@router.post("/", response_model=MessageResponse, status_code=201)
async def send_message(payload: MessageCreateRequest, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    # Verify membership
    membership = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == payload.channel_id,
            ChannelMember.user_id == current_user.id
        )
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(403, "Not a member of this channel")

    msg = Message(
        channel_id=payload.channel_id,
        author_id=current_user.id,
        content=payload.content,
        thread_id=payload.thread_id,
        is_encrypted=payload.is_encrypted,
        content_encrypted=payload.content_encrypted,
    )
    db.add(msg)

    # Update thread reply count
    if payload.thread_id:
        parent = await db.get(Message, payload.thread_id)
        if parent:
            parent.reply_count += 1

    await db.flush()
    await db.refresh(msg)
    return MessageResponse.model_validate(msg)


@router.patch("/{message_id}", response_model=MessageResponse)
async def edit_message(message_id: str, payload: MessageEditRequest, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.author_id != current_user.id:
        raise HTTPException(403, "Cannot edit another user's message")

    msg.content = payload.content
    msg.is_edited = True
    msg.edited_at = datetime.utcnow()
    await db.flush()  # must flush before refresh — session is autoflush=False
    await db.refresh(msg)
    return MessageResponse.model_validate(msg)


@router.delete("/{message_id}", status_code=204)
async def delete_message(message_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.author_id != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(403, "Cannot delete another user's message")
    msg.is_deleted = True
    msg.content = "[Message deleted]"


@router.post("/{message_id}/react", status_code=201)
async def react_to_message(message_id: str, payload: ReactionRequest, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    # Toggle reaction
    existing = await db.execute(
        select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == current_user.id,
            MessageReaction.emoji == payload.emoji,
        )
    )
    existing_reaction = existing.scalar_one_or_none()
    if existing_reaction:
        await db.delete(existing_reaction)
        return {"action": "removed"}
    else:
        db.add(MessageReaction(message_id=message_id, user_id=current_user.id, emoji=payload.emoji))
        return {"action": "added"}


@router.post("/{message_id}/pin", status_code=200)
async def pin_message(message_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(404, "Not found")
    msg.is_pinned = not msg.is_pinned
    return {"pinned": msg.is_pinned}


@router.get("/{message_id}/thread", response_model=List[MessageResponse])
async def get_thread(message_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Message).where(Message.thread_id == message_id, Message.is_deleted.is_(False))
        .order_by(Message.created_at)
    )
    return [MessageResponse.model_validate(m) for m in result.scalars().all()]
