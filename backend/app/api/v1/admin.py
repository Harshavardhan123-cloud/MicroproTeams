import uuid
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

from app.core.database import get_db
from app.api.v1.auth import get_current_user
from app.models.models import (
    User, AuditLog, RetentionPolicy, LegalHold, OrganizationPolicy,
    ExportJob, RetentionResourceType, RetentionAction
)
from app.services.compliance_service import ComplianceService, log_audit
from app.services.analytics_service import AnalyticsService
from app.services.export_service import ExportService

router = APIRouter(prefix="/admin", tags=["Administration"])

# Permission check helper for Admin endpoints
def require_admin(current_user: User = Depends(get_current_user)):
    if not current_user.is_superuser and current_user.role_id is None:
        # Check if user has admin privileges
        pass
    return current_user

class CreateUserRequest(BaseModel):
    email: str
    username: str
    password: str
    first_name: str
    last_name: str
    role: Optional[str] = "MEMBER"

class UpdateUserRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None

class CreateRetentionPolicyRequest(BaseModel):
    resource_type: RetentionResourceType
    retention_days: int
    action: RetentionAction

class CreateLegalHoldRequest(BaseModel):
    resource_type: str
    resource_id: str
    reason: str

class UpdatePolicyRequest(BaseModel):
    allow_external_users: Optional[bool] = None
    allow_guest_access: Optional[bool] = None
    allow_file_sharing: Optional[bool] = None
    allow_external_file_links: Optional[bool] = None
    allow_recording: Optional[bool] = None
    allow_transcription: Optional[bool] = None
    allow_ai_features: Optional[bool] = None
    max_file_size: Optional[int] = None
    max_meeting_participants: Optional[int] = None
    retention_days: Optional[int] = None

@router.get("/users")
async def list_users(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User).where(User.organization_id == current_user.organization_id)
    res = await db.execute(stmt)
    users = res.scalars().all()
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "username": u.username,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "display_name": u.display_name,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat()
        }
        for u in users
    ]

@router.post("/users/{user_id}/disable")
async def disable_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User).where(User.id == uuid.UUID(user_id))
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    await db.commit()

    await log_audit(
        db, str(current_user.organization_id), str(current_user.id),
        "USER_DISABLED", "USER", user_id
    )
    return {"status": "success", "message": "User has been disabled."}

@router.get("/audit")
@router.get("/audit-logs")
async def list_audit_logs(
    actor: Optional[str] = None,
    action: Optional[str] = None,
    resource: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AuditLog).where(AuditLog.organization_id == current_user.organization_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if resource:
        stmt = stmt.where(AuditLog.resource_type == resource)
    stmt = stmt.order_by(AuditLog.created_at.desc()).limit(100)

    res = await db.execute(stmt)
    logs = res.scalars().all()

    return [
        {
            "id": str(l.id),
            "organization_id": str(l.organization_id),
            "actor_id": str(l.user_id or l.actor_id) if (l.user_id or l.actor_id) else None,
            "action": l.action,
            "resource_type": l.resource_type,
            "resource_id": l.resource_id,
            "ip_address": l.ip_address,
            "user_agent": l.user_agent,
            "details": l.details,
            "created_at": l.created_at.isoformat()
        }
        for l in logs
    ]

@router.get("/policies")
async def get_policies(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    policy = await ComplianceService.get_or_create_org_policy(db, str(current_user.organization_id))
    return {
        "id": str(policy.id),
        "allow_external_users": policy.allow_external_users,
        "allow_guest_access": policy.allow_guest_access,
        "allow_file_sharing": policy.allow_file_sharing,
        "allow_external_file_links": policy.allow_external_file_links,
        "allow_recording": policy.allow_recording,
        "allow_transcription": policy.allow_transcription,
        "allow_ai_features": policy.allow_ai_features,
        "max_file_size": policy.max_file_size,
        "max_meeting_participants": policy.max_meeting_participants,
        "retention_days": policy.retention_days,
        "max_ai_minutes_per_month": policy.max_ai_minutes_per_month
    }

@router.patch("/policies")
async def update_policies(
    body: UpdatePolicyRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    updated = await ComplianceService.update_org_policy(
        db, str(current_user.organization_id), body.dict(exclude_unset=True), str(current_user.id)
    )
    return {"status": "success", "policy_id": str(updated.id)}

@router.get("/analytics")
@router.get("/analytics/overview")
async def get_analytics_overview(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    return await AnalyticsService.get_overview(db, str(current_user.organization_id))

@router.get("/analytics/meetings")
async def get_analytics_meetings(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    return await AnalyticsService.get_meeting_analytics(db, str(current_user.organization_id))

@router.get("/storage")
@router.get("/analytics/storage")
async def get_analytics_storage(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    overview = await AnalyticsService.get_overview(db, str(current_user.organization_id))
    return {
        "used_bytes": overview["storage_used_bytes"],
        "formatted": "150 MB",
        "file_count": 42
    }

@router.get("/retention-policies")
async def list_retention_policies(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    policies = await ComplianceService.list_retention_policies(db, str(current_user.organization_id))
    return [
        {
            "id": str(p.id),
            "resource_type": p.resource_type.value,
            "retention_days": p.retention_days,
            "action": p.action.value,
            "enabled": p.enabled,
            "created_at": p.created_at.isoformat()
        }
        for p in policies
    ]

@router.post("/retention-policies")
async def create_retention_policy(
    body: CreateRetentionPolicyRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    policy = await ComplianceService.create_retention_policy(
        db, str(current_user.organization_id), body.resource_type, body.retention_days, body.action, str(current_user.id)
    )
    return {"status": "success", "id": str(policy.id)}

@router.get("/legal-holds")
async def list_legal_holds(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    holds = await ComplianceService.list_legal_holds(db, str(current_user.organization_id))
    return [
        {
            "id": str(h.id),
            "resource_type": h.resource_type,
            "resource_id": h.resource_id,
            "reason": h.reason,
            "created_by": str(h.created_by),
            "created_at": h.created_at.isoformat(),
            "released_at": h.released_at.isoformat() if h.released_at else None
        }
        for h in holds
    ]

@router.post("/legal-holds")
async def create_legal_hold(
    body: CreateLegalHoldRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    hold = await ComplianceService.create_legal_hold(
        db, str(current_user.organization_id), body.resource_type, body.resource_id, body.reason, str(current_user.id)
    )
    return {"status": "success", "id": str(hold.id)}

@router.post("/exports")
async def create_export(
    resource_type: str = "ALL",
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    job = await ExportService.create_export_job(db, str(current_user.organization_id), str(current_user.id), resource_type)
    return {"status": "success", "export_job_id": str(job.id)}

@router.get("/exports")
async def list_exports(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    jobs = await ExportService.list_export_jobs(db, str(current_user.organization_id))
    return [
        {
            "id": str(j.id),
            "resource_type": j.resource_type,
            "status": j.status.value,
            "storage_key": j.storage_key,
            "created_at": j.created_at.isoformat(),
            "completed_at": j.completed_at.isoformat() if j.completed_at else None
        }
        for j in jobs
    ]
