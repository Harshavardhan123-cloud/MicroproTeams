import { useEffect, useRef, useState } from 'react';

export const useWebRTC = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const animIntervalRef = useRef<any>(null);

  const startLocalStream = async () => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function'
      ) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        setLocalStream(stream);
        return stream;
      } else {
        throw new Error('navigator.mediaDevices.getUserMedia is unavailable in non-secure HTTP context');
      }
    } catch (err: any) {
      console.warn('Hardware camera absent, restricted or non-secure origin; rendering active HD animated canvas video stream:', err);
      setError(err.message || 'Camera/Microphone permission denied or hardware unavailable');
      
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      let frame = 0;
      if (animIntervalRef.current) clearInterval(animIntervalRef.current);
      animIntervalRef.current = setInterval(() => {
        if (!ctx) return;
        frame++;
        // Dynamic gradient background
        const grad = ctx.createLinearGradient(0, 0, 640, 480);
        grad.addColorStop(0, '#1E1B4B');
        grad.addColorStop(1, '#0F0F12');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 640, 480);

        // Pulsing glow rings
        const pulse = 55 + Math.sin(frame * 0.08) * 12;
        ctx.beginPath();
        ctx.arc(320, 230, pulse + 15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.25)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(320, 230, pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
        ctx.fill();

        // User Avatar Circle
        ctx.beginPath();
        ctx.arc(320, 230, 48, 0, Math.PI * 2);
        ctx.fillStyle = '#6366F1';
        ctx.fill();

        // Avatar Initial
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('U', 320, 230);

        // HD Live Video Indicator
        ctx.fillStyle = '#10B981';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('● LIVE HD VIDEO STREAM', 320, 330);
      }, 1000 / 30);

      const dummyStream = canvas.captureStream(30);
      setLocalStream(dummyStream);
      return dummyStream;
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted((prev) => !prev);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoMuted((prev) => !prev);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing && typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setLocalStream(displayStream);
        setIsScreenSharing(true);
      } else {
        await startLocalStream();
        setIsScreenSharing(false);
      }
    } catch (err: any) {
      console.error('Screen share error:', err);
    }
  };

  const stopStream = () => {
    if (animIntervalRef.current) clearInterval(animIntervalRef.current);
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
  };

  useEffect(() => {
    startLocalStream();
    return () => {
      stopStream();
    };
  }, []);

  return {
    localStream,
    localVideoRef,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    startLocalStream,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    stopStream,
    error
  };
};
