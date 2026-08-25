/**
 * MicroproTeams — mediasoup SFU Server
 * Handles WebRTC signaling and media routing for video/audio conferences.
 */
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");
const cors = require("cors");
const winston = require("winston");

const Room = require("./Room");

// ── Logger ──────────────────────────────────────────────────────────
const log = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// ── Express & Socket.io ─────────────────────────────────────────────
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ── mediasoup Config ────────────────────────────────────────────────
const MEDIA_CODECS = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    parameters: { "sprop-stereo": 1 },
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {},
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
    },
  },
];

const WEBRTC_TRANSPORT_OPTIONS = {
  listenIps: [
    {
      ip: process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0",
      announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || "127.0.0.1",
    },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 1000000,
  minimumAvailableOutgoingBitrate: 600000,
};

// ── State ───────────────────────────────────────────────────────────
const workers = [];
const rooms = new Map(); // roomId → Room
let workerIndex = 0;

// ── Worker Pool ─────────────────────────────────────────────────────
async function createWorkers() {
  const numCores = require("os").cpus().length;
  const numWorkers = Math.max(1, Math.min(numCores, 4));
  log.info(`Starting ${numWorkers} mediasoup workers`);

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: "warn",
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    });
    worker.on("died", () => {
      log.error(`Worker ${worker.pid} died — restarting`);
      workers.splice(workers.indexOf(worker), 1);
      createWorkers();
    });
    workers.push(worker);
    log.info(`Worker ${worker.pid} started`);
  }
}

function getNextWorker() {
  const worker = workers[workerIndex % workers.length];
  workerIndex++;
  return worker;
}

async function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    const worker = getNextWorker();
    const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
    const room = new Room(roomId, router);
    rooms.set(roomId, room);
    log.info(`Room created: ${roomId}`);
  }
  return rooms.get(roomId);
}

// ── REST Endpoints ──────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", workers: workers.length }));

app.get("/rooms/:roomId/rtp-capabilities", async (req, res) => {
  try {
    const room = await getOrCreateRoom(req.params.roomId);
    res.json({ rtpCapabilities: room.router.rtpCapabilities });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Socket.io Signaling ─────────────────────────────────────────────
io.on("connection", (socket) => {
  log.info(`Peer connected: ${socket.id}`);
  let currentRoom = null;
  let currentPeerId = null;

  socket.on("join-room", async ({ roomId, peerId, displayName }, ack) => {
    try {
      currentRoom = await getOrCreateRoom(roomId);
      currentPeerId = peerId;

      currentRoom.addPeer(peerId, socket, displayName);
      socket.join(roomId);

      // Notify others
      socket.to(roomId).emit("peer-joined", { peerId, displayName });

      // Send existing peers list
      const peers = currentRoom.getPeers().filter((p) => p.id !== peerId);
      ack({ success: true, peers: peers.map((p) => ({ id: p.id, displayName: p.displayName })) });
      log.info(`Peer ${peerId} joined room ${roomId}`);
    } catch (e) {
      ack({ success: false, error: e.message });
    }
  });

  socket.on("create-transport", async ({ direction }, ack) => {
    try {
      const transport = await currentRoom.router.createWebRtcTransport(WEBRTC_TRANSPORT_OPTIONS);
      currentRoom.getPeer(currentPeerId)?.addTransport(transport);

      ack({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (e) {
      ack({ error: e.message });
    }
  });

  socket.on("connect-transport", async ({ transportId, dtlsParameters }, ack) => {
    try {
      const peer = currentRoom.getPeer(currentPeerId);
      const transport = peer.getTransport(transportId);
      await transport.connect({ dtlsParameters });
      ack({ connected: true });
    } catch (e) {
      ack({ error: e.message });
    }
  });

  socket.on("produce", async ({ transportId, kind, rtpParameters, appData }, ack) => {
    try {
      const peer = currentRoom.getPeer(currentPeerId);
      const transport = peer.getTransport(transportId);
      const producer = await transport.produce({ kind, rtpParameters, appData });
      peer.addProducer(producer);

      // Notify others to consume this producer
      socket.to(currentRoom.id).emit("new-producer", {
        producerId: producer.id,
        peerId: currentPeerId,
        kind,
        appData,
      });

      ack({ producerId: producer.id });
    } catch (e) {
      ack({ error: e.message });
    }
  });

  socket.on("consume", async ({ producerId, rtpCapabilities, transportId }, ack) => {
    try {
      if (!currentRoom.router.canConsume({ producerId, rtpCapabilities })) {
        return ack({ error: "Cannot consume" });
      }
      const peer = currentRoom.getPeer(currentPeerId);
      const transport = peer.getTransport(transportId);
      const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
      peer.addConsumer(consumer);

      ack({
        consumerId: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (e) {
      ack({ error: e.message });
    }
  });

  socket.on("resume-consumer", async ({ consumerId }, ack) => {
    try {
      const peer = currentRoom.getPeer(currentPeerId);
      const consumer = peer.getConsumer(consumerId);
      await consumer.resume();
      ack({ resumed: true });
    } catch (e) {
      ack({ error: e.message });
    }
  });

  socket.on("meeting:action", ({ roomId, peerId, action, payload }) => {
    // Broadcast hand raises, emojis, etc. to everyone else in the room
    socket.to(roomId).emit("meeting:action", { peerId, action, payload });
  });

  socket.on("disconnect", () => {
    if (currentRoom && currentPeerId) {
      currentRoom.removePeer(currentPeerId);
      socket.to(currentRoom.id).emit("peer-left", { peerId: currentPeerId });

      if (currentRoom.getPeers().length === 0) {
        currentRoom.close();
        rooms.delete(currentRoom.id);
        log.info(`Room ${currentRoom.id} closed (empty)`);
      }
    }
    log.info(`Peer disconnected: ${socket.id}`);
  });
});

// ── Start Server ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

(async () => {
  await createWorkers();
  server.listen(PORT, () => {
    log.info(`mediasoup SFU listening on port ${PORT}`);
  });
})();
