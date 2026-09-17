import uuid
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from sqlalchemy.orm import selectinload

from app.models.models import OrganizationUnit, User, Organization
from app.schemas.organization_unit import (
    OrganizationUnitCreate, OrganizationUnitUpdate,
    OrganizationUnitResponse, HierarchyTreeNode,
    ManagerSummary, EmployeeSummary, BulkAssignItem
)
from app.services.compliance_service import log_audit

logger = logging.getLogger(__name__)

class OrganizationUnitService:

    @staticmethod
    async def validate_no_cycle(db: AsyncSession, unit_id: UUID, new_parent_id: Optional[UUID]) -> None:
        """Ensure moving unit_id under new_parent_id does not create a circular dependency."""
        if not new_parent_id:
            return

        if unit_id == new_parent_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="INVALID_PARENT: An organizational unit cannot be its own parent."
            )

        curr: Optional[UUID] = new_parent_id
        visited = {curr}

        while curr:
            stmt = select(OrganizationUnit.parent_id).where(OrganizationUnit.id == curr)
            res = await db.execute(stmt)
            p_id = res.scalar_one_or_none()

            if not p_id:
                break

            if p_id == unit_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="INVALID_PARENT: The selected parent unit would create a circular hierarchy."
                )

            if p_id in visited:
                break
            visited.add(p_id)
            curr = p_id

    @staticmethod
    async def validate_org_isolation(
        db: AsyncSession,
        org_id: UUID,
        parent_id: Optional[UUID] = None,
        manager_id: Optional[UUID] = None
    ) -> None:
        """Validate that parent unit and manager belong strictly to the same organization."""
        if parent_id:
            p_res = await db.execute(select(OrganizationUnit).where(OrganizationUnit.id == parent_id))
            parent = p_res.scalar_one_or_none()
            if not parent or parent.organization_id != org_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="INVALID_PARENT: Parent unit does not exist or belongs to another organization."
                )

        if manager_id:
            m_res = await db.execute(select(User).where(User.id == manager_id))
            manager = m_res.scalar_one_or_none()
            if not manager or manager.organization_id != org_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="INVALID_MANAGER: Selected manager does not exist or belongs to another organization."
                )

    @staticmethod
    async def validate_unique_code(
        db: AsyncSession,
        org_id: UUID,
        code: Optional[str],
        exclude_unit_id: Optional[UUID] = None
    ) -> None:
        """Enforce unique unit code within the same organization (case-insensitive)."""
        if not code or not code.strip():
            return

        clean_code = code.strip()
        stmt = select(OrganizationUnit).where(
            OrganizationUnit.organization_id == org_id,
            func.lower(OrganizationUnit.code) == clean_code.lower()
        )
        if exclude_unit_id:
            stmt = stmt.where(OrganizationUnit.id != exclude_unit_id)

        res = await db.execute(stmt)
        if res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"DUPLICATE_CODE: Organizational unit code '{clean_code}' already exists in your organization."
            )

    @staticmethod
    async def validate_safe_deletion(db: AsyncSession, unit_id: UUID) -> None:
        """Verify unit has no child units and no assigned employees before deletion."""
        c_stmt = select(func.count(OrganizationUnit.id)).where(
            OrganizationUnit.parent_id == unit_id,
            OrganizationUnit.deleted_at.is_(None)
        )
        child_count = (await db.execute(c_stmt)).scalar() or 0

        e_stmt = select(func.count(User.id)).where(User.organization_unit_id == unit_id)
        emp_count = (await db.execute(e_stmt)).scalar() or 0

        if child_count > 0 or emp_count > 0:
            reasons = []
            if child_count > 0:
                reasons.append(f"{child_count} child unit(s)")
            if emp_count > 0:
                reasons.append(f"{emp_count} assigned employee(s)")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"SAFE_DELETION_FAILED: This organizational unit cannot be deleted because it contains {' and '.join(reasons)}. Please move or reassign them before deleting this unit."
            )

    @classmethod
    async def create_unit(
        cls,
        db: AsyncSession,
        org_id: UUID,
        actor_id: Optional[UUID],
        payload: OrganizationUnitCreate
    ) -> OrganizationUnit:
        # Validations
        if payload.parent_id:
            await cls.validate_org_isolation(db, org_id, parent_id=payload.parent_id)

        if payload.manager_id:
            await cls.validate_org_isolation(db, org_id, manager_id=payload.manager_id)

        if payload.code:
            await cls.validate_unique_code(db, org_id, payload.code)

        unit = OrganizationUnit(
            id=uuid.uuid4(),
            organization_id=org_id,
            parent_id=payload.parent_id,
            name=payload.name.strip(),
            code=payload.code.strip().upper() if payload.code else None,
            unit_type=payload.unit_type.strip().upper(),
            description=payload.description.strip() if payload.description else None,
            manager_id=payload.manager_id,
            status=payload.status.strip().upper() if payload.status else "ACTIVE",
            order_index=payload.order_index,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(unit)
        await db.commit()
        await db.refresh(unit)

        # Audit log
        await log_audit(
            db=db,
            organization_id=str(org_id),
            actor_id=str(actor_id) if actor_id else None,
            action="ORG_UNIT_CREATED",
            resource_type="ORGANIZATION_UNIT",
            resource_id=str(unit.id),
            details=f"Created unit '{unit.name}' (Code: {unit.code or 'None'}, Type: {unit.unit_type})"
        )

        return unit

    @classmethod
    async def get_unit(cls, db: AsyncSession, org_id: UUID, unit_id: UUID) -> Dict[str, Any]:
        stmt = (
            select(OrganizationUnit)
            .options(selectinload(OrganizationUnit.manager), selectinload(OrganizationUnit.parent))
            .where(
                OrganizationUnit.id == unit_id,
                OrganizationUnit.organization_id == org_id,
                OrganizationUnit.deleted_at.is_(None)
            )
        )
        res = await db.execute(stmt)
        unit = res.scalar_one_or_none()
        if not unit:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organizational unit not found")

        # Counts
        direct_emp_count = (await db.execute(
            select(func.count(User.id)).where(User.organization_unit_id == unit_id)
        )).scalar() or 0

        children_count = (await db.execute(
            select(func.count(OrganizationUnit.id)).where(
                OrganizationUnit.parent_id == unit_id,
                OrganizationUnit.deleted_at.is_(None)
            )
        )).scalar() or 0

        # Subtree total count
        tree_counts = await cls._compute_subtree_counts(db, org_id)
        total_emp_count = tree_counts.get(unit_id, direct_emp_count)

        # Direct employees preview
        emp_stmt = select(User).where(User.organization_unit_id == unit_id).order_by(User.display_name.asc())
        emp_res = await db.execute(emp_stmt)
        employees = emp_res.scalars().all()

        manager_data = None
        if unit.manager:
            manager_data = {
                "id": str(unit.manager.id),
                "display_name": unit.manager.display_name,
                "email": unit.manager.email,
                "avatar_url": unit.manager.avatar_url,
                "job_title": unit.manager.job_title
            }

        return {
            "id": str(unit.id),
            "organization_id": str(unit.organization_id),
            "parent_id": str(unit.parent_id) if unit.parent_id else None,
            "parent_name": unit.parent.name if unit.parent else None,
            "name": unit.name,
            "code": unit.code,
            "unit_type": unit.unit_type,
            "description": unit.description,
            "manager_id": str(unit.manager_id) if unit.manager_id else None,
            "manager": manager_data,
            "status": unit.status,
            "order_index": unit.order_index,
            "direct_employee_count": direct_emp_count,
            "total_employee_count": total_emp_count,
            "children_count": children_count,
            "created_at": unit.created_at.isoformat(),
            "updated_at": unit.updated_at.isoformat(),
            "employees": [
                {
                    "id": str(e.id),
                    "display_name": e.display_name,
                    "email": e.email,
                    "avatar_url": e.avatar_url,
                    "job_title": e.job_title,
                    "department": e.department,
                    "is_active": e.is_active
                }
                for e in employees
            ]
        }

    @classmethod
    async def list_units(
        cls,
        db: AsyncSession,
        org_id: UUID,
        parent_id: Optional[UUID] = None,
        unit_type: Optional[str] = None,
        status_filter: Optional[str] = None,
        search: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        stmt = (
            select(OrganizationUnit)
            .options(selectinload(OrganizationUnit.manager))
            .where(
                OrganizationUnit.organization_id == org_id,
                OrganizationUnit.deleted_at.is_(None)
            )
        )

        if parent_id is not None:
            stmt = stmt.where(OrganizationUnit.parent_id == parent_id)
        if unit_type:
            stmt = stmt.where(func.upper(OrganizationUnit.unit_type) == unit_type.strip().upper())
        if status_filter:
            stmt = stmt.where(func.upper(OrganizationUnit.status) == status_filter.strip().upper())
        if search:
            pattern = f"%{search.strip().lower()}%"
            stmt = stmt.where(
                (func.lower(OrganizationUnit.name).ilike(pattern)) |
                (func.lower(OrganizationUnit.code).ilike(pattern)) |
                (func.lower(OrganizationUnit.description).ilike(pattern))
            )

        stmt = stmt.order_by(OrganizationUnit.order_index.asc(), OrganizationUnit.name.asc())
        res = await db.execute(stmt)
        units = res.scalars().all()

        # Fetch direct employee counts in one aggregation query
        emp_counts_stmt = (
            select(User.organization_unit_id, func.count(User.id))
            .where(User.organization_id == org_id, User.organization_unit_id.is_not(None))
            .group_by(User.organization_unit_id)
        )
        emp_res = await db.execute(emp_counts_stmt)
        direct_counts = {row[0]: row[1] for row in emp_res.all()}

        subtree_counts = await cls._compute_subtree_counts(db, org_id)

        output = []
        for u in units:
            m_data = None
            if u.manager:
                m_data = {
                    "id": str(u.manager.id),
                    "display_name": u.manager.display_name,
                    "email": u.manager.email,
                    "avatar_url": u.manager.avatar_url,
                    "job_title": u.manager.job_title
                }

            output.append({
                "id": str(u.id),
                "organization_id": str(u.organization_id),
                "parent_id": str(u.parent_id) if u.parent_id else None,
                "name": u.name,
                "code": u.code,
                "unit_type": u.unit_type,
                "description": u.description,
                "manager_id": str(u.manager_id) if u.manager_id else None,
                "manager": m_data,
                "status": u.status,
                "order_index": u.order_index,
                "direct_employee_count": direct_counts.get(u.id, 0),
                "total_employee_count": subtree_counts.get(u.id, direct_counts.get(u.id, 0)),
                "created_at": u.created_at.isoformat(),
                "updated_at": u.updated_at.isoformat()
            })

        return output

    @classmethod
    async def update_unit(
        cls,
        db: AsyncSession,
        org_id: UUID,
        actor_id: Optional[UUID],
        unit_id: UUID,
        payload: OrganizationUnitUpdate
    ) -> OrganizationUnit:
        stmt = select(OrganizationUnit).where(
            OrganizationUnit.id == unit_id,
            OrganizationUnit.organization_id == org_id,
            OrganizationUnit.deleted_at.is_(None)
        )
        res = await db.execute(stmt)
        unit = res.scalar_one_or_none()
        if not unit:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organizational unit not found")

        old_parent_id = unit.parent_id
        old_name = unit.name
        is_moved = False

        if payload.name is not None and payload.name.strip():
            unit.name = payload.name.strip()

        if payload.code is not None:
            clean_code = payload.code.strip().upper() if payload.code.strip() else None
            if clean_code != unit.code:
                await cls.validate_unique_code(db, org_id, clean_code, exclude_unit_id=unit_id)
                unit.code = clean_code

        if payload.unit_type is not None and payload.unit_type.strip():
            unit.unit_type = payload.unit_type.strip().upper()

        if payload.description is not None:
            unit.description = payload.description.strip() if payload.description else None

        if payload.clear_parent:
            if unit.parent_id is not None:
                is_moved = True
            unit.parent_id = None
        elif payload.parent_id is not None and payload.parent_id != unit.parent_id:
            await cls.validate_no_cycle(db, unit_id, payload.parent_id)
            await cls.validate_org_isolation(db, org_id, parent_id=payload.parent_id)
            unit.parent_id = payload.parent_id
            is_moved = True

        if payload.clear_manager:
            unit.manager_id = None
        elif payload.manager_id is not None and payload.manager_id != unit.manager_id:
            await cls.validate_org_isolation(db, org_id, manager_id=payload.manager_id)
            unit.manager_id = payload.manager_id

        if payload.status is not None and payload.status.strip():
            unit.status = payload.status.strip().upper()

        if payload.order_index is not None:
            unit.order_index = payload.order_index

        unit.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(unit)

        action = "ORG_UNIT_MOVED" if is_moved else "ORG_UNIT_UPDATED"
        details = (
            f"Moved unit '{unit.name}' from parent {old_parent_id} to {unit.parent_id}"
            if is_moved else f"Updated unit '{unit.name}'"
        )

        await log_audit(
            db=db,
            organization_id=str(org_id),
            actor_id=str(actor_id) if actor_id else None,
            action=action,
            resource_type="ORGANIZATION_UNIT",
            resource_id=str(unit.id),
            details=details
        )

        return unit

    @classmethod
    async def delete_unit(
        cls,
        db: AsyncSession,
        org_id: UUID,
        actor_id: Optional[UUID],
        unit_id: UUID
    ) -> Dict[str, Any]:
        stmt = select(OrganizationUnit).where(
            OrganizationUnit.id == unit_id,
            OrganizationUnit.organization_id == org_id,
            OrganizationUnit.deleted_at.is_(None)
        )
        res = await db.execute(stmt)
        unit = res.scalar_one_or_none()
        if not unit:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organizational unit not found")

        # Check safety rule (no children and no assigned employees)
        await cls.validate_safe_deletion(db, unit_id)

        unit_name = unit.name
        unit_code = unit.code

        # Soft delete
        unit.deleted_at = datetime.utcnow()
        unit.status = "INACTIVE"
        await db.commit()

        await log_audit(
            db=db,
            organization_id=str(org_id),
            actor_id=str(actor_id) if actor_id else None,
            action="ORG_UNIT_DELETED",
            resource_type="ORGANIZATION_UNIT",
            resource_id=str(unit_id),
            details=f"Deleted organizational unit '{unit_name}' (Code: {unit_code or 'None'})"
        )

        return {"status": "success", "message": f"Organizational unit '{unit_name}' deleted successfully."}

    @classmethod
    async def get_hierarchy_tree(
        cls,
        db: AsyncSession,
        org_id: UUID,
        status_filter: Optional[str] = "ACTIVE",
        include_employees: bool = True
    ) -> List[Dict[str, Any]]:
        """Fetch all units for organization in a single query and assemble into a nested tree."""
        stmt = (
            select(OrganizationUnit)
            .options(selectinload(OrganizationUnit.manager))
            .where(
                OrganizationUnit.organization_id == org_id,
                OrganizationUnit.deleted_at.is_(None)
            )
        )
        if status_filter:
            stmt = stmt.where(func.upper(OrganizationUnit.status) == status_filter.strip().upper())

        stmt = stmt.order_by(OrganizationUnit.order_index.asc(), OrganizationUnit.name.asc())
        res = await db.execute(stmt)
        units = res.scalars().all()

        # Direct employee list per unit
        emp_by_unit: Dict[UUID, List[Dict[str, Any]]] = {}
        if include_employees:
            emp_stmt = select(User).where(
                User.organization_id == org_id,
                User.organization_unit_id.is_not(None),
                User.is_active.is_(True)
            ).order_by(User.display_name.asc())
            emp_res = await db.execute(emp_stmt)
            for e in emp_res.scalars().all():
                if e.organization_unit_id not in emp_by_unit:
                    emp_by_unit[e.organization_unit_id] = []
                emp_by_unit[e.organization_unit_id].append({
                    "id": str(e.id),
                    "display_name": e.display_name,
                    "email": e.email,
                    "avatar_url": e.avatar_url,
                    "job_title": e.job_title,
                    "department": e.department,
                    "is_active": e.is_active
                })

        # Build node map
        node_map: Dict[UUID, Dict[str, Any]] = {}
        for u in units:
            m_data = None
            if u.manager:
                m_data = {
                    "id": str(u.manager.id),
                    "display_name": u.manager.display_name,
                    "email": u.manager.email,
                    "avatar_url": u.manager.avatar_url,
                    "job_title": u.manager.job_title
                }

            direct_emps = emp_by_unit.get(u.id, [])
            node_map[u.id] = {
                "id": str(u.id),
                "organization_id": str(u.organization_id),
                "parent_id": str(u.parent_id) if u.parent_id else None,
                "name": u.name,
                "code": u.code,
                "unit_type": u.unit_type,
                "description": u.description,
                "manager_id": str(u.manager_id) if u.manager_id else None,
                "manager": m_data,
                "status": u.status,
                "order_index": u.order_index,
                "direct_employee_count": len(direct_emps),
                "total_employee_count": len(direct_emps),
                "children": [],
                "employees": direct_emps if include_employees else []
            }

        # Build tree and compute subtree counts
        roots: List[Dict[str, Any]] = []
        for u in units:
            node = node_map[u.id]
            if u.parent_id and u.parent_id in node_map:
                node_map[u.parent_id]["children"].append(node)
            else:
                roots.append(node)

        # Recursive post-order traversal to calculate total_employee_count
        def calculate_totals(node: Dict[str, Any]) -> int:
            total = node["direct_employee_count"]
            for child in node["children"]:
                total += calculate_totals(child)
            node["total_employee_count"] = total
            return total

        for r in roots:
            calculate_totals(r)

        return roots

    @classmethod
    async def assign_employee(
        cls,
        db: AsyncSession,
        org_id: UUID,
        actor_id: Optional[UUID],
        user_id: UUID,
        unit_id: Optional[UUID]
    ) -> Dict[str, Any]:
        """Assign or reassign an employee to an organizational unit."""
        user_res = await db.execute(select(User).where(User.id == user_id, User.organization_id == org_id))
        user = user_res.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found in your organization")

        unit_name = "None"
        if unit_id:
            u_res = await db.execute(select(OrganizationUnit).where(
                OrganizationUnit.id == unit_id,
                OrganizationUnit.organization_id == org_id,
                OrganizationUnit.deleted_at.is_(None)
            ))
            unit = u_res.scalar_one_or_none()
            if not unit:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target organizational unit not found")
            user.organization_unit_id = unit.id
            user.department = unit.name  # Keep in sync for backward compatibility
            unit_name = unit.name
            action = "EMPLOYEE_ASSIGNED_UNIT"
            details = f"Assigned employee '{user.display_name}' to unit '{unit.name}'"
        else:
            user.organization_unit_id = None
            action = "EMPLOYEE_REMOVED_UNIT"
            details = f"Removed employee '{user.display_name}' from organizational unit"

        await db.commit()
        await db.refresh(user)

        await log_audit(
            db=db,
            organization_id=str(org_id),
            actor_id=str(actor_id) if actor_id else None,
            action=action,
            resource_type="USER",
            resource_id=str(user.id),
            details=details
        )

        return {
            "status": "success",
            "user_id": str(user.id),
            "display_name": user.display_name,
            "organization_unit_id": str(user.organization_unit_id) if user.organization_unit_id else None,
            "organization_unit_name": unit_name if unit_id else None,
            "department": user.department
        }

    @classmethod
    async def bulk_assign(
        cls,
        db: AsyncSession,
        org_id: UUID,
        actor_id: Optional[UUID],
        assignments: List[BulkAssignItem]
    ) -> Dict[str, Any]:
        """Bulk assign employees from CSV or array payload."""
        success_count = 0
        errors = []

        for idx, item in enumerate(assignments):
            try:
                # Find user
                user = None
                if item.user_id:
                    user = (await db.execute(select(User).where(User.id == item.user_id, User.organization_id == org_id))).scalar_one_or_none()
                elif item.email:
                    user = (await db.execute(select(User).where(func.lower(User.email) == item.email.strip().lower(), User.organization_id == org_id))).scalar_one_or_none()

                if not user:
                    errors.append(f"Row {idx+1}: User '{item.email or item.user_id}' not found.")
                    continue

                # Find unit
                unit = None
                if item.unit_id:
                    unit = (await db.execute(select(OrganizationUnit).where(OrganizationUnit.id == item.unit_id, OrganizationUnit.organization_id == org_id))).scalar_one_or_none()
                elif item.unit_code:
                    unit = (await db.execute(select(OrganizationUnit).where(func.lower(OrganizationUnit.code) == item.unit_code.strip().lower(), OrganizationUnit.organization_id == org_id))).scalar_one_or_none()

                if not unit and (item.unit_id or item.unit_code):
                    errors.append(f"Row {idx+1}: Unit '{item.unit_code or item.unit_id}' not found.")
                    continue

                user.organization_unit_id = unit.id if unit else None
                if unit:
                    user.department = unit.name

                success_count += 1
            except Exception as e:
                errors.append(f"Row {idx+1}: Error assigning ({str(e)})")

        await db.commit()

        await log_audit(
            db=db,
            organization_id=str(org_id),
            actor_id=str(actor_id) if actor_id else None,
            action="EMPLOYEES_BULK_ASSIGNED",
            resource_type="ORGANIZATION_UNIT",
            resource_id=None,
            details=f"Bulk assigned {success_count} employees ({len(errors)} errors)"
        )

        return {
            "status": "success",
            "assigned_count": success_count,
            "errors": errors
        }

    @staticmethod
    async def _compute_subtree_counts(db: AsyncSession, org_id: UUID) -> Dict[UUID, int]:
        """Helper to calculate cumulative employee count for all nodes in the organization."""
        units_res = await db.execute(
            select(OrganizationUnit.id, OrganizationUnit.parent_id).where(
                OrganizationUnit.organization_id == org_id,
                OrganizationUnit.deleted_at.is_(None)
            )
        )
        unit_parents = {row[0]: row[1] for row in units_res.all()}

        emp_counts_stmt = (
            select(User.organization_unit_id, func.count(User.id))
            .where(User.organization_id == org_id, User.organization_unit_id.is_not(None))
            .group_by(User.organization_unit_id)
        )
        emp_counts = {row[0]: row[1] for row in (await db.execute(emp_counts_stmt)).all()}

        children_map: Dict[UUID, List[UUID]] = {u_id: [] for u_id in unit_parents}
        for u_id, p_id in unit_parents.items():
            if p_id and p_id in children_map:
                children_map[p_id].append(u_id)

        subtree_totals: Dict[UUID, int] = {}

        def get_count(u_id: UUID) -> int:
            if u_id in subtree_totals:
                return subtree_totals[u_id]
            cnt = emp_counts.get(u_id, 0)
            for child_id in children_map.get(u_id, []):
                cnt += get_count(child_id)
            subtree_totals[u_id] = cnt
            return cnt

        for u_id in unit_parents:
            get_count(u_id)

        return subtree_totals
