from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import delete
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import User, DirectConversation, DirectConversationMember, Message, UserMessageDeletion
from app.repositories.message_repository import MessageRepository
from app.api.deps import get_current_user
from app.services.message_service import MessageService
from app.services.notification_service import create_notification
from app.core.response import success_response, error_response
from app.core.websocket import ws_manager

router = APIRouter(prefix="/direct-conversations", tags=["Direct Messaging"])


async def _ensure_conversation_member(conversation_id: str, current_user: User, db: AsyncSession) -> None:
    res = await db.execute(
        select(DirectConversationMember).where(
            DirectConversationMember.conversation_id == conversation_id,
            DirectConversationMember.user_id == current_user.id
        )
    )
    if not res.scalars().first():
        raise HTTPException(status_code=403, detail="You are not a member of this conversation.")

class CreateDMRequest(BaseModel):
    target_user_ids: List[str]
    title: Optional[str] = None

class SendDMMessageRequest(BaseModel):
    content: str
    attachments: Optional[List[dict]] = None

class UpdateDMMessageRequest(BaseModel):
    content: str

@router.get("")
async def get_direct_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(DirectConversation)
        .join(DirectConversationMember)
        .options(
            selectinload(DirectConversation.members).selectinload(DirectConversationMember.user),
            selectinload(DirectConversation.messages)
        )
        .where(DirectConversationMember.user_id == current_user.id)
        .order_by(DirectConversation.updated_at.desc())
    )
    conversations = res.scalars().all()

    output = []
    for c in conversations:
        other_members = []
        for m in c.members:
            if m.user_id == current_user.id:
                continue
            uid_str = str(m.user.id)
            is_active_ws = uid_str in ws_manager.user_connections and bool(ws_manager.user_connections[uid_str])
            raw_presence = m.user.presence.value if hasattr(m.user.presence, "value") else str(m.user.presence or "offline")
            effective_presence = "available" if (is_active_ws and raw_presence == "offline") else raw_presence
            other_members.append({
                "id": uid_str,
                "display_name": m.user.display_name,
                "email": m.user.email,
                "presence": effective_presence,
                "avatar_url": m.user.avatar_url
            })
        output.append({
            "id": str(c.id),
            "title": c.title or ", ".join([m["display_name"] for m in other_members]),
            "is_group": c.is_group,
            "members": other_members,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None
        })

    return success_response(output)

