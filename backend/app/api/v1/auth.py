from datetime import datetime, timedelta
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from app.core.config import settings
from app.core.limiter import limiter
from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.models import User, Organization, UserSession, Role
from app.schemas.auth import LoginRequest, RegisterRequest, RefreshTokenRequest
from app.schemas.user import UserResponse
from app.api.deps import get_current_user
from app.core.response import success_response, error_response

router = APIRouter(prefix="/auth", tags=["Authentication"])

REFRESH_TOKEN_TTL = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

# Free/consumer email providers never anchor an org's domain: otherwise anyone
# with a Gmail account could auto-join any org whose admin also signed up with
# Gmail. Not exhaustive by design — just enough to make the common case safe.
_FREE_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
    "aol.com", "protonmail.com", "live.com", "msn.com", "mail.com",
}

def _email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower()

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@router.post("/register")
@limiter.limit("10/minute")
async def register(request: Request, req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check existing email/username
    existing = await db.execute(select(User).where((User.email == req.email) | (User.username == req.username)))
    if existing.scalars().first():
        return error_response("USER_EXISTS", "User with this email or username already exists.", status_code=400)

    # Joining an existing org is only allowed when the registrant's email
    # domain matches that org's registered domain (like Slack/Teams workspace
    # auto-join) — never just by typing the org's display name, which would
    # let anyone enroll into any tenant they can name.
    org_slug = req.organization_name.lower().replace(" ", "-")
    new_user_domain = _email_domain(req.email)
    is_free_email = new_user_domain in _FREE_EMAIL_DOMAINS

    existing_org_res = await db.execute(select(Organization).where(Organization.slug == org_slug))
    existing_org = existing_org_res.scalars().first()

    if existing_org:
        if is_free_email or not existing_org.domain or existing_org.domain != new_user_domain:
            return error_response(
                "ORG_EXISTS",
                "An organization with this name already exists. If you work there, register with your company email address, or ask an admin to invite you.",
                status_code=400
            )
        org = existing_org
        is_new_org = False
    else:
        org = Organization(
            name=req.organization_name,
            slug=org_slug,
            domain=None if is_free_email else new_user_domain,
            description="Enterprise Workspace"
        )
        db.add(org)
        await db.flush()
        is_new_org = True

    # The first member of a new org is its admin; anyone auto-joining an
    # existing org via domain match is a standard member.
    role_name = "ORG_ADMIN" if is_new_org else "USER"
    role_res = await db.execute(select(Role).where(Role.name == role_name))
    role = role_res.scalars().first()
    if not role:
        role = Role(name=role_name, description="Organization Administrator" if is_new_org else "Standard Enterprise Member")
        db.add(role)
        await db.flush()

    display_name = f"{req.first_name} {req.last_name}"
    user = User(
        organization_id=org.id,
        role_id=role.id,
        email=req.email,
        username=req.username,
        hashed_password=get_password_hash(req.password),
        first_name=req.first_name,
        last_name=req.last_name,
        display_name=display_name,
    )
    db.add(user)
    await db.flush()

    if is_new_org:
        org.owner_id = user.id
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    # Store user session
    session = UserSession(
        user_id=user.id,
        refresh_token=refresh_token,
        expires_at=datetime.utcnow() + REFRESH_TOKEN_TTL
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
@limiter.limit("10/minute")
async def login(request: Request, req: LoginRequest, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.email == req.email))
    user = res.scalars().first()

    if not user or not verify_password(req.password, user.hashed_password):
        return error_response("INVALID_CREDENTIALS", "Invalid email or password.", status_code=401)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    session = UserSession(
        user_id=user.id,
        refresh_token=refresh_token,
        expires_at=datetime.utcnow() + REFRESH_TOKEN_TTL
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

    try:
        user_uuid = UUID(payload.get("sub"))
    except (ValueError, TypeError, AttributeError):
        return error_response("INVALID_TOKEN", "Invalid or expired refresh token.", status_code=401)

    # The token's signature alone isn't enough: it must also match a live,
    # non-revoked session, so logout (which revokes sessions) actually takes
    # effect instead of the same refresh token working forever.
    session_res = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user_uuid,
            UserSession.refresh_token == req.refresh_token
        )
    )
    session = session_res.scalars().first()
    if not session or session.is_revoked or session.expires_at < datetime.utcnow():
        return error_response("INVALID_TOKEN", "Invalid or expired refresh token.", status_code=401)

    res = await db.execute(select(User).where(User.id == user_uuid))
    user = res.scalars().first()
    if not user:
        return error_response("USER_NOT_FOUND", "User not found.", status_code=404)

    # Rotate: this refresh token is now single-use.
    session.is_revoked = True
    access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token(user.id)
    db.add(UserSession(
        user_id=user.id,
        refresh_token=new_refresh_token,
        expires_at=datetime.utcnow() + REFRESH_TOKEN_TTL
    ))
    await db.commit()

    return success_response({
        "access_token": access_token,
        "refresh_token": new_refresh_token,
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
