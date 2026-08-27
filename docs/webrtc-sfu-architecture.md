# MicroproTeams WebRTC & SFU Media Architecture

## 1. SFU Media Routing Topology

```
                  Internet
                      |
                Nginx Proxy / WSS
                      |
             Signaling API (FastAPI)
                      |
           +----------+----------+
           |                     |
     PostgreSQL DB          Redis Cluster
(Meetings, Participants,   (Signaling Bus,
 Call History, Policies)   Node Capacity,
                           Presence)
                      |
              SFU Service Layer
             (Mediasoup Nodes)
             /       |       \
     Browser A   Browser B   Browser C
```

---

## 2. Peer Transports & Producer/Consumer Model

- **Send Transport (`WebRtcTransport`)**: Created per participant to publish media tracks (`microphone`, `camera`, `screen_share`).
- **Receive Transport (`WebRtcTransport`)**: Created per participant to subscribe to other participants' active producers (`consumers`).
- **Zero Transcoding Overhead**: The SFU routes encrypted RTP streams without decoding or re-encoding media payloads.

---

## 3. Bandwidth Optimization & Simulcast

- **Simulcast Layers**: High (1080p), Medium (720p), Low (360p).
- **Active Speaker Prioritization**: Receivers subscribe to High layer for the active speaker and Low layer for thumbnail tiles. Off-screen video tracks are automatically paused to conserve client CPU and bandwidth.

---

## 4. Multi-Node SFU Scaling

- Redis tracks active SFU node capacity and schedules new meeting rooms on the least-loaded SFU instance.
