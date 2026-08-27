from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import User, Message, Team, Channel
from app.api.deps import get_current_user
from app.core.response import success_response

router = APIRouter(prefix="/search", tags=["Search"])

@router.get("")
async def global_search(
    q: str = Query(..., min_length=1),
    type: Optional[str] = Query("all"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query_str = f"%{q}%"
    results = {
        "users": [],
        "messages": [],
        "teams": [],
        "channels": []
    }

    # Search Users
    if type in ["all", "users"]:
        u_res = await db.execute(
            select(User)
            .where(
                User.organization_id == current_user.organization_id,
                (User.display_name.ilike(query_str)) | (User.email.ilike(query_str)) | (User.username.ilike(query_str))
            )
            .limit(10)
        )
        results["users"] = [
            {
                "id": str(u.id),
                "display_name": u.display_name,
                "email": u.email,
                "avatar_url": u.avatar_url,
                "presence": u.presence,
                "department": u.department
            }
            for u in u_res.scalars().all()
        ]

    # Search Messages
    if type in ["all", "messages"]:
        m_res = await db.execute(
            select(Message)
            .options(selectinload(Message.sender))
            .where(Message.content.ilike(query_str))
            .order_by(Message.created_at.desc())
            .limit(10)
        )
        results["messages"] = [
            {
                "id": str(m.id),
                "channel_id": str(m.channel_id) if m.channel_id else None,
                "conversation_id": str(m.conversation_id) if m.conversation_id else None,
                "content": m.content,
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "sender_name": m.sender.display_name if m.sender else "Unknown"
            }
            for m in m_res.scalars().all()
        ]

    # Search Teams
    if type in ["all", "teams"]:
        t_res = await db.execute(
            select(Team)
            .where(
                Team.organization_id == current_user.organization_id,
                Team.name.ilike(query_str)
            )
            .limit(10)
        )
        results["teams"] = [
            {"id": str(t.id), "name": t.name, "description": t.description}
            for t in t_res.scalars().all()
        ]

    # Search Channels
    if type in ["all", "channels"]:
        c_res = await db.execute(
            select(Channel)
            .where(Channel.name.ilike(query_str))
            .limit(10)
        )
        results["channels"] = [
            {"id": str(c.id), "team_id": str(c.team_id), "name": c.name, "type": c.type}
            for c in c_res.scalars().all()
        ]

    return success_response(results)
