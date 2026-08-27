# MicroproTeams Meeting Security & TURN Configuration

## 1. Secure Meeting Code Generation
- Meeting codes use cryptographically secure random tokens (`meet-xxxx-yyyy`) instead of sequential database auto-increment IDs.
- Rate-limiting is enforced on join attempts to prevent brute-force enumeration.

---

## 2. Lobby Isolation & Access Control
- Meetings with `lobby_enabled=True` route non-host participants into `WAITING` status.
- Participants in the lobby do not receive WebRTC signaling events or SFU media streams until admitted by a host or co-host.

---

## 3. STUN/TURN Firewall & Relay Fallback
- **STUN**: Discovers public IPv4/IPv6 endpoints (`stun:stun.l.google.com:19302`).
- **TURN Relay (Coturn)**: Relays media when direct P2P/UDP paths fail due to restrictive corporate firewalls or symmetric NATs.
- **Short-Lived Credentials**: Temporary TURN credentials generated using HMAC-SHA1 to prevent unauthorized relay bandwidth theft.
