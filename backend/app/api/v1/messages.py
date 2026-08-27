from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import User, MessageType
from app.api.deps import get_current_user
from app.services.message_service import MessageService
from app.core.response import success_response, error_response

router = APIRouter(tags=["Messages"])

class SendMessageRequest(BaseModel):
    content: str
    parent_message_id: Optional[str] = None
    message_type: MessageType = MessageType.TEXT
    client_message_id: Optional[str] = None

class UpdateMessageRequest(BaseModel):
    content: str

class ToggleReactionRequest(BaseModel):
    emoji: str

@router.get("/channels/{channel_id}/messages")
async def get_channel_messages(
    channel_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MessageService(db)
    messages = await svc.get_channel_messages(channel_id, limit)
    return success_response(messages)

@router.post("/channels/{channel_id}/messages")
async def post_channel_message(
    channel_id: str,
    req: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MessageService(db)
    message = await svc.create_message(
        sender_id=str(current_user.id),
        channel_id=channel_id,
        content=req.content,
        parent_message_id=req.parent_message_id,
        message_type=req.message_type,
        client_message_id=req.client_message_id
    )
    return success_response(message, status_code=201)

@router.get("/messages/{message_id}/replies")
async def get_message_replies(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MessageService(db)
    replies = await svc.get_replies(message_id)
    return success_response(replies)

@router.patch("/messages/{message_id}")
async def update_message(
    message_id: str,
    req: UpdateMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MessageService(db)
    updated = await svc.update_message(message_id, str(current_user.id), req.content)
    if not updated:
        return error_response("UNAUTHORIZED", "Message not found or permission denied.", status_code=403)
    return success_response(updated)

@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MessageService(db)
    deleted = await svc.delete_message(message_id, str(current_user.id))
    if not deleted:
        return error_response("UNAUTHORIZED", "Message not found or permission denied.", status_code=403)
    return success_response({"message": "Message deleted successfully."})

@router.post("/messages/{message_id}/reactions")
async def toggle_message_reaction(
    message_id: str,
    req: ToggleReactionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MessageService(db)
    updated = await svc.toggle_reaction(message_id, str(current_user.id), req.emoji)
    if not updated:
        return error_response("MESSAGE_NOT_FOUND", "Message not found.", status_code=404)
    return success_response(updated)

@router.post("/messages/{message_id}/pin")
async def pin_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MessageService(db)
    pinned = await svc.pin_message(message_id, str(current_user.id))
    if not pinned:
        return error_response("MESSAGE_NOT_FOUND", "Message not found.", status_code=404)
    return success_response(pinned)

@router.delete("/messages/{message_id}/pin")
async def unpin_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MessageService(db)
    unpinned = await svc.unpin_message(message_id, str(current_user.id))
    if not unpinned:
        return error_response("MESSAGE_NOT_FOUND", "Message not found.", status_code=404)
    return success_response(unpinned)
