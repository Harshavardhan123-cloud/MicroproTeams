import hashlib
import logging
import secrets
from datetime import datetime, timedelta
from typing import Literal, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, EmailStr, field_validator

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
from app.models.models import User, Organization, UserSession, Role, PasswordResetToken, EmailOTP
from app.schemas.auth import LoginRequest, RegisterRequest, RefreshTokenRequest
from app.schemas.user import UserResponse
from app.api.deps import get_current_user
from app.core.response import success_response, error_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])

RESET_TOKEN_TTL = timedelta(minutes=30)
OTP_TTL = timedelta(minutes=10)
REFRESH_TOKEN_TTL = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

_FREE_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
    "aol.com", "protonmail.com", "live.com", "msn.com", "mail.com",
}

def _email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower()

class SendOTPRequest(BaseModel):
    email: EmailStr
    purpose: str

    @field_validator("purpose", mode="before")
    @classmethod
    def uppercase_purpose(cls, v: str) -> str:
        if isinstance(v, str):
            return v.upper()
        return v

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp_code: str
    purpose: str

    @field_validator("purpose", mode="before")
    @classmethod
    def uppercase_purpose(cls, v: str) -> str:
        if isinstance(v, str):
            return v.upper()
        return v

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    otp_code: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str
    new_password: str

async def _verify_and_consume_otp(db: AsyncSession, email: str, otp_code: str, purpose: str) -> bool:
    email_clean = email.strip().lower()
    otp_clean = otp_code.strip() if otp_code else ""
    res = await db.execute(
        select(EmailOTP)
        .where(
            EmailOTP.email == email_clean,
            EmailOTP.purpose == purpose,
            EmailOTP.otp_code == otp_clean,
            EmailOTP.expires_at > datetime.utcnow()
        )
        .order_by(EmailOTP.created_at.desc())
    )
    record = res.scalars().first()
    if record:
        record.is_verified = True
        return True
    return False

@router.post("/send-otp")
@limiter.limit("5/minute")
async def send_otp(request: Request, req: SendOTPRequest, db: AsyncSession = Depends(get_db)):
    email_clean = req.email.strip().lower()

    user_res = await db.execute(select(User).where(User.email == email_clean))
    user = user_res.scalars().first()

    if req.purpose == "REGISTER" and user:
        return error_response("USER_EXISTS", "An account with this email address already exists.", status_code=400)
    elif req.purpose in ("FORGOT_PASSWORD", "CHANGE_PASSWORD") and not user:
        return error_response("USER_NOT_FOUND", "No registered user found with this email address.", status_code=404)

    # Generate 6-digit numeric OTP
    otp_code = f"{secrets.randbelow(900000) + 100000}"

    otp_record = EmailOTP(
        email=email_clean,
        otp_code=otp_code,
        purpose=req.purpose,
        is_verified=False,
        expires_at=datetime.utcnow() + OTP_TTL
    )
    db.add(otp_record)
    await db.commit()

    logger.info(f"[EMAIL OTP SERVICE] OTP {otp_code} sent to {email_clean} for {req.purpose}")

    return success_response({
        "message": f"6-digit verification code sent to {email_clean}",
        "email": email_clean,
        "purpose": req.purpose,
        "dev_otp": otp_code
    })

