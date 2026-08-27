# MicroproTeams WebRTC Signaling Event Protocol

## Endpoint
`WS /api/v1/meetings/{meeting_id}/signaling?token={access_token}`

---

## Message Envelope Schema

```json
{
  "event_id": "uuid-string",
  "type": "event.type",
  "request_id": "uuid-string",
  "meeting_id": "uuid-string",
  "payload": {}
}
```

---

## Event Reference Matrix

| Event Type | Direction | Description |
| :--- | :--- | :--- |
| `transport.create` | Client → Server | Request creation of send/receive `WebRtcTransport` |
| `transport.created` | Server → Client | Returns transport ID, ICE parameters, and candidates |
| `transport.connect` | Client → Server | Provide client DTLS parameters to establish connection |
| `producer.create` | Client → Server | Publish audio, video, or screen track |
| `producer.created` | Server → Client | Confirms producer creation |
| `producer.announced` | Server → Client | Notifies room of new media producer |
| `consumer.create` | Client → Server | Subscribe to remote producer |
| `consumer.created` | Server → Client | Returns consumer parameters |
| `raise_hand` / `lower_hand` | Client → Server | Toggle raised hand state |
| `hand.raised` / `hand.lowered` | Server → Client | Broadcast hand state update |
| `reaction.send` | Client → Server | Send ephemeral emoji reaction (`👍`, `❤️`, `👏`) |
| `reaction.created` | Server → Client | Broadcast reaction overlay |
| `microphone.toggle` | Client → Server | Update microphone state |
| `camera.toggle` | Client → Server | Update camera state |
| `participant.joined` / `participant.left` | Server → Client | Broadcast participant presence |
