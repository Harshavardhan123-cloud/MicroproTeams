"""
Authentication API — register, login, refresh, logout, SSO.
"""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    generate_key_pair, generate_secure_token
)
from core.config import settings
from core.dependencies import CurrentUser
from models.user import User
from schemas.auth import (
    RegisterRequest, LoginResponse, RefreshRequest,
    UserPublicResponse
)

router = APIRouter()


@router.post("/register", response_model=UserPublicResponse, status_code=201)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user with email + password."""
    # Check duplicate
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Generate E2E keypair
    keypair = generate_key_pair()

    user = User(
        email=payload.email,
        display_name=payload.display_name,
        username=payload.username or payload.email.split("@")[0],
        hashed_password=hash_password(payload.password),
        public_key=keypair["public_key"],
        encrypted_private_key=keypair["private_key"],  # TODO: encrypt with user's password
        is_verified=False,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return UserPublicResponse.model_validate(user)


@router.post("/login", response_model=LoginResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Login with email + password → returns JWT access + refresh tokens."""
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    access_token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    refresh_token = create_refresh_token({"sub": user.id})

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserPublicResponse.model_validate(user),
    )


@router.post("/refresh", response_model=LoginResponse)
async def refresh_token(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a refresh token for a new access + refresh token pair."""
    try:
        data = decode_token(payload.refresh_token)
        if data.get("type") != "refresh":
            raise ValueError("Not a refresh token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == data["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    access_token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    new_refresh = create_refresh_token({"sub": user.id})

    return LoginResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        token_type="bearer",
        user=UserPublicResponse.model_validate(user),
    )


@router.get("/me", response_model=UserPublicResponse)
async def get_me(current_user: CurrentUser):
    """Get authenticated user's profile."""
    return UserPublicResponse.model_validate(current_user)


@router.post("/logout", status_code=204)
async def logout(current_user: CurrentUser):
    """Logout — client should discard tokens. Future: add token to blocklist in Redis."""
    return Response(status_code=204)


def code():
    print(settings.CORS_ORIGINS)