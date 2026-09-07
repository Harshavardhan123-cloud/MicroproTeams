import uuid
import json
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.v1.auth import get_current_user
from app.models.models import User, MeetingSummary, MeetingActionItem, ActionItemStatus
from app.services.meeting_ai_service import MeetingAIService

router = APIRouter(tags=["Meeting AI"])

class AskAIRequest(BaseModel):
    question: str

class UpdateActionItemRequest(BaseModel):
    status: Optional[ActionItemStatus] = None
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None

@router.get("/meetings/{meeting_id}/summary")
async def get_meeting_summary(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(MeetingSummary).where(MeetingSummary.meeting_id == uuid.UUID(meeting_id))
    res = await db.execute(stmt)
    ms = res.scalar_one_or_none()

    if not ms:
        # Generate summary if missing
        try:
            ms = await MeetingAIService.process_meeting_ai(db, meeting_id=meeting_id)
        except Exception as e:
            return {
                "meeting_id": meeting_id,
                "summary": "Summary generation failed or transcript unavailable.",
                "key_points": [],
                "decisions": [],
                "action_items": [],
                "questions": [],
                "topics": [],
                "risks": []
            }

    return {
        "id": str(ms.id),
        "meeting_id": str(ms.meeting_id),
        "summary": ms.summary,
        "key_points": json.loads(ms.key_points) if ms.key_points else [],
        "decisions": json.loads(ms.decisions) if ms.decisions else [],
        "action_items": json.loads(ms.action_items) if ms.action_items else [],
        "questions": json.loads(ms.questions) if ms.questions else [],
        "topics": json.loads(ms.topics) if ms.topics else [],
        "risks": json.loads(ms.risks) if ms.risks else [],
        "model": ms.model,
        "created_at": ms.created_at.isoformat()
    }

@router.post("/meetings/{meeting_id}/ai/ask")
async def ask_meeting_ai(
    meeting_id: str,
    body: AskAIRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        res = await MeetingAIService.ask_assistant(
            db, meeting_id=meeting_id, question=body.question, user_id=str(current_user.id)
        )
        return res
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.get("/meetings/{meeting_id}/action-items")
async def get_meeting_action_items(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(MeetingActionItem).where(MeetingActionItem.meeting_id == uuid.UUID(meeting_id))
    res = await db.execute(stmt)
    items = res.scalars().all()
    return [
        {
            "id": str(item.id),
            "meeting_id": str(item.meeting_id),
            "description": item.description,
            "assignee_id": str(item.assignee_id) if item.assignee_id else None,
            "due_date": item.due_date,
            "priority": item.priority,
            "status": item.status.value,
            "created_at": item.created_at.isoformat()
        }
        for item in items
    ]

@router.patch("/meeting-action-items/{action_item_id}")
async def update_action_item(
    action_item_id: str,
    body: UpdateActionItemRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(MeetingActionItem).where(MeetingActionItem.id == uuid.UUID(action_item_id))
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action item not found")

    if body.status:
        item.status = body.status
    if body.assignee_id:
        item.assignee_id = uuid.UUID(body.assignee_id)
    if body.due_date:
        item.due_date = body.due_date
    if body.priority:
        item.priority = body.priority

    await db.commit()
    await db.refresh(item)
    return {
        "id": str(item.id),
        "status": item.status.value,
        "updated_at": item.updated_at.isoformat()
    }

from fastapi import UploadFile, File
import tempfile
import os
from app.services.transcription_service import TranscriptionService

@router.post("/speech-intelligence/transcribe")
async def transcribe_audio_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Directly transcribes an uploaded audio file using the Speech Intelligence API (http://192.168.1.199:8080)."""
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"speech_{uuid.uuid4()}_{file.filename}")

    try:
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)

        engine = TranscriptionService()
        full_text, segments = await engine.transcribe(temp_path)

        return {
            "status": "success",
            "filename": file.filename,
            "full_text": full_text,
            "speaker_segments": segments
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

