from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Any
from datetime import datetime
from uuid import UUID

class ManagerSummary(BaseModel):
    id: UUID
    display_name: str
    email: str
    avatar_url: Optional[str] = None
    job_title: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class EmployeeSummary(BaseModel):
    id: UUID
    display_name: str
    email: str
    avatar_url: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)

class OrganizationUnitBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: Optional[str] = Field(None, max_length=50)
    unit_type: str = Field("DEPARTMENT", max_length=50)
    description: Optional[str] = None
    status: str = Field("ACTIVE", max_length=20)
    order_index: int = 0

class OrganizationUnitCreate(OrganizationUnitBase):
    parent_id: Optional[UUID] = None
    manager_id: Optional[UUID] = None

class OrganizationUnitUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    code: Optional[str] = Field(None, max_length=50)
    unit_type: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    parent_id: Optional[UUID] = None
    clear_parent: Optional[bool] = False  # Set True to detach from parent and make root
    manager_id: Optional[UUID] = None
    clear_manager: Optional[bool] = False  # Set True to remove manager
    status: Optional[str] = Field(None, max_length=20)
    order_index: Optional[int] = None

class OrganizationUnitResponse(OrganizationUnitBase):
    id: UUID
    organization_id: UUID
    parent_id: Optional[UUID] = None
    manager_id: Optional[UUID] = None
    manager: Optional[ManagerSummary] = None
    direct_employee_count: int = 0
    total_employee_count: int = 0
    children_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class HierarchyTreeNode(BaseModel):
    id: UUID
    organization_id: UUID
    parent_id: Optional[UUID] = None
    name: str
    code: Optional[str] = None
    unit_type: str
    description: Optional[str] = None
    manager_id: Optional[UUID] = None
    manager: Optional[ManagerSummary] = None
    status: str
    order_index: int = 0
    direct_employee_count: int = 0
    total_employee_count: int = 0
    children: List["HierarchyTreeNode"] = []
    employees: Optional[List[EmployeeSummary]] = []

    model_config = ConfigDict(from_attributes=True)

class AssignEmployeeRequest(BaseModel):
    user_id: UUID

class BulkAssignItem(BaseModel):
    user_id: Optional[UUID] = None
    email: Optional[str] = None
    unit_id: Optional[UUID] = None
    unit_code: Optional[str] = None

class BulkAssignRequest(BaseModel):
    assignments: List[BulkAssignItem]
