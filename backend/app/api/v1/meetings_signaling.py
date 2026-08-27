import json
import uuid
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, status
from sqlalchemy.future import select

from app.core.security import decode_token
from app.core.database import AsyncSessionLocal
from app.models.models import User, Meeting, MeetingParticipant, ParticipantStatus
from app.services.sfu.mediasoup_service import sfu_service
from app.core.redis import get_redis

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/meetings", tags=["Meeting Signaling"])

class MeetingConnectionManager:
    def __init__(self):
        # meeting_id -> dict of participant_id -> WebSocket
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, meeting_id: str, participant_id: str, websocket: WebSocket):
        await websocket.accept()
        if meeting_id not in self.rooms:
            self.rooms[meeting_id] = {}
        self.rooms[meeting_id][participant_id] = websocket

    def disconnect(self, meeting_id: str, participant_id: str):
        if meeting_id in self.rooms and participant_id in self.rooms[meeting_id]:
            del self.rooms[meeting_id][participant_id]
            if not self.rooms[meeting_id]:
                del self.rooms[meeting_id]

    async def broadcast(self, meeting_id: str, event: dict, exclude_participant: Optional[str] = None):
        if meeting_id in self.rooms:
            payload = json.dumps(event)
            for p_id, ws in list(self.rooms[meeting_id].items()):
                if exclude_participant and p_id == exclude_participant:
                    continue
                try:
                    await ws.send_text(payload)
                except Exception as e:
                    logger.error(f"Error broadcasting to {p_id}: {e}")

meeting_ws_manager = MeetingConnectionManager()

