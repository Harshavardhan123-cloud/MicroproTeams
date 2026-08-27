from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import AuditLog

class AuditService:
    @staticmethod
    async def log_action(
        db: AsyncSession,
        organization_id: str,
        user_id: Optional[str],
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        details: Optional[str] = None
    ) -> AuditLog:
        audit = AuditLog(
            organization_id=organization_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            details=details
        )
        db.add(audit)
        await db.commit()
        await db.refresh(audit)
        return audit
