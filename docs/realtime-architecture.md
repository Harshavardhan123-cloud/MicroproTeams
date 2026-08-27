# MicroproTeams Real-Time Messaging & WebSocket Architecture

## 1. System Overview

```
                Browser / Client
                       |
             HTTP REST + WebSocket (/api/v1/ws)
                       |
                       v
                 Nginx / Load Balancer
                       |
         +-------------+-------------+
         |                           |
         v                           v
    FastAPI Instance #1        FastAPI Instance #2
         |                           |
         +-------------+-------------+
                       |
                  Redis Pub/Sub
                       |
         +-------------+-------------+
         |                           |
         v                           v
    PostgreSQL DB               File Storage
```

- **PostgreSQL**: Absolute source of truth for persistent entity state (users, organizations, teams, channels, conversations, messages, reactions, mentions, notifications).
- **Redis**: Real-time message broadcast coordination (Pub/Sub), active WebSocket connection registry, typing indicator TTL caching, and user presence heartbeat.
- **FastAPI / WebSocket**: Stateful gateway delivering real-time events to connected clients across multiple backend instances.

---

## 2. Message Persistence & Broadcast Lifecycle

1. **Client Submission**: Client sends a REST request (`POST /api/v1/channels/{id}/messages`) or WebSocket frame (`message.send`) containing `client_message_id`.
2. **Authentication & Authorization**: Server resolves user identity from session/JWT token, validates active status, and confirms organization and conversation/channel access.
3. **Database Write**: Message is written and committed to **PostgreSQL**. If duplicate `client_message_id` is detected, the existing record is returned without re-inserting (Idempotency).
4. **Redis Publication**: Server publishes event payload to Redis channel (`channel:{id}` or `user:{id}`).
5. **WebSocket Delivery**: All backend instances subscribed to the Redis channel deliver the payload to connected WebSockets.

---

## 3. Presence & Typing Indicators

- **Presence**: Tracked via WebSocket connection lifecycle and Redis heartbeats (`ws:user:{user_id}`). Presence states: `AVAILABLE`, `BUSY`, `DND`, `AWAY`, `OFFLINE`.
- **Typing Indicators**: Ephemeral state cached in Redis with 3-second auto-expiration (`typing:{channel_id}:{user_id}`). Never written to PostgreSQL.

---

## 4. Automatic Reconnection & Missed Event Synchronization

- **Exponential Backoff**: `1s` -> `2s` -> `4s` -> `8s` -> `30s max`.
- **Missed Event Recovery**: Client passes `last_event_id` or `last_message_id` upon reconnection. Server queries PostgreSQL for missed messages and syncs state seamlessly.