@router.post("")
async def create_or_get_direct_conversation(
    req: CreateDMRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    target_ids = list(set([str(current_user.id)] + [str(uid) for uid in req.target_user_ids]))

    # All participants must belong to the caller's org, otherwise a DM "conversation"
    # could be used to push messages to an arbitrary user id in another tenant.
    valid_res = await db.execute(
        select(User.id).where(User.id.in_(target_ids), User.organization_id == current_user.organization_id)
    )
    valid_ids = {str(uid) for uid in valid_res.scalars().all()}
    if valid_ids != set(target_ids):
        return error_response("INVALID_TARGET", "All participants must belong to your organization.", status_code=400)

    is_group = len(target_ids) > 2

    if not is_group and len(target_ids) == 2:
        res = await db.execute(
            select(DirectConversation)
            .join(DirectConversationMember)
            .where(
                DirectConversation.organization_id == current_user.organization_id,
                DirectConversation.is_group == False,
                DirectConversationMember.user_id.in_(target_ids)
            )
        )
        existing_convs = res.scalars().all()
        for conv in existing_convs:
            member_res = await db.execute(
                select(DirectConversationMember.user_id)
                .where(DirectConversationMember.conversation_id == conv.id)
            )
            member_ids = set([str(uid) for uid in member_res.scalars().all()])
            if member_ids == set(target_ids):
                return success_response({"id": str(conv.id), "is_existing": True})

    new_conv = DirectConversation(
        organization_id=current_user.organization_id,
        title=req.title,
        is_group=is_group
    )
    db.add(new_conv)
    await db.commit()
    await db.refresh(new_conv)

    for uid in target_ids:
        mem = DirectConversationMember(conversation_id=new_conv.id, user_id=uid)
        db.add(mem)

    await db.commit()
    return success_response({"id": str(new_conv.id), "is_existing": False}, status_code=201)

@router.get("/{conversation_id}/messages")
async def get_direct_messages(
    conversation_id: str,
    limit: int = 300,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await _ensure_conversation_member(conversation_id, current_user, db)
    
    # Filter out user-deleted messages
    del_res = await db.execute(
        select(UserMessageDeletion.message_id).where(UserMessageDeletion.user_id == current_user.id)
    )
    deleted_msg_ids = set(del_res.scalars().all())

    query = select(Message).options(
        selectinload(Message.sender),
        selectinload(Message.reactions),
        selectinload(Message.attachments)
    ).where(Message.conversation_id == conversation_id)

    if deleted_msg_ids:
        query = query.where(Message.id.not_in(deleted_msg_ids))

    res = await db.execute(query.order_by(Message.created_at.desc()).limit(limit))
    messages = list(reversed(res.scalars().all()))
    svc = MessageService(db)
    return success_response([svc.format_message(m) for m in messages])

@router.post("/{conversation_id}/messages")
async def send_direct_message(
    conversation_id: str,
    req: SendDMMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await _ensure_conversation_member(conversation_id, current_user, db)
    msg = Message(
        sender_id=current_user.id,
        conversation_id=conversation_id,
        content=req.content
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    if req.attachments:
        from app.models.models import MessageAttachment, FileRecord
        for att in req.attachments:
            att_name = att.get("name") if isinstance(att, dict) else getattr(att, "name", "Attachment")
            att_url = att.get("url") if isinstance(att, dict) else getattr(att, "url", None)
            att_type = att.get("type") if isinstance(att, dict) else getattr(att, "type", None)
            att_size = att.get("size") if isinstance(att, dict) else getattr(att, "size", None)
            att_file_id = att.get("file_id") if isinstance(att, dict) else getattr(att, "file_id", None)
            
            f_bytes = None
            b64_val = None
            if att_file_id:
                try:
                    f_res = await db.execute(select(FileRecord).where(FileRecord.id == att_file_id))
                    f_rec = f_res.scalars().first()
                    if f_rec:
                        f_bytes = f_rec.file_data
                        b64_val = f_rec.base64_data
                except Exception:
                    pass

            att_obj = MessageAttachment(
                message_id=msg.id,
                display_name=att_name or "Attachment",
                file_url=att_url,
                mime_type=att_type,
                size=att_size,
                file_id=att_file_id,
                file_data=f_bytes,
                base64_data=b64_val,
                sort_order="0"
            )
            db.add(att_obj)
        await db.commit()

    repo = MessageRepository(db)
    full_msg = await repo.get_by_id(str(msg.id))
    if not full_msg:
        full_msg = msg
        full_msg.sender = current_user

    mem_res = await db.execute(
        select(DirectConversationMember.user_id)
        .where(DirectConversationMember.conversation_id == conversation_id)
    )
    member_user_ids = [str(uid) for uid in mem_res.scalars().all()]

    svc = MessageService(db)
    formatted = svc.format_message(full_msg)

    for target_user_id in member_user_ids:
        await ws_manager.send_personal_message(target_user_id, {
            "type": "direct_message.new",
            "conversation_id": conversation_id,
            "message": formatted
        })
        if target_user_id != str(current_user.id):
            try:
                await create_notification(
                    db=db,
                    user_id=target_user_id,
                    title=f"{current_user.display_name} sent you a direct message",
                    body=(req.content or "Sent an attachment")[:100],
                    type="MESSAGE",
                    priority="NORMAL",
                    conversation_id=conversation_id
                )
            except Exception as notif_err:
                logger.error(f"Failed to send DM notification: {notif_err}")

    return success_response(formatted, status_code=201)

@router.patch("/{conversation_id}/messages/{message_id}")
async def update_direct_message(
    conversation_id: str,
    message_id: str,
    req: UpdateDMMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Message).where(Message.id == message_id, Message.conversation_id == conversation_id))
    msg = res.scalars().first()
    is_admin = getattr(current_user, 'is_admin', False) or getattr(current_user, 'is_superuser', False) or getattr(current_user, 'role', '') in ('ADMIN', 'ORG_ADMIN', 'ADMINISTRATOR')
    if not msg or (str(msg.sender_id) != str(current_user.id) and not is_admin):
        return error_response("UNAUTHORIZED", "Message not found or permission denied.", status_code=403)

    msg.content = req.content
    msg.is_edited = True
    await db.commit()

    svc = MessageService(db)
    formatted = svc.format_message(msg)

    mem_res = await db.execute(select(DirectConversationMember.user_id).where(DirectConversationMember.conversation_id == conversation_id))
    member_user_ids = [str(uid) for uid in mem_res.scalars().all()]
    for target_user_id in member_user_ids:
        await ws_manager.send_personal_message(target_user_id, {
            "type": "direct_message.update",
            "conversation_id": conversation_id,
            "message": formatted
        })

    return success_response(formatted)

@router.delete("/{conversation_id}/messages/{message_id}")
async def delete_direct_message(
    conversation_id: str,
    message_id: str,
    mode: Optional[str] = Query("me"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Message).where(Message.id == message_id, Message.conversation_id == conversation_id))
    msg = res.scalars().first()
    if not msg:
        return error_response("NOT_FOUND", "Message not found.", status_code=404)

    is_admin = getattr(current_user, 'is_admin', False) or getattr(current_user, 'is_superuser', False) or getattr(current_user, 'role', '') in ('ADMIN', 'ORG_ADMIN', 'ADMINISTRATOR')

    if mode == "everyone":
        if not is_admin:
            return error_response("FORBIDDEN", "Only administrators can delete messages for everyone.", status_code=403)
        
        await db.delete(msg)
        await db.commit()

        mem_res = await db.execute(select(DirectConversationMember.user_id).where(DirectConversationMember.conversation_id == conversation_id))
        member_user_ids = [str(uid) for uid in mem_res.scalars().all()]
        for target_user_id in member_user_ids:
            await ws_manager.send_personal_message(target_user_id, {
                "type": "direct_message.delete",
                "conversation_id": conversation_id,
                "message_id": message_id
            })

        return success_response({"message": "Message deleted for everyone"})
    else:
        # Delete for current user only
        del_entry = UserMessageDeletion(user_id=current_user.id, message_id=msg.id)
        db.add(del_entry)
        try:
            await db.commit()
        except Exception:
            await db.rollback()

        return success_response({"message": "Message deleted for you"})

@router.delete("/{conversation_id}/clear")
async def clear_direct_conversation(
    conversation_id: str,
    mode: Optional[str] = Query("me"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await _ensure_conversation_member(conversation_id, current_user, db)
    is_admin = getattr(current_user, 'is_admin', False) or getattr(current_user, 'is_superuser', False) or getattr(current_user, 'role', '') in ('ADMIN', 'ORG_ADMIN', 'ADMINISTRATOR')

    if mode == "everyone":
        if not is_admin:
            return error_response("FORBIDDEN", "Only administrators can clear conversation history for everyone.", status_code=403)
        await db.execute(delete(Message).where(Message.conversation_id == conversation_id))
        await db.commit()

        mem_res = await db.execute(select(DirectConversationMember.user_id).where(DirectConversationMember.conversation_id == conversation_id))
        member_user_ids = [str(uid) for uid in mem_res.scalars().all()]
        for target_user_id in member_user_ids:
            await ws_manager.send_personal_message(target_user_id, {
                "type": "direct_message.clear",
                "conversation_id": conversation_id
            })
        return success_response({"message": "Conversation cleared for everyone"})
    else:
        msg_res = await db.execute(select(Message.id).where(Message.conversation_id == conversation_id))
        msg_ids = msg_res.scalars().all()
        for mid in msg_ids:
            db.add(UserMessageDeletion(user_id=current_user.id, message_id=mid))
        try:
            await db.commit()
        except Exception:
            await db.rollback()
        return success_response({"message": "Conversation cleared for you"})


@router.post("/{conversation_id}/read")
async def mark_direct_conversation_read(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from datetime import datetime
    from sqlalchemy import update
    await _ensure_conversation_member(conversation_id, current_user, db)

    now = datetime.utcnow()
    # Mark unread messages sent by other users in this conversation as read
    stmt = (
        update(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.sender_id != current_user.id,
            Message.is_read == False
        )
        .values(is_read=True, read_at=now)
    )
    await db.execute(stmt)
    await db.commit()

    # Get conversation members to broadcast read receipt event
    mem_res = await db.execute(
        select(DirectConversationMember.user_id)
        .where(DirectConversationMember.conversation_id == conversation_id)
    )
    member_user_ids = [str(uid) for uid in mem_res.scalars().all()]

    read_payload = {
        "type": "direct_message.read",
        "conversation_id": conversation_id,
        "reader_id": str(current_user.id),
        "read_at": now.isoformat()
    }

    for target_user_id in member_user_ids:
        await ws_manager.send_personal_message(target_user_id, read_payload)

    return success_response({"message": "Messages marked as read", "read_at": now.isoformat()})

