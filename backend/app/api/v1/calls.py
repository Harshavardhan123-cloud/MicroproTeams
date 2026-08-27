from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from sqlalchemy.future import select

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import User, CallHistory, CallType, CallStatus
from app.services.meeting_service import MeetingService
from app.core.response import success_response, error_response

router = APIRouter(prefix="/calls", tags=["Calls"])

class InitiateCallRequest(BaseModel):
    callee_id: str
    call_type: CallType = CallType.VIDEO

@router.post("")
async def initiate_call(
    req: InitiateCallRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    svc = MeetingService(db)
    res = await svc.initiate_call(caller=current_user, callee_id=req.callee_id, call_type=req.call_type)
    return success_response(res)

@router.get("/history")
async def get_call_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(CallHistory).where(
            (CallHistory.caller_id == current_user.id) | (CallHistory.callee_id == current_user.id)
        ).order_by(CallHistory.started_at.desc())
    )
    calls = res.scalars().all()
    data = [
        {
            "id": str(c.id),
            "meeting_id": str(c.meeting_id) if c.meeting_id else None,
            "caller_id": str(c.caller_id),
            "callee_id": str(c.callee_id),
            "call_type": c.call_type,
            "status": c.status,
            "duration": c.duration,
            "started_at": c.started_at.isoformat() if c.started_at else None,
            "ended_at": c.ended_at.isoformat() if c.ended_at else None
        }
        for c in calls
    ]
    return success_response(data)
