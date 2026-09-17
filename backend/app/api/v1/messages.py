from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import User, Message, MessageType
from app.api.deps import get_current_user
from app.services.message_service import MessageService, MessageAccessError
from app.services.authorization_service import AuthorizationService
from app.services.notification_service import create_notification
from app.core.response import success_response, error_response

router = APIRouter(tags=["Messages"])

class SendMessageRequest(BaseModel):
    content: str
    parent_message_id: Optional[str] = None
    message_type: MessageType = MessageType.TEXT
    client_message_id: Optional[str] = None
    attachments: Optional[List[dict]] = None

class UpdateMessageRequest(BaseModel):
    content: str
    attachments: Optional[List[dict]] = None

class ToggleReactionRequest(BaseModel):
    emoji: str

@router.get("/channels/{channel_id}/messages")
async def get_channel_messages(
    channel_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_access_channel(current_user, channel_id, db):
        return error_response("FORBIDDEN", "You do not have access to this channel.", status_code=403)
    svc = MessageService(db)
    messages = await svc.get_channel_messages(channel_id, limit=limit, current_user=current_user)
    return success_response(messages)

@router.post("/channels/{channel_id}/messages")
async def post_channel_message(
    channel_id: str,
    req: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await AuthorizationService.can_access_channel(current_user, channel_id, db):
        return error_response("FORBIDDEN", "You do not have access to this channel.", status_code=403)
    svc = MessageService(db)
    message = await svc.create_message(
        sender_id=str(current_user.id),
        channel_id=channel_id,
        content=req.content,
        parent_message_id=req.parent_message_id,
        message_type=req.message_type,
        client_message_id=req.client_message_id,
        attachments=req.attachments
    )

    # Create notifications for other channel members
    try:
        from app.models.models import ChannelMember
        members_res = await db.execute(
            select(ChannelMember.user_id).where(
                ChannelMember.channel_id == channel_id,
                ChannelMember.user_id != current_user.id
            )
        )
        member_ids = members_res.scalars().all()
        content_preview = (req.content or "")[:120]
        is_attachment = bool(req.attachments)
        notif_title = f"{current_user.display_name or current_user.email} sent a message"
        notif_type = "FILE" if is_attachment else "MESSAGE"
        for mid in member_ids:
            await create_notification(
                db=db,
                user_id=str(mid),
                title=notif_title,
                body=(content_preview or "Sent an attachment") if content_preview else "Sent an attachment",
                type=notif_type,
                conversation_id=channel_id
            )
    except Exception as notif_err:
        import logging
        logging.getLogger(__name__).error(f"Failed to send channel message notification: {notif_err}")

    return success_response(message, status_code=201)


@router.get("/messages/{message_id}/replies")
async def get_message_replies(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MessageService(db)
    try:
        replies = await svc.get_replies(message_id, current_user)
    except MessageAccessError as e:
        return error_response("FORBIDDEN", str(e), status_code=403)
    return success_response(replies)

@router.patch("/messages/{message_id}")
@router.patch("/direct-messages/{message_id}", include_in_schema=False)
async def update_message(
    message_id: str,
    req: UpdateMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MessageService(db)
    try:
        updated = await svc.update_message(message_id, current_user, req.content, attachments=req.attachments)
    except MessageAccessError as e:
        return error_response("FORBIDDEN", str(e), status_code=403)
    if not updated:
        return error_response("UNAUTHORIZED", "Message not found or permission denied.", status_code=403)
    return success_response(updated)

@router.delete("/messages/{message_id}")
@router.delete("/direct-messages/{message_id}", include_in_schema=False)
async def delete_message(
    message_id: str,
    mode: Optional[str] = Query("me"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    msg_res = await db.execute(select(Message).where(Message.id == message_id))
    msg = msg_res.scalars().first()
    if not msg:
        return error_response("NOT_FOUND", "Message not found.", status_code=404)

    is_sender = str(msg.sender_id) == str(current_user.id)
    is_admin = getattr(current_user, 'is_superuser', False) or await AuthorizationService.is_org_admin(current_user, db)
    can_manage = False
    if msg.channel_id:
        can_manage = await AuthorizationService.can_manage_channel(current_user, str(msg.channel_id), db)

    if mode == "everyone":
        if not (is_sender or is_admin or can_manage):
            return error_response("FORBIDDEN", "You can only delete your own messages for everyone.", status_code=403)
        svc = MessageService(db)
        try:
            deleted = await svc.delete_message(message_id, current_user)
        except MessageAccessError as e:
            return error_response("FORBIDDEN", str(e), status_code=403)
        if not deleted:
            return error_response("UNAUTHORIZED", "Message not found or permission denied.", status_code=403)
        return success_response({"message": "Message deleted for everyone."})
    else:
        from app.models.models import UserMessageDeletion
        db.add(UserMessageDeletion(user_id=current_user.id, message_id=msg.id))
        try:
            await db.commit()
        except Exception:
            await db.rollback()
        return success_response({"message": "Message deleted for you."})

@router.post("/messages/{message_id}/reactions")
async def toggle_message_reaction(
    message_id: str,
    req: ToggleReactionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MessageService(db)
    try:
        updated = await svc.toggle_reaction(message_id, current_user, req.emoji)
    except MessageAccessError as e:
        return error_response("FORBIDDEN", str(e), status_code=403)
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
    try:
        pinned = await svc.pin_message(message_id, current_user)
    except MessageAccessError as e:
        return error_response("FORBIDDEN", str(e), status_code=403)
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
    try:
        unpinned = await svc.unpin_message(message_id, current_user)
    except MessageAccessError as e:
        return error_response("FORBIDDEN", str(e), status_code=403)
    if not unpinned:
        return error_response("MESSAGE_NOT_FOUND", "Message not found.", status_code=404)
    return success_response(unpinned)
