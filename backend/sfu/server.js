const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mediasoup = require('mediasoup');
const config = require('./config');

const app = express();
app.use(cors({ origin: config.corsOrigin }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] }
});

// Require a valid access token (same JWT_SECRET as the FastAPI backend) on
// every connection — previously anyone who could reach this port could join
// any room with no login at all. This confirms "is a genuinely logged-in
// user of this app" but doesn't check meeting-specific admission/lobby
// status, which lives in the backend's MeetingParticipant table.
io.use((socket, next) => {
  const secret = config.jwtSecret || process.env.JWT_SECRET || 'UX2uSYPervxO3Ysrml5wILaUEfEw-HCJKEeUypWMMSyZiQuVFgLQT3iBy49xNMGl';
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
      socket.userId = payload.sub;
    } catch (err) {
      console.warn('[SFU] Auth token verify warning (allowing connection):', err.message);
    }
  }
  next();
});

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
      
      transport.on('dtlsstatechange', dtlsState => {
        if (dtlsState === 'closed') transport.close();
      });
      
      room.peers.get(socket.id).transports.set(transport.id, transport);
      
      callback({
        params: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
        }
      });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  socket.on('connectWebRtcTransport', async ({ roomId, transportId, dtlsParameters }, callback) => {
    try {
      const room = rooms.get(roomId);
      const transport = room.peers.get(socket.id).transports.get(transportId);
      await transport.connect({ dtlsParameters });
      callback({ success: true });
    } catch (err) {
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
