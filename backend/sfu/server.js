const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mediasoup = require('mediasoup');
const config = require('./config');

const app = express();
app.use(cors({ origin: config.corsOrigin }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mediasoup-sfu',
    workers: workers.length,
    rooms: rooms.size,
    uptime: Math.floor(process.uptime())
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] }
});

// Require a valid access token (same JWT_SECRET as the FastAPI backend) on
// every connection in production.
io.use((socket, next) => {
  const secret = config.jwtSecret || process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    return next(new Error('Internal Server Error: Missing JWT_SECRET in SFU environment'));
  }
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token && secret) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
      socket.userId = payload.sub;
      return next();
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        return next(new Error(`Authentication failed: ${err.message}`));
      }
      console.warn('[SFU] Auth token verify warning (allowing connection in dev mode):', err.message);
      return next();
    }
  } else if (process.env.NODE_ENV === 'production') {
    return next(new Error('Authentication required: Token missing'));
  }
  next();
});

// --- ICE server list handed to clients ---
// Anything outside this set can end up as part of a coturn username, and the
// username is parsed by splitting on the first ':' — so a colon (or anything
// exotic) in a user id must never reach it.
const TURN_USERNAME_UNSAFE = /[^A-Za-z0-9._@-]/g;

/**
 * Build the `iceServers` array returned inside the createWebRtcTransport ack.
 *
 * STUN alone leaves mobile clients on carrier-grade NAT unable to receive
 * media at all, so when a TURN server is configured we append a *short-lived*
 * relay credential using coturn's REST API scheme:
 *
 *   username   = "<unix-expiry>:<userId>"
 *   credential = base64( HMAC-SHA1( username, TURN_SECRET ) )
 *
 * coturn recomputes the same HMAC from the username it receives, so no state
 * is shared between the two processes beyond the secret, and the credential
 * stops working on its own once the embedded timestamp passes. Credentials
 * are minted per transport, so each one is fresh.
 *
 * Any failure here degrades to the STUN-only list rather than throwing: a
 * broken TURN config must not be able to take calls down entirely.
 */
function buildIceServers(userId) {
  const iceServers = config.stunServers.map(entry => ({ ...entry }));

  if (!config.turn || !config.turn.enabled) return iceServers;

  try {
    const expiry = Math.floor(Date.now() / 1000) + config.turn.credentialTtl;
    const identity = String(userId || 'anonymous').replace(TURN_USERNAME_UNSAFE, '') || 'anonymous';
    const username = `${expiry}:${identity}`;
    const credential = crypto
      .createHmac('sha1', config.turn.secret)
      .update(username)
      .digest('base64');

    iceServers.push({ urls: config.turn.urls, username, credential });
  } catch (err) {
    console.error('[SFU] Failed to mint TURN credentials, falling back to STUN only:', err.message);
  }

  return iceServers;
}

// --- Mediasoup Global State ---
let workers = [];
let nextWorkerIdx = 0;
// Maps room_id -> { router, peers: { peerId: { transports, producers, consumers } } }
const rooms = new Map();

async function createWorkers() {
  const { numWorkers } = config.mediasoup;
  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: config.mediasoup.worker.logLevel,
      logTags: config.mediasoup.worker.logTags,
      rtcMinPort: config.mediasoup.worker.rtcMinPort,
      rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    });
    worker.on('died', () => {
      console.error(`mediasoup worker died, exiting in 2 seconds... [pid:${worker.pid}]`);
      setTimeout(() => process.exit(1), 2000);
    });
    workers.push(worker);
  }
  console.log(`Created ${numWorkers} mediasoup workers`);
}

function getNextWorker() {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

async function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    const worker = getNextWorker();
    const router = await worker.createRouter({ mediaCodecs: config.mediasoup.router.mediaCodecs });
    room = { router, peers: new Map() };
    rooms.set(roomId, room);
    console.log(`Created new Mediasoup Router for room: ${roomId}`);
  }
  return room;
}