@router.websocket("/{meeting_id}/signaling")
async def meeting_signaling_websocket(
    websocket: WebSocket,
    meeting_id: str,
    token: Optional[str] = Query(None)
):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    payload = decode_token(token)
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    participant_id = str(user_id)

    # Verify the meeting exists, belongs to the caller's org, and that they've
    # actually been admitted (via POST /meetings/{id}/join, which enforces the
    # host's lobby/waiting-room policy) before granting real SFU media access.
    # Without this, anyone with a valid token could join any org's live call
    # just by knowing its meeting_id, bypassing the waiting room entirely.
    async with AsyncSessionLocal() as db:
        m_res = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
        meeting = m_res.scalars().first()
        if not meeting:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        u_res = await db.execute(select(User).where(User.id == user_id))
        signaling_user = u_res.scalars().first()
        if not signaling_user or str(signaling_user.organization_id) != str(meeting.organization_id):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        p_res = await db.execute(
            select(MeetingParticipant).where(
                MeetingParticipant.meeting_id == meeting_id,
                MeetingParticipant.user_id == user_id
            )
        )
        participant = p_res.scalars().first()

    if not participant or participant.status == ParticipantStatus.REJECTED:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if participant.status not in (ParticipantStatus.JOINED, ParticipantStatus.ADMITTED):
        # Still in the lobby: accept just long enough to say so, grant no SFU
        # access. The client should poll GET /meetings/{id}/state and retry
        # the signaling connection once the host admits them.
        await websocket.accept()
        await websocket.send_json({
            "event_id": uuid.uuid4().hex,
            "type": "lobby.waiting",
            "meeting_id": meeting_id,
            "payload": {"message": "Waiting for the host to admit you."}
        })
        await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)
        return

    await meeting_ws_manager.connect(meeting_id, participant_id, websocket)

    # Register in SFU
    await sfu_service.join_room(meeting_id, participant_id)

    # Notify room of join
    join_event = {
        "event_id": uuid.uuid4().hex,
        "type": "participant.joined",
        "meeting_id": meeting_id,
        "payload": {"participant_id": participant_id, "user_id": user_id}
    }
    await meeting_ws_manager.broadcast(meeting_id, join_event, exclude_participant=participant_id)

    try:
        while True:
            data_str = await websocket.receive_text()
            msg = json.loads(data_str)
            msg_type = msg.get("type")
            req_id = msg.get("request_id", uuid.uuid4().hex)
            payload_data = msg.get("payload", {})

            if msg_type == "transport.create":
                direction = payload_data.get("direction", "send")
                transport_info = await sfu_service.create_transport(meeting_id, participant_id, direction)
                await websocket.send_json({
                    "event_id": uuid.uuid4().hex,
                    "type": "transport.created",
                    "request_id": req_id,
                    "payload": transport_info
                })

            elif msg_type == "transport.connect":
                t_id = payload_data.get("transport_id")
                dtls = payload_data.get("dtls_parameters", {})
                ok = await sfu_service.connect_transport(meeting_id, participant_id, t_id, dtls)
                await websocket.send_json({
                    "event_id": uuid.uuid4().hex,
                    "type": "transport.connected",
                    "request_id": req_id,
                    "payload": {"success": ok}
                })

            elif msg_type == "producer.create":
                t_id = payload_data.get("transport_id")
                kind = payload_data.get("kind", "audio")
                rtp = payload_data.get("rtp_parameters", {})
                prod = await sfu_service.produce(meeting_id, participant_id, t_id, kind, rtp)
                
                await websocket.send_json({
                    "event_id": uuid.uuid4().hex,
                    "type": "producer.created",
                    "request_id": req_id,
                    "payload": prod
                })

                # Broadcast new producer to room
                await meeting_ws_manager.broadcast(meeting_id, {
                    "event_id": uuid.uuid4().hex,
                    "type": "producer.announced",
                    "meeting_id": meeting_id,
                    "payload": {"participant_id": participant_id, "producer": prod}
                }, exclude_participant=participant_id)

            elif msg_type == "consumer.create":
                p_id = payload_data.get("producer_id")
                rtp_cap = payload_data.get("rtp_capabilities", {})
                cons = await sfu_service.consume(meeting_id, participant_id, p_id, rtp_cap)
                await websocket.send_json({
                    "event_id": uuid.uuid4().hex,
                    "type": "consumer.created",
                    "request_id": req_id,
                    "payload": cons
                })

            elif msg_type == "raise_hand":
                await meeting_ws_manager.broadcast(meeting_id, {
                    "event_id": uuid.uuid4().hex,
                    "type": "hand.raised",
                    "meeting_id": meeting_id,
                    "payload": {"participant_id": participant_id}
                })

            elif msg_type == "lower_hand":
                await meeting_ws_manager.broadcast(meeting_id, {
                    "event_id": uuid.uuid4().hex,
                    "type": "hand.lowered",
                    "meeting_id": meeting_id,
                    "payload": {"participant_id": participant_id}
                })

            elif msg_type == "reaction.send":
                emoji = payload_data.get("emoji", "👍")
                await meeting_ws_manager.broadcast(meeting_id, {
                    "event_id": uuid.uuid4().hex,
                    "type": "reaction.created",
                    "meeting_id": meeting_id,
                    "payload": {"participant_id": participant_id, "emoji": emoji}
                })

            elif msg_type == "microphone.toggle":
                muted = payload_data.get("muted", False)
                await meeting_ws_manager.broadcast(meeting_id, {
                    "event_id": uuid.uuid4().hex,
                    "type": "participant.updated",
                    "meeting_id": meeting_id,
                    "payload": {"participant_id": participant_id, "is_muted": muted}
                })

            elif msg_type == "camera.toggle":
                enabled = payload_data.get("enabled", True)
                await meeting_ws_manager.broadcast(meeting_id, {
                    "event_id": uuid.uuid4().hex,
                    "type": "participant.updated",
                    "meeting_id": meeting_id,
                    "payload": {"participant_id": participant_id, "camera_enabled": enabled}
                })

    except WebSocketDisconnect:
        meeting_ws_manager.disconnect(meeting_id, participant_id)
        await sfu_service.leave_room(meeting_id, participant_id)
        await meeting_ws_manager.broadcast(meeting_id, {
            "event_id": uuid.uuid4().hex,
            "type": "participant.left",
            "meeting_id": meeting_id,
            "payload": {"participant_id": participant_id}
        })
