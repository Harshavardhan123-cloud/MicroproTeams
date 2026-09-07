import { useEffect, useRef, useState, useCallback } from 'react';
import { Device } from 'mediasoup-client';
import { io, Socket } from 'socket.io-client';
import { getToken } from '../utils/token';
import { getTargetHostUrl } from '../api/client';

export const useMediasoup = (
  localStream: MediaStream | null,
  conversationId: string | null,
  callState: string,
  userName?: string
) => {
  const [remoteStreams, setRemoteStreams] = useState<{ participantId: string; userName: string; stream: MediaStream; kind: string }[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const producersRef = useRef<Map<string, any>>(new Map()); // kind -> producer
  const consumersRef = useRef<Map<string, any>>(new Map()); // id -> consumer

  const isSetupRef = useRef(false);
  const targetRoomId = conversationId || 'direct-call-room';

  const request = useCallback((type: string, data: any = {}) => {
    return new Promise<any>((resolve, reject) => {
      if (!socketRef.current) return reject('No socket');
      socketRef.current.emit(type, data, (res: any) => {
        if (res?.error) reject(res.error);
        else resolve(res);
      });
    });
  }, []);

  const consumeRemoteTrack = useCallback(async (producerId: string, peerId: string, peerUserName: string, kind: string) => {
    try {
      if (!deviceRef.current || !recvTransportRef.current) return;
      if (Array.from(consumersRef.current.values()).some((c: any) => c.producerId === producerId)) return;

      const { rtpCapabilities } = deviceRef.current;
      const data = await request('consume', {
        roomId: targetRoomId,
        transportId: recvTransportRef.current.id,
        producerId,
        rtpCapabilities
      });
      
      const consumer = await recvTransportRef.current.consume({
        id: data.params.id,
        producerId: data.params.producerId,
        kind: data.params.kind,
        rtpParameters: data.params.rtpParameters
      });
      
      consumersRef.current.set(consumer.id, consumer);
      
      const stream = new MediaStream([consumer.track]);
      
      setRemoteStreams(prev => {
        const existing = prev.findIndex(s => s.participantId === peerId && s.kind === kind);
        if (existing !== -1) {
          const next = [...prev];
          next[existing] = { participantId: peerId, userName: peerUserName, stream, kind };
          return next;
        }
        return [...prev, { participantId: peerId, userName: peerUserName, stream, kind }];
      });

      await request('resumeConsumer', { roomId: targetRoomId, consumerId: consumer.id });
      try {
        await consumer.resume();
      } catch (clientResumeErr) {
        console.warn('[Mediasoup] Client consumer resume warning:', clientResumeErr);
      }
    } catch (err) {
      console.error('[Mediasoup] Consume Error:', err);
    }
  }, [targetRoomId, request]);

  const connectAndProduce = useCallback(async () => {
    if (callState !== 'active' || isSetupRef.current) return;
    isSetupRef.current = true;

    try {
      const sfuUrl = getTargetHostUrl();
      const socket = io(sfuUrl, {
        path: '/sfu/socket.io',
        transports: ['websocket'],
        autoConnect: true,
        auth: { token: getToken() },
      });
      socketRef.current = socket;

      socket.on('connect', async () => {
        console.log('[Mediasoup] Connected to SFU Server for room:', targetRoomId);
        
        // 1. Join Room & Get Router Capabilities
        const { routerRtpCapabilities } = await request('joinRoom', {
          roomId: targetRoomId,
          userName: (userName && userName !== 'Participant' && userName !== 'Teammate') ? userName : 'User'
        });
        const device = new Device();
        await device.load({ routerRtpCapabilities });
        deviceRef.current = device;

        // 2. Create Send Transport
        const sendTransportInfo = await request('createWebRtcTransport', { roomId: targetRoomId });
        const sendTransport = device.createSendTransport(sendTransportInfo.params);
        sendTransportRef.current = sendTransport;

        sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          try {
            await request('connectWebRtcTransport', {
              roomId: targetRoomId,
              transportId: sendTransport.id,
              dtlsParameters
            });
            callback();
          } catch (error) {
            errback(error as Error);
          }
        });

        sendTransport.on('produce', async (parameters, callback, errback) => {
          try {
            const { id } = await request('produce', {
              roomId: targetRoomId,
              transportId: sendTransport.id,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
              appData: parameters.appData
            });
            callback({ id });
          } catch (error) {
            errback(error as Error);
          }
        });

        // 3. Create Receive Transport
        const recvTransportInfo = await request('createWebRtcTransport', { roomId: targetRoomId });
        const recvTransport = device.createRecvTransport(recvTransportInfo.params);
        recvTransportRef.current = recvTransport;

        recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          try {
            await request('connectWebRtcTransport', {
              roomId: targetRoomId,
              transportId: recvTransport.id,
              dtlsParameters
            });
            callback();
          } catch (error) {
            errback(error as Error);
          }
        });

        // 4. Produce Local Tracks
        if (localStream) {
          for (const track of localStream.getTracks()) {
            try {
              const producer = await sendTransport.produce({ track });
              producersRef.current.set(track.kind, producer);
            } catch (pErr) {
              console.warn('[Mediasoup] Local track produce warning:', pErr);
            }
          }
        }

        // 5. Consume Existing Producers
        try {
          const existingProducers = await request('getProducers', { roomId: targetRoomId });
          for (const p of existingProducers) {
            consumeRemoteTrack(p.producerId, p.peerId, (p.userName && p.userName !== 'Participant' && p.userName !== 'Teammate') ? p.userName : 'User', p.kind);
          }
        } catch (e) {}
      });

      // Handle new producers dynamically
      socket.on('newProducer', ({ producerId, peerId, userName, kind }) => {
        consumeRemoteTrack(producerId, peerId, (userName && userName !== 'Participant' && userName !== 'Teammate') ? userName : 'User', kind);
      });

      // Handle peer/consumer closures
      socket.on('peerClosed', ({ peerId }) => {
        setRemoteStreams(prev => prev.filter(s => s.participantId !== peerId));
      });
      
      socket.on('consumerClosed', ({ consumerId }) => {
        const consumer = consumersRef.current.get(consumerId);
        if (consumer) {
          consumer.close();
          consumersRef.current.delete(consumerId);
        }
      });

      socket.on('disconnect', (reason) => {
        console.warn('[Mediasoup] Socket disconnected:', reason);
      });

      socket.io.on('reconnect', async () => {
        try {
          await request('joinRoom', { roomId: targetRoomId, userName: (userName && userName !== 'Participant' && userName !== 'Teammate') ? userName : 'User' });
          const existingProducers = await request('getProducers', { roomId: targetRoomId });
          for (const p of existingProducers) {
            consumeRemoteTrack(p.producerId, p.peerId, (p.userName && p.userName !== 'Participant' && p.userName !== 'Teammate') ? p.userName : 'User', p.kind);
          }
        } catch (err) {
          console.error('[Mediasoup] Resync error:', err);
        }
      });

    } catch (err) {
      console.error('[Mediasoup] Setup Error:', err);
      isSetupRef.current = false;
    }
  }, [targetRoomId, callState, localStream, userName, request, consumeRemoteTrack]);

  // Hot-swap or produce tracks dynamically if localStream updates
  useEffect(() => {
    if (!localStream || !sendTransportRef.current) return;
    
    localStream.getTracks().forEach(async track => {
      const producer = producersRef.current.get(track.kind);
      if (producer && producer.track !== track) {
        producer.replaceTrack({ track }).catch((e: any) => console.error(e));
      } else if (!producer && sendTransportRef.current) {
        try {
          const p = await sendTransportRef.current.produce({ track });
          producersRef.current.set(track.kind, p);
        } catch (e) {}
      }
    });
  }, [localStream]);

  // Periodic resync polling to ensure no remote producer is ever missed
  useEffect(() => {
    if (callState !== 'active' || !socketRef.current) return;
    const interval = setInterval(async () => {
      try {
        if (socketRef.current?.connected && recvTransportRef.current) {
          const existingProducers = await request('getProducers', { roomId: targetRoomId });
          for (const p of existingProducers) {
            consumeRemoteTrack(p.producerId, p.peerId, (p.userName && p.userName !== 'Participant' && p.userName !== 'Teammate') ? p.userName : 'User', p.kind);
          }
        }
      } catch (e) {}
    }, 2000);
    return () => clearInterval(interval);
  }, [callState, targetRoomId, request, consumeRemoteTrack]);

  useEffect(() => {
    connectAndProduce();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      isSetupRef.current = false;
      producersRef.current.forEach(p => p.close());
      consumersRef.current.forEach(c => c.close());
      if (sendTransportRef.current) sendTransportRef.current.close();
      if (recvTransportRef.current) recvTransportRef.current.close();
      setRemoteStreams([]);
    };
  }, [connectAndProduce]);

  return { remoteStreams };
};
