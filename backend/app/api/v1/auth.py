from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.models import User, Organization, UserSession
from app.schemas.auth import LoginRequest, RegisterRequest, RefreshTokenRequest
from app.schemas.user import UserResponse
from app.api.deps import get_current_user
from app.core.response import success_response, error_response

router = APIRouter(prefix="/auth", tags=["Authentication"])

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check existing email/username
    existing = await db.execute(select(User).where((User.email == req.email) | (User.username == req.username)))
    if existing.scalars().first():
        return error_response("USER_EXISTS", "User with this email or username already exists.", status_code=400)

    # Find or create organization
    org_slug = req.organization_name.lower().replace(" ", "-")
    org_res = await db.execute(select(Organization).where(Organization.slug == org_slug))
    org = org_res.scalars().first()

    if not org:
        org = Organization(
            name=req.organization_name,
            slug=org_slug,
            description="Enterprise Workspace"
        )
        db.add(org)
        await db.flush()

    display_name = f"{req.first_name} {req.last_name}"
    user = User(
        organization_id=org.id,
        email=req.email,
        username=req.username,
        hashed_password=get_password_hash(req.password),
        first_name=req.first_name,
        last_name=req.last_name,
        display_name=display_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    # Store user session
    session = UserSession(
        user_id=user.id,
        refresh_token=refresh_token,
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    db.add(session)
    await db.commit()

    return success_response({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "display_name": user.display_name,
            "organization_id": str(user.organization_id)
        }
    })

@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.email == req.email))
    user = res.scalars().first()

    if not user or not verify_password(req.password, user.hashed_password):
        return error_response("INVALID_CREDENTIALS", "Invalid email or password.", status_code=401)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    session = UserSession(
        user_id=user.id,
        refresh_token=refresh_token,
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    db.add(session)
    await db.commit()

    return success_response({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "display_name": user.display_name,
            "organization_id": str(user.organization_id)
        }
    })

@router.post("/refresh")
async def refresh(req: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(req.refresh_token, is_refresh=True)
    if not payload:
        return error_response("INVALID_TOKEN", "Invalid or expired refresh token.", status_code=401)

    user_id = payload.get("sub")
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalars().first()

    if not user:
        return error_response("USER_NOT_FOUND", "User not found.", status_code=404)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return success_response({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    })

@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not verify_password(req.current_password, current_user.hashed_password):
        return error_response("INVALID_PASSWORD", "Current password is incorrect.", status_code=400)

    current_user.hashed_password = get_password_hash(req.new_password)
    await db.commit()
    return success_response({"message": "Password updated successfully"})

@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Revoke sessions for this user
    sessions = await db.execute(select(UserSession).where(UserSession.user_id == current_user.id))
    for sess in sessions.scalars().all():
        sess.is_revoked = True
    await db.commit()
    return success_response({"message": "Successfully logged out"})

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return success_response({
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "display_name": current_user.display_name,
        "organization_id": str(current_user.organization_id),
        "presence": current_user.presence,
        "status_message": current_user.status_message,
        "is_active": current_user.is_active,
        "is_superuser": current_user.is_superuser
    })
