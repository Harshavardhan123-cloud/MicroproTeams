from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import User
from app.api.deps import get_current_user
from app.core.response import success_response, error_response

from app.core.websocket import ws_manager

router = APIRouter(prefix="/users", tags=["Users"])

class UpdateUserMeRequest(BaseModel):
    display_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    avatar_url: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    status_message: Optional[str] = None
    presence: Optional[str] = None

class UpdatePresenceRequest(BaseModel):
    presence: str

@router.get("")
async def list_users(
    q: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy.orm import selectinload
    stmt = select(User).options(selectinload(User.organization_unit)).where(User.organization_id == current_user.organization_id)
    if q:
        search_pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            (User.email.ilike(search_pattern)) |
            (User.display_name.ilike(search_pattern)) |
            (User.username.ilike(search_pattern))
        )
    
    res = await db.execute(stmt)
    users = res.scalars().all()
    data = []
    for u in users:
        uid_str = str(u.id)
        is_active_ws = uid_str in ws_manager.user_connections and bool(ws_manager.user_connections[uid_str])
        raw_presence = u.presence.value if hasattr(u.presence, "value") else str(u.presence or "offline")
        effective_presence = "available" if (is_active_ws and raw_presence == "offline") else raw_presence
        data.append({
            "id": uid_str,
            "email": u.email,
            "username": u.username,
            "display_name": u.display_name,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "avatar_url": u.avatar_url,
            "job_title": u.job_title,
            "department": u.department,
            "organization_unit_id": str(u.organization_unit_id) if u.organization_unit_id else None,
            "organization_unit_name": u.organization_unit.name if u.organization_unit else None,
            "presence": effective_presence,
            "status_message": u.status_message,
            "is_active": u.is_active
        })
    return success_response(data)

@router.get("/me")
async def get_user_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy.orm import selectinload
    me_res = await db.execute(
        select(User).options(selectinload(User.organization_unit)).where(User.id == current_user.id)
    )
    user_me = me_res.scalar_one_or_none() or current_user

    uid_str = str(user_me.id)
    is_active_ws = uid_str in ws_manager.user_connections and bool(ws_manager.user_connections[uid_str])
    raw_presence = user_me.presence.value if hasattr(user_me.presence, "value") else str(user_me.presence or "offline")
    effective_presence = "available" if (is_active_ws and raw_presence == "offline") else raw_presence

    return success_response({
        "id": uid_str,
        "email": user_me.email,
        "username": user_me.username,
        "display_name": user_me.display_name,
        "first_name": user_me.first_name,
        "last_name": user_me.last_name,
        "avatar_url": user_me.avatar_url,
        "job_title": user_me.job_title,
        "department": user_me.department,
        "organization_unit_id": str(user_me.organization_unit_id) if user_me.organization_unit_id else None,
        "organization_unit_name": user_me.organization_unit.name if user_me.organization_unit else None,
        "presence": effective_presence,
        "status_message": user_me.status_message,
        "is_active": user_me.is_active,
        "organization_id": str(user_me.organization_id)
    })

@router.put("/me/presence")
async def update_user_presence(
    req: UpdatePresenceRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    current_user.presence = req.presence
    await db.commit()
    await db.refresh(current_user)

    await ws_manager.broadcast_to_all({
        "type": "presence_update",
        "user_id": str(current_user.id),
        "presence": req.presence
    })

    return success_response({
        "id": str(current_user.id),
        "presence": current_user.presence
    })

@router.put("/me")
async def update_user_me(
    req: UpdateUserMeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if req.display_name is not None:
        current_user.display_name = req.display_name
    if req.first_name is not None:
        current_user.first_name = req.first_name
    if req.last_name is not None:
        current_user.last_name = req.last_name
    if req.avatar_url is not None:
        current_user.avatar_url = req.avatar_url
    if req.job_title is not None:
        current_user.job_title = req.job_title
    if req.department is not None:
        current_user.department = req.department
    if req.status_message is not None:
        current_user.status_message = req.status_message
    if req.presence is not None:
        current_user.presence = req.presence

    await db.commit()
    await db.refresh(current_user)

    return success_response({
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "display_name": current_user.display_name,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "avatar_url": current_user.avatar_url,
        "job_title": current_user.job_title,
        "department": current_user.department,
        "presence": current_user.presence,
        "status_message": current_user.status_message,
        "is_active": current_user.is_active,
        "organization_id": str(current_user.organization_id)
    })
