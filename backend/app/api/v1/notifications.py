from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import Notification, User
from app.api.deps import get_current_user
from app.core.response import success_response

router = APIRouter(prefix="/notifications", tags=["Notifications"])

class MarkReadRequest(BaseModel):
    notification_ids: Optional[List[str]] = None
    mark_all: bool = False

@router.get("")
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.organization_id == current_user.organization_id
        )
        .order_by(Notification.created_at.desc())
        .limit(100)
    )
    items = res.scalars().all()

    unread_count = sum(1 for n in items if not n.is_read)

    data = [
        {
            "id": str(n.id),
            "type": n.type,
            "title": n.title,
            "body": n.body,
            "resource_type": n.resource_type,
            "resource_id": n.resource_id,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "read_at": n.read_at.isoformat() if n.read_at else None
        }
        for n in items
    ]

    return success_response({
        "unread_count": unread_count,
        "notifications": data
    })

@router.post("/read")
async def mark_notifications_read(
    req: MarkReadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if req.mark_all:
        res = await db.execute(
            select(Notification).where(
                Notification.user_id == current_user.id,
                Notification.is_read == False
            )
        )
        items = res.scalars().all()
        for n in items:
            n.is_read = True
            n.read_at = datetime.utcnow()
    elif req.notification_ids:
        res = await db.execute(
            select(Notification).where(
                Notification.id.in_(req.notification_ids),
                Notification.user_id == current_user.id
            )
        )
        items = res.scalars().all()
        for n in items:
            n.is_read = True
            n.read_at = datetime.utcnow()

    await db.commit()
    return success_response({"message": "Notifications marked as read."})
