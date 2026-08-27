import uuid
import secrets
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.models.models import (
    Meeting, MeetingParticipant, MeetingPolicy, CallHistory, User, Notification,
    MeetingType, MeetingStatus, ParticipantRole, ParticipantStatus, CallType, CallStatus
)

def generate_meeting_code() -> str:
    """Generate secure non-sequential meeting code e.g. meet-a1b2-c3d4."""
    part1 = secrets.token_hex(2)
    part2 = secrets.token_hex(2)
    return f"meet-{part1}-{part2}"

class MeetingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def format_meeting(self, m: Meeting, policy: Optional[MeetingPolicy] = None) -> dict:
        participants_list = m.__dict__.get("participants", [])
        status_str = m.status.value.lower() if hasattr(m.status, 'value') else str(m.status).lower()
        return {
            "id": str(m.id),
            "organization_id": str(m.organization_id),
            "created_by": str(m.created_by),
            "host_id": str(m.host_id),
            "title": m.title,
            "description": m.description,
            "meeting_type": m.meeting_type,
            "status": status_str,
            "meeting_code": m.meeting_code,
            "join_policy": m.join_policy,
            "lobby_enabled": m.lobby_enabled,
            "is_scheduled": m.is_scheduled,
            "scheduled_start": m.scheduled_start.isoformat() if m.scheduled_start else None,
            "scheduled_end": m.scheduled_end.isoformat() if m.scheduled_end else None,
            "actual_start": m.actual_start.isoformat() if m.actual_start else None,
            "actual_end": m.actual_end.isoformat() if m.actual_end else None,
            "meeting_link": m.meeting_link or f"/meet/{m.meeting_code}",
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "participant_count": len(participants_list),
            "participants": [
                {
                    "id": str(p.id),
                    "user_id": str(p.user_id),
                    "role": p.role,
                    "status": p.status,
                    "is_muted": p.is_muted or p.audio_muted,
                    "joined_at": p.joined_at.isoformat() if p.joined_at else None
                }
                for p in participants_list
            ],
            "policy": {
                "allow_guests": policy.allow_guests if policy else True,
                "allow_lobby": policy.allow_lobby if policy else m.lobby_enabled,
                "allow_screen_share": policy.allow_screen_share if policy else True,
                "allow_chat": policy.allow_chat if policy else True,
                "allow_reactions": policy.allow_reactions if policy else True,
                "max_participants": policy.max_participants if policy else 100
            } if policy else None
        }

    async def create_meeting(
        self,
        user: User,
        title: str,
        meeting_type: MeetingType = MeetingType.INSTANT,
        description: Optional[str] = None,
        lobby_enabled: bool = False,
        is_scheduled: bool = False,
        scheduled_start: Optional[datetime] = None,
        scheduled_end: Optional[datetime] = None
    ) -> dict:
        code = generate_meeting_code()
        m = Meeting(
            organization_id=user.organization_id,
            created_by=user.id,
            host_id=user.id,
            title=title,
            description=description,
            meeting_type=meeting_type,
            status=MeetingStatus.ACTIVE if not is_scheduled else MeetingStatus.SCHEDULED,
            meeting_code=code,
            lobby_enabled=lobby_enabled,
            is_scheduled=is_scheduled,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            meeting_link=f"/meet/{code}"
        )
        self.db.add(m)
        await self.db.commit()
        await self.db.refresh(m)

        # Create host participant record
        host_part = MeetingParticipant(
            meeting_id=m.id,
            user_id=user.id,
            role=ParticipantRole.HOST,
            status=ParticipantStatus.JOINED,
            is_host=True,
            is_cohost=False
        )
        self.db.add(host_part)

        # Create meeting policy record
        policy = MeetingPolicy(
            meeting_id=m.id,
            allow_lobby=lobby_enabled
        )
        self.db.add(policy)

        await self.db.commit()
        return self.format_meeting(m, policy)

    async def get_by_code(self, code: str) -> Optional[Meeting]:
        res = await self.db.execute(
            select(Meeting)
            .options(selectinload(Meeting.participants), selectinload(Meeting.policy))
            .where(Meeting.meeting_code == code)
        )
        return res.scalars().first()

    async def get_by_id(self, meeting_id: str) -> Optional[Meeting]:
        res = await self.db.execute(
            select(Meeting)
            .options(selectinload(Meeting.participants), selectinload(Meeting.policy))
            .where(Meeting.id == meeting_id)
        )
        return res.scalars().first()

    async def join_meeting(self, meeting_id: str, user: User) -> dict:
        m = await self.get_by_id(meeting_id)
        if not m or m.status == MeetingStatus.ENDED:
            raise ValueError("Meeting not found or already ended")
        if str(m.organization_id) != str(user.organization_id):
            raise ValueError("Meeting not found or already ended")

        # Check existing participant record
        part_res = await self.db.execute(
            select(MeetingParticipant).where(
                MeetingParticipant.meeting_id == m.id,
                MeetingParticipant.user_id == user.id
            )
        )
        part = part_res.scalars().first()

        target_status = ParticipantStatus.WAITING if (m.lobby_enabled and str(user.id) != str(m.host_id)) else ParticipantStatus.JOINED

        if not part:
            is_host = str(user.id) == str(m.host_id)
            part = MeetingParticipant(
                meeting_id=m.id,
                user_id=user.id,
                role=ParticipantRole.HOST if is_host else ParticipantRole.ATTENDEE,
                status=ParticipantStatus.JOINED if is_host else target_status,
                is_host=is_host
            )
            self.db.add(part)
        else:
            if part.status == ParticipantStatus.REJECTED:
                raise ValueError("Participant entry was rejected by host")
            part.status = ParticipantStatus.JOINED if str(user.id) == str(m.host_id) else target_status

        await self.db.commit()

        return {
            "meeting": self.format_meeting(m, m.policy),
            "participant_status": part.status,
            "role": part.role,
            "is_in_lobby": part.status == ParticipantStatus.WAITING
        }

    async def admit_participant(self, meeting_id: str, participant_user_id: str, host_user: User) -> bool:
        m = await self.get_by_id(meeting_id)
        if not m or str(m.host_id) != str(host_user.id):
            return False

        res = await self.db.execute(
            select(MeetingParticipant).where(
                MeetingParticipant.meeting_id == meeting_id,
                MeetingParticipant.user_id == participant_user_id
            )
        )
        part = res.scalars().first()
        if not part:
            return False

        part.status = ParticipantStatus.ADMITTED
        await self.db.commit()
        return True

    async def remove_participant(self, meeting_id: str, participant_user_id: str, host_user: User) -> bool:
        m = await self.get_by_id(meeting_id)
        if not m or str(m.host_id) != str(host_user.id):
            return False

        res = await self.db.execute(
            select(MeetingParticipant).where(
                MeetingParticipant.meeting_id == meeting_id,
                MeetingParticipant.user_id == participant_user_id
            )
        )
        part = res.scalars().first()
        if not part:
            return False

        part.status = ParticipantStatus.REJECTED
        part.left_at = datetime.utcnow()
        await self.db.commit()
        return True

    async def mute_participant(self, meeting_id: str, participant_user_id: str, host_user: User) -> bool:
        m = await self.get_by_id(meeting_id)
        if not m or str(m.host_id) != str(host_user.id):
            return False

        res = await self.db.execute(
            select(MeetingParticipant).where(
                MeetingParticipant.meeting_id == meeting_id,
                MeetingParticipant.user_id == participant_user_id
            )
        )
        part = res.scalars().first()
        if not part:
            return False

        part.audio_muted = True
        part.is_muted = True
        await self.db.commit()
        return True

    async def end_meeting(self, meeting_id: str, host_user: User) -> bool:
        m = await self.get_by_id(meeting_id)
        if not m or str(m.host_id) != str(host_user.id):
            return False

        m.status = MeetingStatus.ENDED
        m.ended_at = datetime.utcnow()
        m.actual_end = datetime.utcnow()
        await self.db.commit()
        return True

    async def leave_meeting(self, meeting_id: str, user: User) -> bool:
        res = await self.db.execute(
            select(MeetingParticipant).where(
                MeetingParticipant.meeting_id == meeting_id,
                MeetingParticipant.user_id == user.id
            )
        )
        part = res.scalars().first()
        if part:
            part.status = ParticipantStatus.LEFT
            part.left_at = datetime.utcnow()
            await self.db.commit()
        return True

    async def initiate_call(self, caller: User, callee_id: str, call_type: CallType = CallType.VIDEO) -> dict:
        m_dict = await self.create_meeting(
            user=caller,
            title=f"Call with {caller.display_name}",
            meeting_type=MeetingType.DIRECT_CALL
        )
        call = CallHistory(
            organization_id=caller.organization_id,
            meeting_id=m_dict["id"],
            caller_id=caller.id,
            callee_id=callee_id,
            call_type=call_type,
            status=CallStatus.CALLING
        )
        self.db.add(call)

        # Create persistent notification for callee
        notif = Notification(
            organization_id=caller.organization_id,
            user_id=callee_id,
            type="incoming_call",
            title=f"Incoming {call_type.value.capitalize()} Call",
            body=f"{caller.display_name} is calling you.",
            resource_type="call",
            resource_id=m_dict["id"]
        )
        self.db.add(notif)

        await self.db.commit()
        await self.db.refresh(call)

        return {
            "call_id": str(call.id),
            "meeting_id": m_dict["id"],
            "meeting_code": m_dict["meeting_code"],
            "status": call.status,
            "caller_id": str(caller.id),
            "callee_id": str(callee_id)
        }
