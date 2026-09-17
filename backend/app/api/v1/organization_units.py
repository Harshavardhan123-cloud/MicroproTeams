from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import User
from app.schemas.organization_unit import (
    OrganizationUnitCreate, OrganizationUnitUpdate,
    OrganizationUnitResponse, HierarchyTreeNode,
    AssignEmployeeRequest, BulkAssignRequest
)
from app.services.organization_unit_service import OrganizationUnitService
from app.core.response import success_response, error_response

router = APIRouter(prefix="/organization-units", tags=["Organization Units & Hierarchy"])

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Authorize only Super Admins and Organization Admins for modifications."""
    if current_user.is_superuser:
        return current_user
    try:
        user_role = current_user.role.name.upper() if current_user.role else "USER"
    except Exception:
        user_role = "USER"

    if user_role in ["SUPER_ADMIN", "ORG_ADMIN", "ADMIN"]:
        return current_user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Administrative privileges required to modify organization units."
    )

@router.get("/hierarchy")
async def get_organization_hierarchy(
    status: Optional[str] = "ACTIVE",
    include_employees: bool = True,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve full organization hierarchy tree with direct and cumulative employee counts."""
    tree = await OrganizationUnitService.get_hierarchy_tree(
        db=db,
        org_id=current_user.organization_id,
        status_filter=status,
        include_employees=include_employees
    )
    return success_response(tree)

@router.get("")
@router.get("/")
async def list_organization_units(
    parent_id: Optional[UUID] = None,
    unit_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List organizational units with optional filters."""
    units = await OrganizationUnitService.list_units(
        db=db,
        org_id=current_user.organization_id,
        parent_id=parent_id,
        unit_type=unit_type,
        status_filter=status,
        search=search
    )
    return success_response(units)

@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_organization_unit(
    payload: OrganizationUnitCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create a new organizational unit."""
    unit = await OrganizationUnitService.create_unit(
        db=db,
        org_id=current_user.organization_id,
        actor_id=current_user.id,
        payload=payload
    )
    # Return detailed response
    details = await OrganizationUnitService.get_unit(db, current_user.organization_id, unit.id)
    return success_response(details, status_code=status.HTTP_201_CREATED)

@router.get("/{unit_id}")
async def get_organization_unit(
    unit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get single organizational unit details with direct children and assigned employees."""
    unit_data = await OrganizationUnitService.get_unit(
        db=db,
        org_id=current_user.organization_id,
        unit_id=unit_id
    )
    return success_response(unit_data)

@router.patch("/{unit_id}")
@router.put("/{unit_id}")
async def update_organization_unit(
    unit_id: UUID,
    payload: OrganizationUnitUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update organizational unit details, parent, manager, or status."""
    await OrganizationUnitService.update_unit(
        db=db,
        org_id=current_user.organization_id,
        actor_id=current_user.id,
        unit_id=unit_id,
        payload=payload
    )
    details = await OrganizationUnitService.get_unit(db, current_user.organization_id, unit_id)
    return success_response(details)

@router.delete("/{unit_id}")
async def delete_organization_unit(
    unit_id: UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Safely delete an organizational unit (fails if it contains children or employees)."""
    res = await OrganizationUnitService.delete_unit(
        db=db,
        org_id=current_user.organization_id,
        actor_id=current_user.id,
        unit_id=unit_id
    )
    return success_response(res)

@router.post("/{unit_id}/assign-employee")
async def assign_employee_to_unit(
    unit_id: UUID,
    payload: AssignEmployeeRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Assign an employee to the specified organizational unit."""
    res = await OrganizationUnitService.assign_employee(
        db=db,
        org_id=current_user.organization_id,
        actor_id=current_user.id,
        user_id=payload.user_id,
        unit_id=unit_id
    )
    return success_response(res)

@router.post("/{unit_id}/remove-employee")
async def remove_employee_from_unit(
    unit_id: UUID,
    payload: AssignEmployeeRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Remove an employee from the specified organizational unit."""
    res = await OrganizationUnitService.assign_employee(
        db=db,
        org_id=current_user.organization_id,
        actor_id=current_user.id,
        user_id=payload.user_id,
        unit_id=None
    )
    return success_response(res)

@router.post("/bulk-assign")
async def bulk_assign_employees(
    payload: BulkAssignRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Bulk assign employees to organizational units."""
    res = await OrganizationUnitService.bulk_assign(
        db=db,
        org_id=current_user.organization_id,
        actor_id=current_user.id,
        assignments=payload.assignments
    )
    return success_response(res)

# Also provide an alias router for GET /organization/hierarchy
alias_router = APIRouter(prefix="/organization", tags=["Organization Hierarchy"])

@alias_router.get("/hierarchy")
async def get_org_hierarchy_alias(
    status: Optional[str] = "ACTIVE",
    include_employees: bool = True,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Alias for /organization-units/hierarchy."""
    tree = await OrganizationUnitService.get_hierarchy_tree(
        db=db,
        org_id=current_user.organization_id,
        status_filter=status,
        include_employees=include_employees
    )
    return success_response(tree)
