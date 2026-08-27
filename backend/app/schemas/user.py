from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.models import PresenceStatus

class UserBase(BaseModel):
    email: EmailStr
    username: str
    first_name: str
    last_name: str
    display_name: str
    avatar_url: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    timezone: str = "UTC"
    phone: Optional[str] = None
    presence: PresenceStatus = PresenceStatus.OFFLINE
    status_message: Optional[str] = None

class UserCreate(UserBase):
    organization_id: UUID
    password: str

class UserPresenceUpdate(BaseModel):
    presence: PresenceStatus
    status_message: Optional[str] = None

class UserResponse(UserBase):
    id: UUID
    organization_id: UUID
    is_active: bool
    is_superuser: bool
    last_seen: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
