import { useEffect, useState, useRef, useCallback } from 'react';
import { wsService } from '../services/websocketService';
import { useWebSocket } from './useWebSocket';
import { CallUser } from '../stores/callStore';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export const useWebRTCMesh = (
  localStream: MediaStream | null,
  isHost: boolean,
  conversationId: string | null,
  callState: 'idle' | 'incoming' | 'outgoing' | 'active',
  currentUser: CallUser | null
) => {
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const addRemoteStream = useCallback((userId: string, stream: MediaStream) => {
    setRemoteStreams((prev) => {
      const newMap = new Map(prev);
      newMap.set(userId, stream);
      return newMap;
    });
  }, []);

  const removeRemoteStream = useCallback((userId: string) => {
    setRemoteStreams((prev) => {
      const newMap = new Map(prev);
      newMap.delete(userId);
      return newMap;
    });
    const pc = peerConnections.current.get(userId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(userId);
    }
  }, []);

  const initPeerConnection = useCallback((targetUserId: string) => {
    if (peerConnections.current.has(targetUserId)) {
      return peerConnections.current.get(targetUserId)!;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current.set(targetUserId, pc);
    pendingCandidates.current.set(targetUserId, []);

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        addRemoteStream(targetUserId, event.streams[0]);
      } else {
        const inboundStream = new MediaStream();
        inboundStream.addTrack(event.track);
        addRemoteStream(targetUserId, inboundStream);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsService.send({
          type: 'webrtc_ice_candidate',
          target_user_id: targetUserId,
          candidate: event.candidate
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        removeRemoteStream(targetUserId);
      }
    };

    return pc;
  }, [localStream, addRemoteStream, removeRemoteStream]);

  const handleWebRTCEvent = useCallback(async (event: any) => {
    if (callState !== 'active') return;

    try {
      const senderId = event.sender_user_id;

      if (event.type === 'mesh_join' && senderId !== currentUser?.id) {
        // Deterministic Glare Resolution: Only the user with the greater ID initiates the offer.
        // This guarantees only ONE peer creates the offer, preventing 'InvalidStateError'.
        if (currentUser?.id && currentUser.id > senderId) {
          const pc = initPeerConnection(senderId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsService.send({
            type: 'webrtc_offer',
            target_user_id: senderId,
            sdp: offer
          });
        }
      }
      else if (event.type === 'webrtc_offer' && event.sdp) {
        // We received an offer, we must answer it
        const pc = initPeerConnection(senderId);
        await pc.setRemoteDescription(new RTCSessionDescription(event.sdp));
        
        const candidates = pendingCandidates.current.get(senderId) || [];
        while (candidates.length) {
          const candidate = candidates.shift();
          if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        wsService.send({
          type: 'webrtc_answer',
          target_user_id: senderId,
          sdp: answer
        });
      }
      else if (event.type === 'webrtc_answer' && event.sdp) {
        const pc = peerConnections.current.get(senderId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(event.sdp));
        }
      }
      else if (event.type === 'webrtc_ice_candidate' && event.candidate) {
        const pc = peerConnections.current.get(senderId);
        if (pc) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(event.candidate));
          } else {
            pendingCandidates.current.get(senderId)?.push(event.candidate);
          }
        }
      }
      else if (event.type === 'mesh_leave') {
        removeRemoteStream(senderId);
      }
    } catch (err) {
      console.error('Mesh WebRTC Event Error:', err);
    }
  }, [callState, currentUser?.id, initPeerConnection, removeRemoteStream]);

  useWebSocket(conversationId || undefined, handleWebRTCEvent);

  useEffect(() => {
    if (callState === 'active' && conversationId) {
      // Broadcast that we have joined the mesh
      wsService.send({
        type: 'mesh_join',
        conversation_id: conversationId
      });
    }

    if (callState === 'idle') {
      // Cleanup all connections
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      pendingCandidates.current.clear();
      setRemoteStreams(new Map());
    }
  }, [callState, conversationId]);

  useEffect(() => {
    if (!localStream) return;
    peerConnections.current.forEach(pc => {
      const senders = pc.getSenders();
      localStream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track?.kind === track.kind);
        if (sender && sender.track !== track) {
          sender.replaceTrack(track).catch(err => console.error('Failed to replace track:', err));
        }
      });
    });
  }, [localStream]);

  return { remoteStreams };
};
