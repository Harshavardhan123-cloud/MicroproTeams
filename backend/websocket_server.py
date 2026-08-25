"""
Socket.io real-time server — chat, presence, typing indicators.

Note: event names containing ':' cannot be Python identifiers, so every
handler is registered explicitly with @sio.on("name") rather than @sio.event.
"""
import socketio
import json

import redis.asyncio as aioredis
from sqlalchemy import select
from core.config import settings
from core.security import decode_token
from core.database import AsyncSessionLocal
from models.workspace import ChannelMember
import models.message
import models.user
import models.meeting

# Async Socket.io server with Redis pub/sub for horizontal scaling
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=True,
    engineio_logger=True,
    ping_timeout=60,
    ping_interval=25,
)

# Mounted at "/ws" in main.py — Starlette strips that prefix before this app
# sees the path, so socketio_path must be relative. Public URL: /ws/socket.io
sio_app = socketio.ASGIApp(sio, socketio_path="socket.io")
app = sio_app  # Alias for uvicorn websocket_server:app

# In-memory session store (use Redis for production multi-instance)
_user_sessions: dict[str, str] = {}  # sid → user_id
_user_sids: dict[str, list[str]] = {}  # user_id → [sids]

# Single shared Redis connection — reconnecting on every event is wasteful
_redis: aioredis.Redis | None = None


async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def _authenticate(token: str) -> dict | None:
    try:
        return decode_token(token)
    except Exception:
        return None


# ── Connection ───────────────────────────────────────────────────────
@sio.event
async def connect(sid, environ, auth):
    token = None
    if isinstance(auth, dict) and auth.get("token"):
        token = auth.get("token")

    if not token and "QUERY_STRING" in environ:
        from urllib.parse import parse_qs
        qs = parse_qs(environ.get("QUERY_STRING", ""))
        if "token" in qs and qs["token"]:
            token = qs["token"][0]

    if not token and "HTTP_AUTHORIZATION" in environ:
        auth_hdr = environ.get("HTTP_AUTHORIZATION", "")
        if auth_hdr.startswith("Bearer "):
            token = auth_hdr[7:]

    payload = await _authenticate(token) if token else None
    if not payload:
        print(f"[WS REJECTED] sid={sid}, token={token[:10] if token else 'None'}")
        return False  # Reject unauthenticated connection

    user_id = payload["sub"]
    _user_sessions[sid] = user_id
    _user_sids.setdefault(user_id, []).append(sid)

    # Join a personal room for direct events (like new DMs)
    await sio.enter_room(sid, f"user:{user_id}")

    # Auto-join all channels the user is a member of
    async with AsyncSessionLocal() as session:
        memberships = await session.execute(
            select(ChannelMember.channel_id).where(ChannelMember.user_id == user_id)
        )
        for row in memberships.all():
            await sio.enter_room(sid, f"channel:{row.channel_id}")

    # Update presence to online
    redis = await _get_redis()
    await redis.hset("presence", user_id, "online")

    # Notify all channels the user is in
    await sio.emit("presence:change", {"user_id": user_id, "status": "online"}, skip_sid=sid)
    print(f"[WS] User {user_id} connected ({sid})")


@sio.event
async def disconnect(sid):
    user_id = _user_sessions.pop(sid, None)
    if not user_id:
        return

    sids = _user_sids.get(user_id, [])
    if sid in sids:
        sids.remove(sid)

    # Only mark offline if no other connections
    if not sids:
        _user_sids.pop(user_id, None)
        redis = await _get_redis()
        await redis.hset("presence", user_id, "offline")
        await sio.emit("presence:change", {"user_id": user_id, "status": "offline"})

    print(f"[WS] User {user_id} disconnected ({sid})")


# ── Channel Rooms ────────────────────────────────────────────────────
@sio.on("channel:join")
async def channel_join(sid, data):
    """Client joins a channel room to receive its messages. Validated against Postgres."""
    channel_id = (data or {}).get("channel_id")
    user_id = _user_sessions.get(sid)
    if channel_id and user_id:
        async with AsyncSessionLocal() as session:
            membership = await session.execute(
                select(ChannelMember).where(
                    ChannelMember.channel_id == channel_id,
                    ChannelMember.user_id == user_id
                )
            )
            if membership.scalar_one_or_none():
                await sio.enter_room(sid, f"channel:{channel_id}")
            else:
                print(f"[WS] Unauthorized join attempt: user {user_id} -> channel {channel_id}")


@sio.on("channel:leave")
async def channel_leave(sid, data):
    channel_id = (data or {}).get("channel_id")
    if channel_id:
        await sio.leave_room(sid, f"channel:{channel_id}")


