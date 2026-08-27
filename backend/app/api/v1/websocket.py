import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.core.security import decode_token
from app.core.websocket import ws_manager
from app.models.models import User, DirectConversationMember
from app.services.authorization_service import AuthorizationService
from sqlalchemy.future import select

router = APIRouter(tags=["WebSocket"])

async def get_user_from_token(token: str) -> User:
    payload = decode_token(token)
    if not payload:
        raise ValueError("Invalid authentication token")
    user_id = payload.get("sub")

    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.id == user_id))
        user = res.scalars().first()
        if not user:
            raise ValueError("User not found")
        return user

async def _can_broadcast_to(user: User, target_id: str) -> bool:
    """A client may only join/broadcast to a channel it can access, or a DM
    conversation it's a member of — target_id may be either."""
    async with AsyncSessionLocal() as db:
        if await AuthorizationService.can_access_channel(user, target_id, db):
            return True
        res = await db.execute(
            select(DirectConversationMember).where(
                DirectConversationMember.conversation_id == target_id,
                DirectConversationMember.user_id == user.id
            )
        )
        return res.scalars().first() is not None

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    channel_id: str = Query(None)
):
    try:
        user = await get_user_from_token(token)
    except Exception as e:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = str(user.id)
    if channel_id and not await _can_broadcast_to(user, channel_id):
        channel_id = None
    await ws_manager.connect(websocket, user_id, channel_id)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                event = json.loads(data)
                event_type = event.get("type")

                # Channel Subscriptions
                if event_type == "join_channel":
                    target_chan = event.get("channel_id")
                    if target_chan and await _can_broadcast_to(user, target_chan):
                        ws_manager.join_channel(websocket, target_chan)

                elif event_type == "leave_channel":
                    target_chan = event.get("channel_id")
                    if target_chan:
                        ws_manager.leave_channel(websocket, target_chan)

                # WebRTC & Call Signaling Relay (Direct & Channels)
                elif event_type in ["webrtc_offer", "webrtc_answer", "webrtc_ice_candidate", "call_invite", "call_response"]:
                    target_user_id = event.get("target_user_id")
                    if target_user_id:
                        target_user_id = str(target_user_id)
                        event["sender_user_id"] = user_id
                        await ws_manager.send_personal_message(target_user_id, event)
                
                # Typing Indicators
                elif event_type == "typing_indicator":
                    target_chan = event.get("channel_id") or channel_id
                    if target_chan and await _can_broadcast_to(user, target_chan):
                        await ws_manager.broadcast_to_channel(target_chan, {
                            "type": "typing_indicator",
                            "user_id": user_id,
                            "is_typing": event.get("is_typing", True)
                        })

                # Meeting Media Toggles & Group Call Mesh Signaling
                elif event_type in ["meeting_media_toggle", "mesh_join", "mesh_leave", "mesh_end", "call_chat_message", "call_action"]:
                    target_channel_id = event.get("channel_id") or event.get("conversation_id") or channel_id
                    if target_channel_id and await _can_broadcast_to(user, target_channel_id):
                        event["sender_user_id"] = user_id
                        await ws_manager.broadcast_to_channel(target_channel_id, event)

            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id, channel_id)
