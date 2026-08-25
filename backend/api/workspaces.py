"""
Workspaces API — create, list, invite members.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from core.database import get_db
from core.dependencies import CurrentUser
from models.workspace import Workspace

router = APIRouter()


class WorkspaceCreateRequest(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    primary_color: str = "#6366f1"


class WorkspaceResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    name: str
    slug: str
    description: Optional[str]
    logo_url: Optional[str]
    primary_color: str
    created_at: datetime


@router.post("/", response_model=WorkspaceResponse, status_code=201)
async def create_workspace(payload: WorkspaceCreateRequest, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Workspace).where(Workspace.slug == payload.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Slug already taken")

    ws = Workspace(
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        primary_color=payload.primary_color,
    )
    db.add(ws)
    await db.flush()

    # Auto-create default #general channel
    from models.workspace import Channel, ChannelMember, ChannelType
    general_channel = Channel(
        workspace_id=ws.id,
        name="general",
        description="General discussion channel",
        type=ChannelType.PUBLIC.value,
        created_by=current_user.id,
    )
    db.add(general_channel)
    await db.flush()
    db.add(ChannelMember(channel_id=general_channel.id, user_id=current_user.id, role="owner"))

    await db.refresh(ws)
    return WorkspaceResponse.model_validate(ws)


@router.get("/", response_model=List[WorkspaceResponse])
async def list_workspaces(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workspace).limit(10))
    return [WorkspaceResponse.model_validate(w) for w in result.scalars().all()]


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(workspace_id: str, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    ws = await db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(404, "Workspace not found")
    return WorkspaceResponse.model_validate(ws)
