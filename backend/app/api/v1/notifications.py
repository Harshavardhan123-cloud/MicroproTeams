from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import User
from app.models.notification import Notification, NotificationPreference
from app.api.deps import get_current_user
from app.core.response import success_response
from app.services.notification_service import get_user_preferences, update_user_preferences

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
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    )
    items = res.scalars().all()

    unread_count = sum(1 for n in items if n.status == "UNREAD")

    data = [n.to_dict() for n in items]

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
                Notification.status == "UNREAD"
            )
        )
        items = res.scalars().all()
        for n in items:
            n.status = "READ"
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
            n.status = "READ"
            n.read_at = datetime.utcnow()

    await db.commit()
    return success_response({"message": "Notifications marked as read."})

@router.delete("/{notification_id}")
async def delete_notification_endpoint(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        n_uuid = uuid.UUID(str(notification_id))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid notification ID format")

    stmt = delete(Notification).where(
        Notification.id == n_uuid,
        Notification.user_id == current_user.id
    )
    await db.execute(stmt)
    await db.commit()
    return success_response({"message": "Notification deleted successfully."})

@router.delete("")
async def clear_all_notifications_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = delete(Notification).where(Notification.user_id == current_user.id)
    await db.execute(stmt)
    await db.commit()
    return success_response({"message": "All notifications cleared successfully."})

@router.get("/preferences")
async def get_preferences_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    pref = await get_user_preferences(db, str(current_user.id))
    return success_response(pref.to_dict())

@router.put("/preferences")
async def update_preferences_endpoint(
    updates: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    pref = await update_user_preferences(db, str(current_user.id), updates)
    return success_response(pref.to_dict())