@router.post("/verify-otp")
@limiter.limit("10/minute")
async def verify_otp(request: Request, req: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    email_clean = req.email.strip().lower()
    otp_clean = req.otp_code.strip()

    is_valid = await _verify_and_consume_otp(db, email_clean, otp_clean, req.purpose)
    if not is_valid:
        return error_response("INVALID_OTP", "Invalid or expired OTP verification code.", status_code=400)

    await db.commit()
    return success_response({
        "message": "Email verified successfully.",
        "email": email_clean,
        "purpose": req.purpose
    })

@router.post("/register")
@limiter.limit("10/minute")
async def register(request: Request, req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check existing email/username
    existing = await db.execute(select(User).where((User.email == req.email) | (User.username == req.username)))
    if existing.scalars().first():
        return error_response("USER_EXISTS", "User with this email or username already exists.", status_code=400)

    # Enforce OTP verification if provided or required in production
    if req.otp_code:
        is_otp_valid = await _verify_and_consume_otp(db, req.email, req.otp_code, "REGISTER")
        if not is_otp_valid:
            return error_response("INVALID_OTP", "Invalid or expired OTP code for registration.", status_code=400)
    elif settings.ENVIRONMENT == "production":
        return error_response("OTP_REQUIRED", "Email OTP code is required for registration.", status_code=400)

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

    if not req.otp_code:
        return error_response("OTP_REQUIRED", "Email OTP code is required to change password.", status_code=400)

    is_otp_valid = await _verify_and_consume_otp(db, current_user.email, req.otp_code, "CHANGE_PASSWORD")
    if not is_otp_valid:
        return error_response("INVALID_OTP", "Invalid or expired OTP verification code.", status_code=400)

    current_user.hashed_password = get_password_hash(req.new_password)
    await db.commit()
    return success_response({"message": "Password updated successfully"})

@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    email_clean = req.email.strip().lower()
    res = await db.execute(select(User).where(User.email == email_clean))
    user = res.scalars().first()

    if not user:
        return error_response("USER_NOT_FOUND", "No account registered with this email address.", status_code=404)

    otp_code = f"{secrets.randbelow(900000) + 100000}"
    otp_record = EmailOTP(
        email=email_clean,
        otp_code=otp_code,
        purpose="FORGOT_PASSWORD",
        is_verified=False,
        expires_at=datetime.utcnow() + OTP_TTL
    )
    db.add(otp_record)
    await db.commit()

    logger.info(f"[EMAIL OTP SERVICE] Forgot Password OTP {otp_code} for {email_clean}")

    return success_response({
        "message": f"Password reset OTP code sent to {email_clean}",
        "email": email_clean,
        "dev_otp": otp_code
    })

@router.post("/reset-password")
@limiter.limit("10/minute")
async def reset_password(request: Request, req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    email_clean = req.email.strip().lower()
    otp_clean = req.otp_code.strip()

    res = await db.execute(select(User).where(User.email == email_clean))
    user = res.scalars().first()

    if not user:
        return error_response("USER_NOT_FOUND", "No account registered with this email address.", status_code=404)

    is_otp_valid = await _verify_and_consume_otp(db, email_clean, otp_clean, "FORGOT_PASSWORD")
    if not is_otp_valid:
        return error_response("INVALID_OTP", "Invalid or expired OTP verification code.", status_code=400)

    user.hashed_password = get_password_hash(req.new_password)

    # Revoke sessions for this user
    sessions = await db.execute(select(UserSession).where(UserSession.user_id == user.id))
    for sess in sessions.scalars().all():
        sess.is_revoked = True

    await db.commit()
    return success_response({"message": "Password has been reset. Please sign in with your new password."})

@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    sessions = await db.execute(select(UserSession).where(UserSession.user_id == current_user.id))
    for sess in sessions.scalars().all():
        sess.is_revoked = True
    await db.commit()
    return success_response({"message": "Successfully logged out"})

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    role_name = "USER"
    if current_user.role:
        role_name = current_user.role.name
    elif current_user.is_superuser:
        role_name = "ORG_ADMIN"

    is_admin = current_user.is_superuser or role_name in ("ORG_ADMIN", "ADMIN")

    return success_response({
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "display_name": current_user.display_name,
        "avatar_url": current_user.avatar_url,
        "organization_id": str(current_user.organization_id),
        "presence": current_user.presence,
        "status_message": current_user.status_message,
        "is_active": current_user.is_active,
        "is_superuser": current_user.is_superuser,
        "role": role_name,
        "is_admin": is_admin
    })
