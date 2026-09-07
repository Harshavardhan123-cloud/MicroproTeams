import json
import uuid
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
    user_id_val = payload.get("sub")
    if not user_id_val:
        raise ValueError("Token sub missing")

    async with AsyncSessionLocal() as db:
        try:
            query_id = uuid.UUID(str(user_id_val))
        except (ValueError, TypeError):
            query_id = str(user_id_val)

        res = await db.execute(select(User).where(User.id == query_id))
        user = res.scalars().first()
        if not user:
            res = await db.execute(select(User).where(User.id == str(user_id_val)))
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
    channel_id: str = Query(None),
    session_id: str = Query(None)
):
    try:
        user = await get_user_from_token(token)
    except Exception as e:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = str(user.id)
    if channel_id and not await _can_broadcast_to(user, channel_id):
        channel_id = None
    assigned_session_id = await ws_manager.connect(websocket, user_id, channel_id, session_id)

    # Sync and broadcast initial online status
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.id == user.id))
        db_user = res.scalars().first()
        if db_user:
            cur_presence = db_user.presence.value if hasattr(db_user.presence, "value") else str(db_user.presence)
            if cur_presence == "offline":
                db_user.presence = "available"
                await db.commit()
                cur_presence = "available"
            
            await ws_manager.broadcast_to_all({
                "type": "presence_update",
                "user_id": user_id,
                "presence": cur_presence
            })

    try:
        while True:
            data = await websocket.receive_text()
            try:
                event = json.loads(data)
                event_type = event.get("type")
                event["session_id"] = assigned_session_id

                # Channel Subscriptions
                if event_type == "join_channel":
                    target_chan = event.get("channel_id")
                    if target_chan:
                        ws_manager.join_channel(websocket, target_chan)

                elif event_type == "leave_channel":
                    target_chan = event.get("channel_id")
                    if target_chan:
                        ws_manager.leave_channel(websocket, target_chan)

                # Presence Updates
                elif event_type == "presence_update":
                    new_presence = event.get("presence")
                    if new_presence:
                        async with AsyncSessionLocal() as db:
                            res = await db.execute(select(User).where(User.id == user.id))
                            db_user = res.scalars().first()
                            if db_user:
                                db_user.presence = new_presence
                                await db.commit()
                        await ws_manager.broadcast_to_all({
                            "type": "presence_update",
                            "user_id": user_id,
                            "presence": new_presence
                        })

                # WebRTC & Call Signaling Relay (Direct & Channels)
                elif event_type in ["webrtc_offer", "webrtc_answer", "webrtc_ice_candidate", "call_invite", "call_response", "call_cancel", "call_accepted", "call_declined", "call_expired", "call_upgrade_group"]:
                    target_user_id = event.get("target_user_id")
                    target_conv_id = event.get("conversation_id")
                    event["sender_user_id"] = user_id
                    if target_user_id:
                        await ws_manager.send_personal_message(str(target_user_id), event)
                    # Broadcast call invite/cancel/response to ALL sessions of the current user as well, so other tabs stay synced
                    if event_type in ["call_invite", "call_response", "call_cancel", "call_accepted", "call_declined", "call_expired", "call_upgrade_group"]:
                        await ws_manager.send_personal_message(user_id, event)
                    if target_conv_id and target_conv_id in ws_manager.active_channels:
                        await ws_manager.broadcast_to_channel(target_conv_id, event)

                    # When a call is accepted, broadcast an explicit call_accepted event with session_id to all user sessions
                    if event_type == "call_response" and event.get("status") == "accepted":
                        accepted_session_id = event.get("session_id")
                        call_id = event.get("call_id")
                        accepted_payload = {
                            "type": "call_accepted",
                            "call_id": call_id,
                            "accepted_by_session_id": accepted_session_id,
                            "accepted_by_user_id": user_id,
                            "caller_id": str(target_user_id) if target_user_id else None,
                            "conversation_id": target_conv_id
                        }
                        if target_user_id:
                            await ws_manager.send_personal_message(str(target_user_id), accepted_payload)
                        await ws_manager.send_personal_message(user_id, accepted_payload)
                
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
                elif event_type in ["meeting_media_toggle", "mesh_join", "mesh_leave", "mesh_end", "call_chat_message", "call_action", "recording_state_change", "recording_visibility_change", "call_ended_for_all"]:
                    target_channel_id = event.get("channel_id") or event.get("conversation_id") or channel_id
                    target_user_id = event.get("target_user_id")
                    event["sender_user_id"] = user_id
                    if target_user_id:
                        await ws_manager.send_personal_message(str(target_user_id), event)
                    if target_channel_id and target_channel_id in ws_manager.active_channels:
                        await ws_manager.broadcast_to_channel(target_channel_id, event)
                    await ws_manager.broadcast_to_all(event)

            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id, channel_id)
        # If user has no active WS connections left, mark offline and broadcast
        if user_id not in ws_manager.user_connections or not ws_manager.user_connections[user_id]:
            async with AsyncSessionLocal() as db:
                res = await db.execute(select(User).where(User.id == user.id))
                db_user = res.scalars().first()
                if db_user:
                    db_user.presence = "offline"
                    await db.commit()
            await ws_manager.broadcast_to_all({
                "type": "presence_update",
                "user_id": user_id,
                "presence": "offline"
            })
