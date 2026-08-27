from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import delete
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import User, DirectConversation, DirectConversationMember, Message
from app.api.deps import get_current_user
from app.services.message_service import MessageService
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
        other_members = [
            {
                "id": str(m.user.id),
                "display_name": m.user.display_name,
                "email": m.user.email,
                "presence": m.user.presence,
                "avatar_url": m.user.avatar_url
            }
            for m in c.members if m.user_id != current_user.id
        ]
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
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await _ensure_conversation_member(conversation_id, current_user, db)
    res = await db.execute(
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reactions)
        )
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    messages = res.scalars().all()
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
    msg.sender = current_user

    mem_res = await db.execute(
        select(DirectConversationMember.user_id)
        .where(DirectConversationMember.conversation_id == conversation_id)
    )
    member_user_ids = [str(uid) for uid in mem_res.scalars().all()]

    svc = MessageService(db)
    formatted = svc.format_message(msg)

    for target_user_id in member_user_ids:
        await ws_manager.send_personal_message(target_user_id, {
            "type": "direct_message.new",
            "conversation_id": conversation_id,
            "message": formatted
        })

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
    if not msg or str(msg.sender_id) != str(current_user.id):
        return error_response("UNAUTHORIZED", "Message not found or permission denied.", status_code=403)

    msg.content = req.content
    msg.is_edited = True
    await db.commit()
    await db.refresh(msg)
    msg.sender = current_user

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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Message).where(Message.id == message_id, Message.conversation_id == conversation_id))
    msg = res.scalars().first()
    if not msg or str(msg.sender_id) != str(current_user.id):
        return error_response("UNAUTHORIZED", "Message not found or permission denied.", status_code=403)

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

    return success_response({"message": "Message deleted"})

@router.delete("/{conversation_id}/clear")
async def clear_direct_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await _ensure_conversation_member(conversation_id, current_user, db)
    await db.execute(delete(Message).where(Message.conversation_id == conversation_id))
    await db.commit()

    mem_res = await db.execute(select(DirectConversationMember.user_id).where(DirectConversationMember.conversation_id == conversation_id))
    member_user_ids = [str(uid) for uid in mem_res.scalars().all()]
    for target_user_id in member_user_ids:
        await ws_manager.send_personal_message(target_user_id, {
            "type": "direct_message.clear",
            "conversation_id": conversation_id
        })

    return success_response({"message": "Conversation history cleared"})
