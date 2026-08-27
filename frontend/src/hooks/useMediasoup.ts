import { useEffect, useRef, useState, useCallback } from 'react';
import { Device } from 'mediasoup-client';
import { io, Socket } from 'socket.io-client';

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

  const request = useCallback((type: string, data: any = {}) => {
    return new Promise<any>((resolve, reject) => {
      if (!socketRef.current) return reject('No socket');
      socketRef.current.emit(type, data, (res: any) => {
        if (res.error) reject(res.error);
        else resolve(res);
      });
    });
  }, []);

  const connectAndProduce = useCallback(async () => {
    if (!conversationId || callState !== 'active' || isSetupRef.current) return;
    isSetupRef.current = true;

    try {
      // Connect to Mediasoup SFU Node.js Server via Vite SSL reverse proxy
      const sfuUrl = window.location.origin;
      const socket = io(sfuUrl, {
        path: '/sfu/socket.io',
        transports: ['websocket'],
        autoConnect: true,
      });
      socketRef.current = socket;

      socket.on('connect', async () => {
        console.log('[Mediasoup] Connected to SFU Server');
        
        // 1. Join Room & Get Router Capabilities
        const { routerRtpCapabilities } = await request('joinRoom', {
          roomId: conversationId,
          userName: userName || 'Participant'
        });
        const device = new Device();
        await device.load({ routerRtpCapabilities });
        deviceRef.current = device;

        // 2. Create Send Transport
        const sendTransportInfo = await request('createWebRtcTransport', { roomId: conversationId });
        const sendTransport = device.createSendTransport(sendTransportInfo.params);
        sendTransportRef.current = sendTransport;

        sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          try {
            await request('connectWebRtcTransport', {
              roomId: conversationId,
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
              roomId: conversationId,
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
        const recvTransportInfo = await request('createWebRtcTransport', { roomId: conversationId });
        const recvTransport = device.createRecvTransport(recvTransportInfo.params);
        recvTransportRef.current = recvTransport;

        recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          try {
            await request('connectWebRtcTransport', {
              roomId: conversationId,
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
            const producer = await sendTransport.produce({ track });
            producersRef.current.set(track.kind, producer);
          }
        }

        // 5. Consume Existing Producers
        const existingProducers = await request('getProducers', { roomId: conversationId });
        for (const p of existingProducers) {
          consumeRemoteTrack(p.producerId, p.peerId, p.userName || 'Participant', p.kind);
        }
      });

      // Handle new producers dynamically
      socket.on('newProducer', ({ producerId, peerId, userName, kind }) => {
        consumeRemoteTrack(producerId, peerId, userName || 'Participant', kind);
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
          // Note: Full stream removal handled by peerClosed for simplicity, 
          // or we could filter track by track.
        }
      });

      // Handle disconnect / reconnect resync
      socket.on('disconnect', (reason) => {
        console.warn('[Mediasoup] Socket disconnected:', reason);
      });

      socket.io.on('reconnect', async () => {
        console.log('[Mediasoup] Socket reconnected! Resynchronizing room state...');
        try {
          // Re-join room
          await request('joinRoom', { roomId: conversationId, userName: userName || 'Participant' });
          // Fetch active producers snapshot to resync missed tracks
          const existingProducers = await request('getProducers', { roomId: conversationId });
          for (const p of existingProducers) {
            consumeRemoteTrack(p.producerId, p.peerId, p.userName || 'Participant', p.kind);
          }
        } catch (err) {
          console.error('[Mediasoup] Resync after reconnect failed:', err);
        }
      });

    } catch (err) {
      console.error('[Mediasoup] Setup Error:', err);
      isSetupRef.current = false;
    }
  }, [conversationId, callState, localStream, userName, request]);

  const consumeRemoteTrack = async (producerId: string, peerId: string, peerUserName: string, kind: string) => {
    try {
      if (!deviceRef.current || !recvTransportRef.current) {
        console.warn('[Mediasoup] Device or recvTransport not ready yet for producer:', producerId);
        return;
      }
      const { rtpCapabilities } = deviceRef.current;
      const data = await request('consume', {
        roomId: conversationId,
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
        // Replace existing track of same kind for this peer, or add new stream
        const existing = prev.findIndex(s => s.participantId === peerId && s.kind === kind);
        if (existing !== -1) {
          const next = [...prev];
          next[existing] = { participantId: peerId, userName: peerUserName, stream, kind };
          return next;
        }
        return [...prev, { participantId: peerId, userName: peerUserName, stream, kind }];
      });

      await request('resumeConsumer', { roomId: conversationId, consumerId: consumer.id });
    } catch (err) {
      console.error('[Mediasoup] Consume Error:', err);
    }
  };

  // Hot-swap tracks if localStream changes (e.g. Screen Share)
  useEffect(() => {
    if (!localStream || !sendTransportRef.current || !isSetupRef.current) return;
    
    localStream.getTracks().forEach(track => {
      const producer = producersRef.current.get(track.kind);
      if (producer && producer.track !== track) {
        producer.replaceTrack({ track }).catch((e: any) => console.error(e));
      } else if (!producer) {
        // If it's a new kind of track
        sendTransportRef.current.produce({ track }).then((p: any) => producersRef.current.set(track.kind, p));
      }
    });
  }, [localStream]);

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
