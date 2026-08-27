import { useEffect, useState, useRef, useCallback } from 'react';
import { wsService } from '../services/websocketService';
import { useWebSocket } from './useWebSocket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export const useWebRTCPeer = (
  localStream: MediaStream | null,
  isCaller: boolean,
  targetUserId: string | null,
  callState: 'idle' | 'incoming' | 'outgoing' | 'active'
) => {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const initPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    // Add local tracks to peer connection
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      } else {
        const inboundStream = new MediaStream();
        inboundStream.addTrack(event.track);
        setRemoteStream(inboundStream);
      }
    };

    // Send ICE candidates to remote peer
    pc.onicecandidate = (event) => {
      if (event.candidate && targetUserId) {
        wsService.send({
          type: 'webrtc_ice_candidate',
          target_user_id: targetUserId,
          candidate: event.candidate
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', pc.iceConnectionState);
    };

    return pc;
  }, [localStream, targetUserId]);

  const startCallAsCaller = useCallback(async () => {
    const pc = initPeerConnection();
    if (!pc || !targetUserId) return;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsService.send({
        type: 'webrtc_offer',
        target_user_id: targetUserId,
        sdp: offer
      });
    } catch (err) {
      console.error('Error creating WebRTC offer:', err);
    }
  }, [initPeerConnection, targetUserId]);

  const handleWebRTCEvent = useCallback(async (event: any) => {
    if (!peerConnectionRef.current) return;
    const pc = peerConnectionRef.current;

    try {
      if (event.type === 'webrtc_offer' && event.sdp) {
        // If we receive an offer, we must answer it
        await pc.setRemoteDescription(new RTCSessionDescription(event.sdp));
        
        // Add any pending candidates that arrived before the offer
        while (pendingCandidates.current.length) {
          const candidate = pendingCandidates.current.shift();
          if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        wsService.send({
          type: 'webrtc_answer',
          target_user_id: event.sender_user_id,
          sdp: answer
        });
      } else if (event.type === 'webrtc_answer' && event.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(event.sdp));
      } else if (event.type === 'webrtc_ice_candidate' && event.candidate) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(event.candidate));
        } else {
          // Queue candidates if remote description isn't set yet
          pendingCandidates.current.push(event.candidate);
        }
      }
    } catch (err) {
      console.error('WebRTC Event Error:', err);
    }
  }, []);

  useWebSocket(undefined, handleWebRTCEvent);

  // Initialize WebRTC negotiation when the call becomes active
  useEffect(() => {
    if (callState === 'active') {
      initPeerConnection();
      if (isCaller) {
        startCallAsCaller();
      }
    }
    // Cleanup on call end
    if (callState === 'idle') {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      setRemoteStream(null);
      pendingCandidates.current = [];
    }
  }, [callState, initPeerConnection, isCaller, startCallAsCaller]);

  return { remoteStream };
};