# ── Messaging ────────────────────────────────────────────────────────
@sio.on("message:send")
async def message_send(sid, data):
    """
    Broadcast a new message to all channel members.
    data: { channel_id, message_id, content, author_id, created_at, thread_id, is_encrypted }
    """
    channel_id = (data or {}).get("channel_id")
    if not channel_id:
        return
        
    # We broadcast to the channel room first
    await sio.emit("message:new", data, room=f"channel:{channel_id}", skip_sid=sid)
    
    # And we also specifically alert all members in their user rooms in case they haven't joined the channel room yet (e.g. new DM)
    async with AsyncSessionLocal() as session:
        members = await session.execute(
            select(ChannelMember.user_id).where(ChannelMember.channel_id == channel_id)
        )
        for row in members.all():
            member_id = row.user_id
            if member_id != _user_sessions.get(sid):
                # Emit to user room (socketio handles deduplication if we used multiple rooms, but here we emit explicitly)
                await sio.emit("message:new", data, room=f"user:{member_id}")

    # Pub to Redis for other server instances
    redis = await _get_redis()
    await redis.publish(f"channel:{channel_id}", json.dumps({"event": "message:new", "data": data}))


@sio.on("message:edit")
async def message_edit(sid, data):
    channel_id = (data or {}).get("channel_id")
    if channel_id and f"channel:{channel_id}" in sio.rooms(sid):
        await sio.emit("message:updated", data, room=f"channel:{channel_id}", skip_sid=sid)


@sio.on("message:delete")
async def message_delete(sid, data):
    channel_id = (data or {}).get("channel_id")
    if channel_id and f"channel:{channel_id}" in sio.rooms(sid):
        await sio.emit("message:deleted", data, room=f"channel:{channel_id}", skip_sid=sid)


@sio.on("message:react")
async def message_react(sid, data):
    channel_id = (data or {}).get("channel_id")
    if channel_id and f"channel:{channel_id}" in sio.rooms(sid):
        await sio.emit("message:reaction", data, room=f"channel:{channel_id}", skip_sid=sid)


# ── Typing Indicators ────────────────────────────────────────────────
@sio.on("typing:start")
async def typing_start(sid, data):
    channel_id = (data or {}).get("channel_id")
    user_id = _user_sessions.get(sid)
    if channel_id and user_id and f"channel:{channel_id}" in sio.rooms(sid):
        await sio.emit(
            "typing:update",
            {"channel_id": channel_id, "user_id": user_id, "is_typing": True},
            room=f"channel:{channel_id}",
            skip_sid=sid,
        )


@sio.on("typing:stop")
async def typing_stop(sid, data):
    channel_id = (data or {}).get("channel_id")
    user_id = _user_sessions.get(sid)
    if channel_id and user_id and f"channel:{channel_id}" in sio.rooms(sid):
        await sio.emit(
            "typing:update",
            {"channel_id": channel_id, "user_id": user_id, "is_typing": False},
            room=f"channel:{channel_id}",
            skip_sid=sid,
        )


# ── Presence ─────────────────────────────────────────────────────────
@sio.on("presence:update")
async def presence_update(sid, data):
    """User manually sets their presence status."""
    user_id = _user_sessions.get(sid)
    status = (data or {}).get("status", "online")
    if user_id:
        redis = await _get_redis()
        await redis.hset("presence", user_id, status)
        await sio.emit("presence:change", {"user_id": user_id, "status": status})


# ── Meeting Signals ──────────────────────────────────────────────────
@sio.on("meeting:join")
async def meeting_join(sid, data):
    meeting_id = (data or {}).get("meeting_id")
    if meeting_id:
        await sio.enter_room(sid, f"meeting:{meeting_id}")
        user_id = _user_sessions.get(sid)
        await sio.emit(
            "meeting:participant_joined",
            {"user_id": user_id},
            room=f"meeting:{meeting_id}",
            skip_sid=sid,
        )


@sio.on("meeting:leave")
async def meeting_leave(sid, data):
    meeting_id = (data or {}).get("meeting_id")
    if meeting_id:
        user_id = _user_sessions.get(sid)
        await sio.leave_room(sid, f"meeting:{meeting_id}")
        await sio.emit("meeting:participant_left", {"user_id": user_id}, room=f"meeting:{meeting_id}")


# ── Ringing Signals ──────────────────────────────────────────────────
@sio.on("call:ring")
async def call_ring(sid, data):
    """
    User initiates a call to another user.
    data: { target_user_id, meeting_id, type: "audio" | "video" }
    """
    target_user_id = (data or {}).get("target_user_id")
    caller_id = _user_sessions.get(sid)
    if target_user_id and caller_id:
        # Pass the caller ID so the target knows who is calling
        data["caller_id"] = caller_id
        await sio.emit("call:incoming", data, room=f"user:{target_user_id}")

@sio.on("call:decline")
async def call_decline(sid, data):
    """
    User declines an incoming call.
    data: { caller_id, meeting_id }
    """
    caller_id = (data or {}).get("caller_id")
    target_user_id = _user_sessions.get(sid)
    if caller_id and target_user_id:
        data["target_user_id"] = target_user_id
        await sio.emit("call:declined", data, room=f"user:{caller_id}")

@sio.on("call:cancel")
async def call_cancel(sid, data):
    """
    User cancels an outgoing call before it's answered.
    data: { target_user_id, meeting_id }
    """
    target_user_id = (data or {}).get("target_user_id")
    caller_id = _user_sessions.get(sid)
    if target_user_id and caller_id:
        data["caller_id"] = caller_id
        await sio.emit("call:cancelled", data, room=f"user:{target_user_id}")


async def shutdown_redis():
    """Close the shared Redis connection on app shutdown."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
