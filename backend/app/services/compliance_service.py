import uuid
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update

from app.models.models import (
    AuditLog, LegalHold, RetentionPolicy, OrganizationPolicy,
    RetentionResourceType, RetentionAction
)

logger = logging.getLogger(__name__)

async def log_audit(
    db: AsyncSession,
    organization_id: str,
    actor_id: Optional[str],
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
) -> AuditLog:
    log_entry = AuditLog(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(organization_id) if isinstance(organization_id, str) else organization_id,
        user_id=uuid.UUID(actor_id) if actor_id else None,
        actor_id=uuid.UUID(actor_id) if actor_id else None,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent,
        created_at=datetime.utcnow()
    )
    db.add(log_entry)
    await db.commit()
    return log_entry

async def is_legal_held(
    db: AsyncSession,
    organization_id: str,
    resource_type: str,
    resource_id: str
) -> bool:
    stmt = select(LegalHold).where(
        LegalHold.organization_id == uuid.UUID(organization_id),
        LegalHold.resource_type == resource_type,
        LegalHold.resource_id == resource_id,
        LegalHold.released_at.is_(None)
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none() is not None

class ComplianceService:
    @staticmethod
    async def create_legal_hold(
        db: AsyncSession,
        organization_id: str,
        resource_type: str,
        resource_id: str,
        reason: str,
        created_by: str
    ) -> LegalHold:
        hold = LegalHold(
            id=uuid.uuid4(),
            organization_id=uuid.UUID(organization_id),
            resource_type=resource_type,
            resource_id=resource_id,
            reason=reason,
            created_by=uuid.UUID(created_by),
            created_at=datetime.utcnow()
        )
        db.add(hold)
        await db.commit()
        await db.refresh(hold)

        await log_audit(
            db, organization_id, created_by, "LEGAL_HOLD_CREATED", resource_type, resource_id, f"Reason: {reason}"
        )
        return hold

    @staticmethod
    async def release_legal_hold(
        db: AsyncSession,
        hold_id: str,
        user_id: str
    ) -> bool:
        stmt = select(LegalHold).where(LegalHold.id == uuid.UUID(hold_id))
        res = await db.execute(stmt)
        hold = res.scalar_one_or_none()
        if not hold:
            return False

        hold.released_at = datetime.utcnow()
        await db.commit()

        await log_audit(
            db, str(hold.organization_id), user_id, "LEGAL_HOLD_RELEASED", hold.resource_type, hold.resource_id
        )
        return True

    @staticmethod
    async def list_legal_holds(db: AsyncSession, organization_id: str) -> List[LegalHold]:
        stmt = select(LegalHold).where(
            LegalHold.organization_id == uuid.UUID(organization_id)
        ).order_by(LegalHold.created_at.desc())
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def get_or_create_org_policy(db: AsyncSession, organization_id: str) -> OrganizationPolicy:
        stmt = select(OrganizationPolicy).where(OrganizationPolicy.organization_id == uuid.UUID(organization_id))
        res = await db.execute(stmt)
        policy = res.scalar_one_or_none()
        if not policy:
            policy = OrganizationPolicy(
                id=uuid.uuid4(),
                organization_id=uuid.UUID(organization_id)
            )
            db.add(policy)
            await db.commit()
            await db.refresh(policy)
        return policy

    @staticmethod
    async def update_org_policy(
        db: AsyncSession,
        organization_id: str,
        policy_data: dict,
        user_id: str
    ) -> OrganizationPolicy:
        policy = await ComplianceService.get_or_create_org_policy(db, organization_id)
        for key, val in policy_data.items():
            if hasattr(policy, key):
                setattr(policy, key, val)
        policy.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(policy)

        await log_audit(
            db, organization_id, user_id, "ORGANIZATION_POLICY_UPDATED", "ORGANIZATION_POLICY", str(policy.id), str(policy_data)
        )
        return policy

    @staticmethod
    async def list_retention_policies(db: AsyncSession, organization_id: str) -> List[RetentionPolicy]:
        stmt = select(RetentionPolicy).where(RetentionPolicy.organization_id == uuid.UUID(organization_id))
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def create_retention_policy(
        db: AsyncSession,
        organization_id: str,
        resource_type: RetentionResourceType,
        retention_days: int,
        action: RetentionAction,
        user_id: str
    ) -> RetentionPolicy:
        policy = RetentionPolicy(
            id=uuid.uuid4(),
            organization_id=uuid.UUID(organization_id),
            resource_type=resource_type,
            retention_days=retention_days,
            action=action,
            enabled=True
        )
        db.add(policy)
        await db.commit()
        await db.refresh(policy)

        await log_audit(
            db, organization_id, user_id, "RETENTION_POLICY_CREATED", resource_type.value, str(policy.id),
            f"Days: {retention_days}, Action: {action.value}"
        )
        return policy
