from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import User
from app.api.deps import get_current_user
from app.permissions.permissions import PermissionChecker, SystemPermissions
from app.core.response import success_response, error_response

router = APIRouter(prefix="/users", tags=["Users"])

class UpdateUserMeRequest(BaseModel):
    display_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    status_message: Optional[str] = None

@router.get("")
async def list_users(
    current_user: User = Depends(PermissionChecker(SystemPermissions.USER_READ)),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(User).where(User.organization_id == current_user.organization_id))
    users = res.scalars().all()
    data = [
        {
            "id": str(u.id),
            "email": u.email,
            "username": u.username,
            "display_name": u.display_name,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "avatar_url": u.avatar_url,
            "job_title": u.job_title,
            "department": u.department,
            "presence": u.presence,
            "status_message": u.status_message,
            "is_active": u.is_active
        }
        for u in users
    ]
    return success_response(data)

@router.get("/me")
async def get_user_me(current_user: User = Depends(get_current_user)):
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
    if req.job_title is not None:
        current_user.job_title = req.job_title
    if req.department is not None:
        current_user.department = req.department
    if req.status_message is not None:
        current_user.status_message = req.status_message

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
