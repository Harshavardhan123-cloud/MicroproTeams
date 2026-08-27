from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from app.models.models import TeamPrivacy, MemberRole, ChannelType

class TeamBase(BaseModel):
    name: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    privacy: TeamPrivacy = TeamPrivacy.PUBLIC

class TeamCreate(TeamBase):
    pass

class TeamMemberResponse(BaseModel):
    id: UUID
    team_id: UUID
    user_id: UUID
    role: MemberRole
    joined_at: datetime
    user_display_name: Optional[str] = None
    user_email: Optional[str] = None
    user_avatar: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class ChannelResponse(BaseModel):
    id: UUID
    team_id: UUID
    name: str
    description: Optional[str] = None
    type: ChannelType
    created_by: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TeamResponse(TeamBase):
    id: UUID
    organization_id: UUID
    owner_id: UUID
    created_at: datetime
    channels: List[ChannelResponse] = []
    member_count: int = 0

    model_config = ConfigDict(from_attributes=True)

class ChannelCreate(BaseModel):
    name: str
    description: Optional[str] = None
    type: ChannelType = ChannelType.STANDARD
