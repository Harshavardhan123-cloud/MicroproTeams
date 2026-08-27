from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.models.models import User, AuditLog
from app.api.deps import get_current_user
from app.permissions.permissions import PermissionChecker, SystemPermissions
from app.core.response import success_response

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])

@router.get("")
async def get_audit_logs(
    limit: int = 50,
    current_user: User = Depends(PermissionChecker(SystemPermissions.ORG_READ)),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(AuditLog)
        .where(AuditLog.organization_id == current_user.organization_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    logs = res.scalars().all()

    output = [
        {
            "id": str(l.id),
            "user_id": str(l.user_id) if l.user_id else None,
            "action": l.action,
            "resource_type": l.resource_type,
            "resource_id": l.resource_id,
            "details": l.details,
            "created_at": l.created_at.isoformat() if l.created_at else None
        }
        for l in logs
    ]

    return success_response(output)
