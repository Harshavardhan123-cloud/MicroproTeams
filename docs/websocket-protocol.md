# MicroproTeams WebSocket Event Protocol Contract

## Connection Endpoint
`GET /api/v1/ws?token=<JWT_ACCESS_TOKEN>`

---

## 1. Client -> Server Events

### Send Message (`message.send`)
```json
{
  "type": "message.send",
  "request_id": "uuid-v4",
  "payload": {
    "channel_id": "channel-uuid",
    "client_message_id": "unique-client-uuid",
    "content": "Hello team!",
    "message_type": "text"
  }
}
```

### Toggle Reaction (`message.react`)
```json
{
  "type": "message.react",
  "request_id": "uuid-v4",
  "payload": {
    "message_id": "message-uuid",
    "emoji": "👍"
  }
}
```

### Typing Indicator (`typing.start` / `typing.stop`)
```json
{
  "type": "typing.start",
  "payload": {
    "channel_id": "channel-uuid"
  }
}
```

---

## 2. Server -> Client Events

### Connection Ready (`connection.ready`)
```json
{
  "event_id": "uuid-v4",
  "type": "connection.ready",
  "timestamp": "2026-08-27T10:00:00Z",
  "payload": {
    "connection_id": "conn-12345",
    "user_id": "user-uuid",
    "server_time": "2026-08-27T10:00:00Z"
  }
}
```

### Message Created (`message.new` / `message.created`)
```json
{
  "event_id": "uuid-v4",
  "type": "message.new",
  "timestamp": "2026-08-27T10:00:01Z",
  "payload": {
    "id": "message-uuid",
    "client_message_id": "unique-client-uuid",
    "channel_id": "channel-uuid",
    "sender_id": "user-uuid",
    "content": "Hello team!",
    "created_at": "2026-08-27T10:00:01Z"
  }
}
```

### Message Pinned (`message.pinned`)
```json
{
  "event_id": "uuid-v4",
  "type": "message.pinned",
  "timestamp": "2026-08-27T10:00:02Z",
  "payload": {
    "message_id": "message-uuid",
    "is_pinned": true
  }
}
```
