"""
Users API — profile, presence, search, status update.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import List
from datetime import datetime

from core.database import get_db
from core.dependencies import CurrentUser
from models.user import User
from schemas.auth import UserPublicResponse, UserUpdateRequest

router = APIRouter()


@router.get("/", response_model=List[UserPublicResponse])
async def search_users(
    q: str = Query("", min_length=0),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(User).where(User.is_active.is_(True))
    if q:
        like = f"%{q}%"
        query = query.where(or_(User.display_name.ilike(like), User.email.ilike(like), User.username.ilike(like)))
    query = query.limit(20)
    result = await db.execute(query)
    return [UserPublicResponse.model_validate(u) for u in result.scalars().all()]


@router.get("/{user_id}", response_model=UserPublicResponse)
async def get_user(user_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        from fastapi import HTTPException
        raise HTTPException(404, "User not found")
    return UserPublicResponse.model_validate(user)


@router.patch("/me", response_model=UserPublicResponse)
async def update_me(payload: UserUpdateRequest, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(current_user, field, value)
    current_user.updated_at = datetime.utcnow()
    db.add(current_user)
    await db.flush()
    await db.refresh(current_user)
    return UserPublicResponse.model_validate(current_user)