// --- Socket.io Signaling ---
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Clean up on disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    for (const [roomId, room] of rooms.entries()) {
      if (room.peers.has(socket.id)) {
        const peer = room.peers.get(socket.id);
        // Close all transports
        peer.transports.forEach(t => t.close());
        room.peers.delete(socket.id);
        
        // Notify others
        socket.to(roomId).emit('peerClosed', { peerId: socket.id });
        
        // Clean up empty rooms
        if (room.peers.size === 0) {
          room.router.close();
          rooms.delete(roomId);
          console.log(`Closed empty room: ${roomId}`);
        }
      }
    }
  });

  socket.on('joinRoom', async ({ roomId, userName }, callback) => {
    const room = await getOrCreateRoom(roomId);
    socket.join(roomId);
    
    room.peers.set(socket.id, {
      userName: (userName && userName !== 'Participant' && userName !== 'Teammate') ? userName : 'User',
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    });
    
    callback({ routerRtpCapabilities: room.router.rtpCapabilities });
  });

  socket.on('createWebRtcTransport', async ({ roomId }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (!room) return callback({ error: 'Room not found' });
      
      const { listenIps, initialAvailableOutgoingBitrate, maxIncomingBitrate } = config.mediasoup.webRtcTransport;
      const transport = await room.router.createWebRtcTransport({
        listenIps,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate
      });
      
      if (maxIncomingBitrate) {
        try { await transport.setMaxIncomingBitrate(maxIncomingBitrate); } catch (error) {}
      }
      
      transport.on('icestatechange', (iceState) => {
        console.log(`[SFU] Transport ${transport.id} (${socket.id}) ICE state: ${iceState}`);
      });

      transport.on('dtlsstatechange', (dtlsState) => {
        console.log(`[SFU] Transport ${transport.id} (${socket.id}) DTLS state: ${dtlsState}`);
        if (dtlsState === 'closed') transport.close();
      });
      
      room.peers.get(socket.id).transports.set(transport.id, transport);
      
      callback({
        params: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
          // socket.userId is only set when a valid JWT was presented; the
          // socket id is a fine stand-in, since this value exists purely to
          // attribute a relay session in coturn's logs.
          iceServers: buildIceServers(socket.userId || socket.id)
        }
      });
    } catch (err) {
      console.error(`[SFU] Error creating WebRtcTransport:`, err);
      callback({ error: err.message });
    }
  });

  socket.on('connectWebRtcTransport', async ({ roomId, transportId, dtlsParameters }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (!room) return callback({ error: 'Room not found' });
      const peer = room.peers.get(socket.id);
      if (!peer) return callback({ error: 'Peer not found' });
      const transport = peer.transports.get(transportId);
      if (!transport) return callback({ error: 'Transport not found' });
      await transport.connect({ dtlsParameters });
      console.log(`[SFU] Transport ${transportId} DTLS connected successfully`);
      callback({ success: true });
    } catch (err) {
      console.error(`[SFU] Error connecting transport ${transportId}:`, err);
      callback({ error: err.message });
    }
  });

  socket.on('produce', async ({ roomId, transportId, kind, rtpParameters, appData }, callback) => {
    try {
      const room = rooms.get(roomId);
      const transport = room.peers.get(socket.id).transports.get(transportId);
      
      const producer = await transport.produce({ kind, rtpParameters, appData });
      room.peers.get(socket.id).producers.set(producer.id, producer);
      
      producer.on('transportclose', () => producer.close());
      
      const peer = room.peers.get(socket.id);
      
      // Notify all OTHER peers in the room that a new producer is available
      socket.to(roomId).emit('newProducer', {
        producerId: producer.id,
        peerId: socket.id,
        userName: (peer?.userName && peer.userName !== 'Participant' && peer.userName !== 'Teammate') ? peer.userName : 'User',
        kind: producer.kind,
        appData: producer.appData
      });
      
      callback({ id: producer.id });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  socket.on('closeProducer', ({ roomId, producerId }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (room && room.peers.has(socket.id)) {
        const producer = room.peers.get(socket.id).producers.get(producerId);
        if (producer) {
          producer.close();
          room.peers.get(socket.id).producers.delete(producerId);
          socket.to(roomId).emit('producerClosed', { producerId, peerId: socket.id });
        }
      }
      if (callback) callback({ success: true });
    } catch (err) {
      if (callback) callback({ error: err.message });
    }
  });

  socket.on('consume', async ({ roomId, transportId, producerId, rtpCapabilities }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        return callback({ error: 'Cannot consume' });
      }
      
      const transport = room.peers.get(socket.id).transports.get(transportId);
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: false,
      });
      
      room.peers.get(socket.id).consumers.set(consumer.id, consumer);
      
      consumer.on('transportclose', () => consumer.close());
      consumer.on('producerclose', () => {
        consumer.close();
        socket.emit('consumerClosed', { consumerId: consumer.id });
      });

      // Crucial for WebRTC video rendering: Request immediate keyframe from producer so video decodes without black screen
      if (consumer.kind === 'video') {
        setTimeout(async () => {
          try {
            await consumer.requestKeyFrame();
          } catch (e) {}
        }, 100);
      }
      
      callback({
        params: {
          id: consumer.id,
          producerId: producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters
        }
      });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  socket.on('resumeConsumer', async ({ roomId, consumerId }, callback) => {
    try {
      const room = rooms.get(roomId);
      const consumer = room.peers.get(socket.id)?.consumers.get(consumerId);
      if (consumer) {
        await consumer.resume();
        if (consumer.kind === 'video') {
          await consumer.requestKeyFrame();
        }
      }
      if (callback) callback({ success: true });
    } catch (err) {
      if (callback) callback({ error: err.message });
    }
  });

  socket.on('requestKeyFrame', async ({ roomId, consumerId }, callback) => {
    try {
      const room = rooms.get(roomId);
      const consumer = room.peers.get(socket.id)?.consumers.get(consumerId);
      if (consumer && consumer.kind === 'video') {
        await consumer.requestKeyFrame();
      }
      if (callback) callback({ success: true });
    } catch (err) {
      if (callback) callback({ error: err.message });
    }
  });
  
  socket.on('getProducers', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback([]);
    
    let producerList = [];
    for (const [peerId, peer] of room.peers.entries()) {
      if (peerId !== socket.id) {
        for (const [producerId, producer] of peer.producers.entries()) {
          producerList.push({
            producerId,
            peerId,
            userName: (peer.userName && peer.userName !== 'Participant' && peer.userName !== 'Teammate') ? peer.userName : 'User',
            kind: producer.kind,
            appData: producer.appData
          });
        }
      }
    }
    callback(producerList);
  });
});

createWorkers().then(() => {
  server.listen(config.listenPort, config.listenIp, () => {
    console.log(`Mediasoup SFU Signaling Server running on http://${config.listenIp}:${config.listenPort}`);
  });
});

function gracefulShutdown(signal) {
  console.log(`[SFU] Received ${signal}. Gracefully shutting down SFU...`);
  server.close(() => {
    for (const worker of workers) {
      try {
        worker.close();
      } catch (e) {}
    }
    console.log('[SFU] Closed all workers and server connections.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[SFU] Forced shutdown due to timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
