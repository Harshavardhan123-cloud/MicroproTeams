import React, { useEffect, useState, useRef, useCallback } from 'react';
import { saveRecording } from '../../services/localRecordingStore';
import { Phone, Video, Mic, MicOff, VideoOff, PhoneOff, Shield, Volume2, AlertCircle, MessageSquare, Hand, Smile, Send, MonitorUp, Sliders, Pin, PinOff, RotateCcw, RefreshCw, UserPlus, Users, Minimize2, Maximize2, Circle, Sparkles, FileText, Bot, X, GripVertical, Bell, BellOff, Image, Paperclip } from 'lucide-react';
import { useDraggable } from '../../hooks/useDraggable';
import { useCallStore } from '../../stores/callStore';
import { useUIStore } from '../../stores/uiStore';
import { wsService } from '../../services/websocketService';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAuthStore } from '../../stores/authStore';
import { apiClient, getMediaUrl } from '../../api/client';
import { DeviceSettingsModal } from '../modals/DeviceSettingsModal';
import { AddParticipantModal } from '../modals/AddParticipantModal';
import { RemoteParticipantStream, meetingWebRTCManager } from '../../services/MeetingWebRTCManager';
import { MeetingSummaryView } from '../../features/meeting-ai/MeetingSummary';
import { ActionItemsView } from '../../features/meeting-ai/ActionItems';
import { TranscriptView } from '../../features/transcripts/TranscriptView';
import { MeetingAssistantPanel } from '../../features/meeting-ai/MeetingAssistant';
import { TranscriptSegment, MeetingSummary, ActionItem } from '../../types/meetingAI';
import { UserAvatar } from '../common/UserAvatar';
import { MediaAnnotationModal, MediaAnnotationResult } from '../chat/MediaAnnotationModal';

interface RemoteVideoTileProps {
  streamObj?: RemoteParticipantStream;
  userId?: string;
  defaultDisplayName: string;
  remoteStreams: RemoteParticipantStream[];
  isHandRaised: boolean;
  selectedSpeakerId?: string;
  isPinned?: boolean;
  onPinToggle?: () => void;
}

// Global persistent audio player component to guarantee remote audio playback across all layouts
const GlobalAudioPlayer: React.FC<{ stream: MediaStream; selectedSpeakerId?: string }> = ({ stream, selectedSpeakerId }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !stream) return;

    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }

    const playAudio = async () => {
      if (selectedSpeakerId && selectedSpeakerId !== 'default' && (el as any).setSinkId) {
        try { await (el as any).setSinkId(selectedSpeakerId); } catch (e) {}
      }
      try {
        await el.play();
      } catch (err: any) {
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          console.warn('[AUDIO] Global audio play attempt warning:', err);
        }
      }
    };

    playAudio();
  }, [stream, selectedSpeakerId]);

  return <audio ref={audioRef} autoPlay playsInline controls={false} style={{ display: 'none' }} />;
};

// Hook: measure microphone volume level (0–1) using Web Audio AnalyserNode
function useMicLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  const animRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(1, avg / 80)); // normalise 0–80 → 0–1
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    } catch (e) {
      // ignore — Web Audio not available
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      try { ctxRef.current?.close(); } catch (e) {}
      analyserRef.current = null;
      ctxRef.current = null;
    };
  }, [stream]);

  return level;
}

const RemoteVideoTile: React.FC<RemoteVideoTileProps> = ({
  streamObj,
  userId,
  defaultDisplayName,
  remoteStreams,
  isHandRaised,
  selectedSpeakerId,
  isPinned,
  onPinToggle
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const videoStream = streamObj?.kind === 'video' ? streamObj.stream : null;
  const audioStream = streamObj?.kind === 'audio'
    ? streamObj.stream
    : remoteStreams.find(s => s.participantId === (streamObj?.participantId || userId) && s.kind === 'audio')?.stream;

  const rawPeerName = streamObj?.userName || defaultDisplayName;
  const peerUserName = (rawPeerName && rawPeerName !== 'Participant' && rawPeerName !== 'Teammate')
    ? rawPeerName
    : 'User';
  const hasVideoTrack = videoStream && videoStream.getVideoTracks().length > 0 && videoStream.getVideoTracks()[0].enabled;
  const isScreenShare = streamObj?.source === 'screen';

  // Remote video attachment
  useEffect(() => {
    if (videoRef.current && videoStream) {
      if (videoRef.current.srcObject !== videoStream) {
        videoRef.current.srcObject = videoStream;
      }
      videoRef.current.play().catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('[MEDIA] Remote video playback warning:', err);
        }
      });
    }
  }, [videoStream]);

  // Remote audio attachment + immediate play + speaker routing
  // CRITICAL FIX: both srcObject assignment AND play() happen in same effect
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioStream) return;

    if (el.srcObject !== audioStream) {
      el.srcObject = audioStream;
    }

    const applySpeaker = async () => {
      if (selectedSpeakerId && selectedSpeakerId !== 'default' && (el as any).setSinkId) {
        try { await (el as any).setSinkId(selectedSpeakerId); } catch (err) {
          console.warn('[MEDIA] setSinkId error:', err);
        }
      }
      el.play().catch((err) => {
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          console.warn('[MEDIA] Remote audio playback warning:', err);
        }
      });
    };
    applySpeaker();
  }, [audioStream, selectedSpeakerId]);

  return (
    <div 
      className={`relative w-full h-full bg-[#18181C] rounded-2xl overflow-hidden border shadow-xl flex items-center justify-center min-h-[160px] group transition-all ${
        isPinned 
          ? 'border-amber-400/80 ring-2 ring-amber-400/30' 
          : isHandRaised 
          ? 'border-amber-500/80 ring-2 ring-amber-500/20' 
          : 'border-teams-purple/40 hover:border-teams-purple'
      }`}
    >
      {hasVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full ${isScreenShare ? 'object-contain bg-black' : 'object-cover bg-black'}`}
        />
      ) : (
        <div className="flex flex-col items-center justify-center space-y-3 p-4 animate-in fade-in duration-200">
          <UserAvatar
            name={peerUserName}
            size="xl"
            showStatus={true}
            status="available"
          />
          <div className="text-center space-y-0.5">
            <h4 className="text-xs font-bold text-white line-clamp-1">{peerUserName}</h4>
            <p className="text-[10px] text-teams-purple font-medium">Mediasoup Audio & Video</p>
          </div>
        </div>
      )}

      {/* Hidden audio element - always rendered so it persists through renders */}
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        style={{ display: 'none' }}
      />

      {/* Pin Overlay Button */}
      {onPinToggle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPinToggle();
          }}
          className={`absolute top-3 right-3 p-1.5 rounded-lg backdrop-blur z-20 transition-all ${
            isPinned 
              ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/40' 
              : 'bg-black/60 text-white/70 hover:text-white hover:bg-black/90 opacity-0 group-hover:opacity-100'
          }`}
          title={isPinned ? 'Unpin from Stage' : 'Pin to Main Stage'}
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>
      )}

      <div data-theme-preserve="dark" className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/80 rounded-lg text-xs font-bold text-white backdrop-blur flex items-center gap-2 z-10 border border-white/10 max-w-[85%]">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span className="truncate">{peerUserName} {isScreenShare ? '(Screen Share)' : ''}</span>
        {isHandRaised && <Hand className="w-4 h-4 text-amber-400 animate-bounce ml-1 shrink-0" />}
      </div>
    </div>
  );
};

export const FullscreenCallOverlay: React.FC = () => {
  const {
    callState,
    callType,
    caller,
    recipient,
    isCaller,
    isGroupCall,
    conversationId,
    acceptCall,
    declineCall,
    endCall,
    isCallMinimized,
    setIsCallMinimized
  } = useCallStore();

  const { user } = useAuthStore();
  const currentUser = user 
    ? { 
        id: user.id, 
        name: user.display_name || (user as any).name || (user as any).username || (user as any).email?.split('@')[0] || 'User', 
        avatar: user.avatar_url 
      } 
    : null;
  const targetUser = isCaller ? recipient : caller;
  const rawName = targetUser?.name;
  const displayName: string = (rawName && rawName !== 'Teammate' && rawName !== 'Participant') ? rawName : 'User';

  const callStarter = isCaller ? (caller || currentUser) : caller;
  const callStarterName: string = callStarter?.name || (isCaller ? (currentUser?.name || 'Caller') : 'Caller');

  const [callDuration, setCallDuration] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isDeviceSettingsOpen, setIsDeviceSettingsOpen] = useState(false);
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [notifyParticipantsOfRecording, setNotifyParticipantsOfRecording] = useState(true);
  const [remoteRecordingState, setRemoteRecordingState] = useState<{ isRecording: boolean; recordedBy: string } | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
  const [showHostEndModal, setShowHostEndModal] = useState(false);
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);
  const [disconnectTimer, setDisconnectTimer] = useState(20);
  const [chatMessages, setChatMessages] = useState<{ id: string; senderName: string; text: string; imageUrl?: string; isViewOnce?: boolean }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAnnotationOpen, setIsAnnotationOpen] = useState(false);
  const [annotationMedia, setAnnotationMedia] = useState<File | string | null>(null);
  const [annotationInitialCaption, setAnnotationInitialCaption] = useState('');
  const chatImageInputRef = useRef<HTMLInputElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [activeReactions, setActiveReactions] = useState<{ id: string, emoji: string, x: number }[]>([]);
  const [pinnedProducerId, setPinnedProducerId] = useState<string | null>(null);
  const miniDraggable = useDraggable();

  // MediaRecorder Call Recording Engine
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<any>(null);
  const recordAnimFrameRef = useRef<number | null>(null);
  const recordAudioCtxRef = useRef<AudioContext | null>(null);

  // Transcript & Speaker Diarization State (populated after recording stops)
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [transcriptFullText, setTranscriptFullText] = useState<string>('');
  const [transcriptStatus, setTranscriptStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');

  const formatRecordingTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const createCompositeStream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    // Web Audio mixing for all audio tracks (local mic + remote peers)
    let audioTracks: MediaStreamTrack[] = [];
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const actx = new AudioCtx();
        recordAudioCtxRef.current = actx;
        const dest = actx.createMediaStreamDestination();
        let connectedAudio = false;

        if (localStream && localStream.getAudioTracks().length > 0) {
          try {
            const src = actx.createMediaStreamSource(new MediaStream([localStream.getAudioTracks()[0]]));
            src.connect(dest);
            connectedAudio = true;
          } catch (e) {}
        }
        if (remoteStreams && remoteStreams.length > 0) {
          remoteStreams.forEach(rs => {
            if (rs.stream && rs.stream.getAudioTracks().length > 0) {
              try {
                const src = actx.createMediaStreamSource(new MediaStream([rs.stream.getAudioTracks()[0]]));
                src.connect(dest);
                connectedAudio = true;
              } catch (e) {}
            }
          });
        }
        if (connectedAudio) {
          audioTracks = dest.stream.getAudioTracks();
        }
      }
    } catch (e) {
      console.warn('Audio mixing warning:', e);
    }

    if (audioTracks.length === 0) {
      if (localStream && localStream.getAudioTracks().length > 0) {
        audioTracks.push(localStream.getAudioTracks()[0]);
      }
      if (remoteStreams) {
        remoteStreams.forEach(rs => {
          if (rs.stream && rs.stream.getAudioTracks().length > 0) {
            audioTracks.push(rs.stream.getAudioTracks()[0]);
          }
        });
      }
    }

    // Dynamic video frame rendering loop
    const draw = () => {
      if (!ctx) return;
      ctx.fillStyle = '#141416';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Find all active video elements rendering in the call interface
      const videoEls = Array.from(document.querySelectorAll('video')).filter(
        v => v.readyState >= 2 && !v.paused && v.videoWidth > 0
      );

      if (videoEls.length > 0) {
        if (videoEls.length === 1) {
          ctx.drawImage(videoEls[0], 0, 0, canvas.width, canvas.height);
        } else if (videoEls.length === 2) {
          const w = canvas.width / 2;
          ctx.drawImage(videoEls[0], 0, 0, w, canvas.height);
          ctx.drawImage(videoEls[1], w, 0, w, canvas.height);
        } else {
          const cols = 2;
          const rows = Math.ceil(Math.min(videoEls.length, 4) / cols);
          const w = canvas.width / cols;
          const h = canvas.height / rows;
          for (let i = 0; i < Math.min(videoEls.length, 4); i++) {
            const r = Math.floor(i / cols);
            const c = i % cols;
            ctx.drawImage(videoEls[i], c * w, r * h, w, h);
          }
        }
      } else {
        // Fallback banner card if video tracks are muted or unrendered
        ctx.fillStyle = '#1E1E24';
        ctx.fillRect(80, 80, canvas.width - 160, canvas.height - 160);
        ctx.fillStyle = '#6366F1';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MicroproTeams Call Session', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = '#94A3B8';
        ctx.font = '20px sans-serif';
        ctx.fillText(`Host: ${currentUser?.name || 'Meeting Host'}`, canvas.width / 2, canvas.height / 2 + 20);
      }

      recordAnimFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    const canvasStream = canvas.captureStream(30);
    const vTrack = canvasStream.getVideoTracks()[0];

    return new MediaStream([vTrack, ...audioTracks]);
  };

  const startCallRecording = async () => {
    if (!isCaller) {
      setToastMessage('⚠️ Only the meeting host can record this meeting.');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }
    try {
      recordedChunksRef.current = [];
      const captureStream = createCompositeStream();

      // Pick best supported mimeType for video recording
      const mimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'audio/webm;codecs=opus',
        'audio/webm',
      ].find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

      const recorder = new MediaRecorder(captureStream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      const capturedDurationRef = { current: 0 };

      recorder.onstop = async () => {
        const dur = capturedDurationRef.current;
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          setToastMessage('Recording failed — no data captured.');
          setTimeout(() => setToastMessage(null), 4000);
          return;
        }
        try {
          await saveRecording({
            blob,
            mimeType,
            meetingId: conversationId || displayName || 'Call Session',
            durationSeconds: dur,
          });
          setToastMessage('✅ Recording saved! Generating transcript…');
        } catch (e) {
          setToastMessage('Recording captured but could not be saved.');
        }
        setTimeout(() => setToastMessage(null), 5000);

        // Trigger Speech Intelligence API for transcript + speaker diarization
        // Results populate the Transcript panel in the AI Drawer.
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const recFilename = `Micropro_Recording_${timestamp}.webm`;
        setTranscriptStatus('processing');
        setActiveDrawer('transcript'); // Auto-open transcript panel
        try {
          const { meetingAIService } = await import('../../services/meetingAIService');
          const result = await meetingAIService.transcribeWithDiarization(
            blob,
            recFilename,
            mimeType,
            (status) => setToastMessage(`🎙️ ${status}`)
          );
          const segments = meetingAIService.toTranscriptSegments(result);
          setTranscriptSegments(segments);
          setTranscriptFullText(result.full_text);
          setTranscriptStatus('done');
          setToastMessage(`✅ Transcript ready — ${segments.length} speaker segments, ${result.speaker_count ?? '?'} speakers`);
        } catch (err: any) {
          console.warn('[SpeechAPI] Diarization error:', err?.message || err);
          setTranscriptStatus('error');
          setToastMessage('⚠️ Transcript unavailable — Speech API may be offline.');
        }
        setTimeout(() => setToastMessage(null), 5000);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        capturedDurationRef.current += 1;
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

      // Broadcast recording state to all participants in meeting
      const targetRoom = conversationId || 'direct-call-room';
      const hostName = currentUser?.name || user?.display_name || user?.username || 'Host';
      wsService.send({
        type: 'recording_state_change',
        conversation_id: targetRoom,
        channel_id: targetRoom,
        target_user_id: targetUser?.id,
        isRecording: true,
        recordedBy: hostName,
        notifyParticipants: notifyParticipantsOfRecording
      });

      setToastMessage(
        notifyParticipantsOfRecording
          ? 'Call Recording Started 🔴 (Attendees notified)'
          : 'Call Recording Started 🔴 (Host stealth mode)'
      );
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error('Start call recording error:', err);
      setToastMessage('Failed to start recording session.');
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const toggleRecordingNotificationVisibility = () => {
    const nextVal = !notifyParticipantsOfRecording;
    setNotifyParticipantsOfRecording(nextVal);
    if (isRecording) {
      const targetRoom = conversationId || 'direct-call-room';
      const hostName = currentUser?.name || user?.display_name || user?.username || 'Host';
      wsService.send({
        type: 'recording_visibility_change',
        conversation_id: targetRoom,
        channel_id: targetRoom,
        target_user_id: targetUser?.id,
        isRecording: true,
        notifyParticipants: nextVal,
        recordedBy: hostName
      });
      setToastMessage(
        nextVal
          ? 'Attendee recording notification is now ON'
          : 'Attendee recording notification is now HIDDEN'
      );
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const stopCallRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordAnimFrameRef.current) {
      cancelAnimationFrame(recordAnimFrameRef.current);
      recordAnimFrameRef.current = null;
    }
    if (recordAudioCtxRef.current) {
      try { recordAudioCtxRef.current.close(); } catch (e) {}
      recordAudioCtxRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);

    // Broadcast recording stopped to all participants
    const targetRoom = conversationId || 'direct-call-room';
    const hostName = currentUser?.name || user?.display_name || user?.username || 'Host';
    wsService.send({
      type: 'recording_state_change',
      conversation_id: targetRoom,
      channel_id: targetRoom,
      target_user_id: targetUser?.id,
      isRecording: false,
      recordedBy: hostName,
      notifyParticipants: false
    });
  };

  const timerRef = useRef<any>(null);

  const {
    localStream,
    remoteStreams,
    meetingState,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    selectedCameraId,
    selectedMicId,
    selectedSpeakerId,
    joinMeeting,
    toggleAudio: toggleWebRTCAudio,
    toggleVideo: toggleWebRTCVideo,
    toggleScreenShare,
    changeCamera,
    changeMicrophone,
    changeSpeaker,
    leaveMeeting,
    clearError: clearWebRtcError,
    error: webRtcError
  } = useWebRTC();

  const participantIds = Array.from(new Set(remoteStreams.map(s => s.participantId)));
  const totalParticipants = participantIds.length + 1;
  const isEffectivelyGroupCall = isGroupCall || totalParticipants >= 3;

  // Display WebRTC error toasts (e.g. mic/cam permission denied or hardware errors)
  useEffect(() => {
    if (webRtcError) {
      setToastMessage(`⚠️ ${webRtcError}`);
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [webRtcError]);

  // Join Mediasoup SFU Session & WebSocket channel when call state becomes active
  useEffect(() => {
    if (callState === 'active') {
      const roomId = conversationId || 'direct-call-room';
      joinMeeting(roomId, currentUser?.name || displayName);
      wsService.send({ type: 'join_channel', channel_id: roomId });
      return () => {
        wsService.send({ type: 'leave_channel', channel_id: roomId });
      };
    }
  }, [callState, conversationId, joinMeeting, currentUser?.name, displayName]);

  // Mic level visualizer: measure local microphone volume in real-time (0-1)
  const micLevelStream = (callState === 'active' && !isAudioMuted && localStream && localStream.getAudioTracks().length > 0)
    ? localStream
    : null;
  const micLevel = useMicLevel(micLevelStream);

  // Send call invitation over WebSocket when initiating an outgoing call
  useEffect(() => {
    if (callState === 'outgoing' && recipient?.id && recipient.id !== 'target_user' && recipient.id !== 'user') {
      wsService.send({
        type: 'call_invite',
        target_user_id: recipient.id,
        conversation_id: conversationId,
        call_type: callType,
        caller_name: currentUser?.name || user?.display_name || user?.username || displayName || 'Teammate',
        caller_avatar: currentUser?.avatar || user?.avatar_url
      });
    }
  }, [callState, recipient?.id, conversationId, callType, currentUser?.name, user?.display_name, user?.username, displayName, currentUser?.avatar, user?.avatar_url]);

  // Clear unread chat notification counter when chat sidebar is opened
  useEffect(() => {
    if (isChatOpen) {
      setUnreadChatCount(0);
    }
  }, [isChatOpen]);

  // Handle incoming mesh events (chat, hand raise, reactions, recording state & end call for all)
  const handleMeshEvents = useCallback((event: any) => {
    if (event.type === 'call_chat_message' && (event.text || event.imageUrl)) {
      const isFromSelf = currentUser?.id && String(event.sender_user_id) === String(currentUser.id);
      if (!isFromSelf) {
        setChatMessages(prev => {
          if (event.msgId && prev.some(m => m.id === event.msgId)) return prev;
          return [...prev, {
            id: event.msgId || Date.now().toString(),
            senderName: event.senderName || 'Peer',
            text: event.text || '',
            imageUrl: event.imageUrl,
            isViewOnce: event.isViewOnce
          }];
        });
        if (!isChatOpen) {
          setUnreadChatCount(prev => prev + 1);
        }
      }
    }
    else if (event.type === 'call_action') {
      if (event.action === 'raise_hand') {
        const uidStr = String(event.sender_user_id);
        setRaisedHands(prev => {
          const next = new Set(prev);
          if (event.isRaised) next.add(uidStr);
          else next.delete(uidStr);
          return next;
        });
        const isSelf = currentUser?.id && String(event.sender_user_id) === String(currentUser.id);
        if (!isSelf) {
          setToastMessage(event.isRaised ? `✋ ${event.senderName || 'Participant'} raised their hand` : `✋ ${event.senderName || 'Participant'} lowered their hand`);
          setTimeout(() => setToastMessage(null), 3000);
        }
      } else if (event.action === 'reaction') {
        const reactId = Date.now().toString() + Math.random();
        setActiveReactions(prev => [...prev, { id: reactId, emoji: event.emoji, x: Math.random() * 70 + 15 }]);
        setTimeout(() => {
          setActiveReactions(prev => prev.filter(r => r.id !== reactId));
        }, 3000);
      }
    }
    else if (event.type === 'recording_state_change' || event.type === 'recording_visibility_change') {
      if (event.isRecording && event.notifyParticipants !== false) {
        setRemoteRecordingState({ isRecording: true, recordedBy: event.recordedBy || 'Host' });
        setToastMessage(`🔴 Meeting is being recorded by ${event.recordedBy || 'Host'}`);
      } else {
        setRemoteRecordingState(null);
        if (event.type === 'recording_state_change' && !event.isRecording) {
          setToastMessage('Meeting recording stopped');
        }
      }
      setTimeout(() => setToastMessage(null), 4000);
    }
    else if (event.type === 'mesh_end' || event.type === 'call_ended_for_all') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        stopCallRecording();
      }
      if (isScreenSharing) {
        meetingWebRTCManager.stopScreenShare();
      }
      leaveMeeting();
      endCall(true); // HARD TERMINATE call UI for all participants instantly!
      useUIStore.getState().setActiveMeetingId(null);
      useUIStore.getState().setIsMeetingPoppedOut(false);
      setToastMessage('Meeting was ended for all participants by the host');
      setTimeout(() => setToastMessage(null), 4000);
    }
    else if (event.type === 'call_upgrade_group') {
      useCallStore.setState({ isGroupCall: true });
    }
  }, [currentUser?.id, isChatOpen, isScreenSharing, leaveMeeting, endCall]);

  useWebSocket(undefined, handleMeshEvents);

  const localVidElRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = localVidElRef.current;
    if (!el || !localStream) return;

    if (el.srcObject !== localStream) {
      el.srcObject = localStream;
    }
    el.play().catch((err) => {
      if (err.name !== 'AbortError') {
        console.warn('Auto-play local video warning:', err);
      }
    });
  }, [localStream, callState, isVideoMuted]);

  useEffect(() => {
    const targetRoom = conversationId || 'direct-call-room';
    if (callState === 'active') {
      wsService.send({ type: 'join_channel', channel_id: targetRoom });
      wsService.send({ type: 'mesh_join', conversation_id: targetRoom, channel_id: targetRoom });

      return () => {
        wsService.send({ type: 'mesh_leave', conversation_id: targetRoom, channel_id: targetRoom });
        wsService.send({ type: 'leave_channel', channel_id: targetRoom });
      };
    }
  }, [callState, conversationId]);

  useEffect(() => {
    if (callState !== 'idle') {
      document.body.style.overflow = 'hidden';
      document.body.style.userSelect = 'auto';
    } else {
      document.body.style.overflow = 'auto';
      document.body.style.userSelect = 'auto';
      setCallDuration(0);
      setChatMessages([]);
      setRaisedHands(new Set());
      setPinnedProducerId(null);
      setUnreadChatCount(0);
      setIsAddParticipantOpen(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      document.body.style.overflow = 'auto';
      document.body.style.userSelect = 'auto';
    };
  }, [callState]);

  useEffect(() => {
    if (callState === 'active') {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Explicitly stop recording & screen share when leaving or ending call
  const handleLeaveCall = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopCallRecording();
    }
    if (isScreenSharing) {
      meetingWebRTCManager.stopScreenShare();
    }
    const targetRoom = conversationId || 'direct-call-room';
    wsService.send({ type: 'mesh_leave', conversation_id: targetRoom, channel_id: targetRoom });
    wsService.leaveChannel(targetRoom);
    leaveMeeting();
    endCall(false);
  }, [isScreenSharing, conversationId, leaveMeeting, endCall]);

  const handleEndCallForAll = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopCallRecording();
    }
    if (isScreenSharing) {
      meetingWebRTCManager.stopScreenShare();
    }
    const targetRoom = conversationId || 'direct-call-room';
    wsService.send({ type: 'mesh_end', conversation_id: targetRoom, channel_id: targetRoom });
    wsService.send({ type: 'call_ended_for_all', conversation_id: targetRoom, channel_id: targetRoom });
    wsService.leaveChannel(targetRoom);
    leaveMeeting();
    endCall(true); // Host terminated -> purge rejoin state & mini-player
  }, [isScreenSharing, conversationId, leaveMeeting, endCall]);

  // Handle Disconnect Timer
  useEffect(() => {
    if (meetingState === 'RECONNECTING') {
      setDisconnectTimer(20);
      const timer = setInterval(() => {
        setDisconnectTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [meetingState]);

  useEffect(() => {
    if (meetingState === 'RECONNECTING' && disconnectTimer <= 0) {
      handleLeaveCall();
    }
  }, [meetingState, disconnectTimer, handleLeaveCall]);

  if (callState === 'idle') return null;

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60).toString().padStart(2, '0');
    const secs = (sec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleAccept = () => {
    if (caller?.id) {
      wsService.send({ type: 'call_response', target_user_id: caller.id, status: 'accepted' });
    }
    acceptCall();
  };

  const handleDecline = () => {
    const targetId = caller?.id || recipient?.id;
    if (targetId) {
      wsService.send({ type: 'call_response', target_user_id: targetId, status: 'declined' });
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopCallRecording();
    }
    if (isScreenSharing) {
      meetingWebRTCManager.stopScreenShare();
    }
    leaveMeeting();
    declineCall();
  };



  const handleRejoinSession = () => {
    meetingWebRTCManager.resyncRemoteProducers();
    setToastMessage('Re-synchronized WebRTC media tracks');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const textToSend = chatInput.trim();
    const targetRoom = conversationId || 'direct-call-room';
    const msgId = `msg-${Date.now()}-${Math.random()}`;

    setChatMessages(prev => [...prev, { id: msgId, senderName: 'Me', text: textToSend }]);
    setChatInput('');

    wsService.send({
      type: 'call_chat_message',
      msgId,
      conversation_id: targetRoom,
      channel_id: targetRoom,
      target_user_id: targetUser?.id,
      senderName: currentUser?.name || 'Me',
      sender_user_id: currentUser?.id,
      text: textToSend
    });
  };

  const handleChatPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData || !clipboardData.items) return;
    for (const item of Array.from(clipboardData.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          setAnnotationMedia(file);
          setAnnotationInitialCaption(chatInput);
          setIsAnnotationOpen(true);
          return;
        }
      }
    }
  };

  const handleChatImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setAnnotationMedia(file);
      setAnnotationInitialCaption(chatInput);
      setIsAnnotationOpen(true);
      e.target.value = '';
    }
  };

  const handleSendAnnotatedChatMedia = async (result: MediaAnnotationResult) => {
    const targetRoom = conversationId || 'direct-call-room';
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    try {
      const formData = new FormData();
      formData.append('file', result.file);
      const uploadRes = await apiClient.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const fileData = uploadRes.data.data || uploadRes.data;
      const fileUrl = fileData.file_url || fileData.url || result.previewUrl;
      const textToSend = result.caption || '';

      const newMsg = {
        id: msgId,
        senderName: 'Me',
        text: textToSend,
        imageUrl: fileUrl,
        isViewOnce: result.isViewOnce
      };
      setChatMessages(prev => [...prev, newMsg]);
      setChatInput('');

      wsService.send({
        type: 'call_chat_message',
        msgId,
        conversation_id: targetRoom,
        channel_id: targetRoom,
        target_user_id: targetUser?.id,
        senderName: currentUser?.name || 'Me',
        sender_user_id: currentUser?.id,
        text: textToSend,
        imageUrl: fileUrl,
        isViewOnce: result.isViewOnce
      });
    } catch (err) {
      console.error('In-call media upload error:', err);
    }
  };

  const toggleHandRaise = () => {
    const selfId = String(currentUser?.id || 'local');
    const isRaised = !raisedHands.has(selfId);
    const targetRoom = conversationId || 'direct-call-room';
    setRaisedHands(prev => {
      const next = new Set(prev);
      if (isRaised) next.add(selfId);
      else next.delete(selfId);
      return next;
    });
    setToastMessage(isRaised ? '✋ You raised your hand' : '✋ Hand lowered');
    setTimeout(() => setToastMessage(null), 2500);

    wsService.send({
      type: 'call_action',
      conversation_id: targetRoom,
      channel_id: targetRoom,
      action: 'raise_hand',
      sender_user_id: selfId,
      senderName: currentUser?.name || 'Participant',
      isRaised
    });
  };

  const sendReaction = (emoji: string) => {
    const targetRoom = conversationId || 'direct-call-room';
    const newId = Date.now().toString() + Math.random();
    setActiveReactions(prev => [...prev, { id: newId, emoji, x: Math.random() * 70 + 15 }]);
    setTimeout(() => {
      setActiveReactions(prev => prev.filter(r => r.id !== newId));
    }, 3000);

    wsService.send({
      type: 'call_action',
      conversation_id: targetRoom,
      channel_id: targetRoom,
      action: 'reaction',
      sender_user_id: String(currentUser?.id || 'local'),
      senderName: currentUser?.name || 'Participant',
      emoji
    });
  };

  const renderVideoGrid = () => {
    const remoteScreenStreams = remoteStreams.filter(s => s.kind === 'video' && s.source === 'screen');
    const hasScreenSharing = isScreenSharing || remoteScreenStreams.length > 0;

    // Featured Screen Share Stage layout
    if (hasScreenSharing) {
      let activePinnedStream: RemoteParticipantStream | null = null;
      let isLocalPinned = false;

      if (pinnedProducerId === 'local_screen' && isScreenSharing) {
        isLocalPinned = true;
      } else if (pinnedProducerId) {
        activePinnedStream = remoteScreenStreams.find(s => s.producerId === pinnedProducerId) || null;
      }

      // Default selection if no specific stream pinned
      if (!activePinnedStream && !isLocalPinned) {
        if (remoteScreenStreams.length > 0) {
          activePinnedStream = remoteScreenStreams[0];
        } else if (isScreenSharing) {
          isLocalPinned = true;
        }
      }

      const activePresenterName = isLocalPinned
        ? 'You (Screen Share)'
        : (activePinnedStream ? activePinnedStream.userName : 'Screen Share');

      return (
        <div className="w-full h-full flex flex-col md:flex-row gap-4 p-4">
          {/* Main Stage Canvas */}
          <div className="flex-1 relative bg-black rounded-2xl overflow-hidden border border-emerald-500/50 shadow-2xl flex items-center justify-center min-h-[300px]">
            {activePinnedStream ? (
              <RemoteVideoTile
                key={activePinnedStream.producerId}
                streamObj={activePinnedStream}
                defaultDisplayName={activePinnedStream.userName}
                remoteStreams={remoteStreams}
                isHandRaised={raisedHands.has(activePinnedStream.participantId)}
                selectedSpeakerId={selectedSpeakerId}
                isPinned={true}
                onPinToggle={() => setPinnedProducerId(null)}
              />
            ) : isLocalPinned ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-[#111114]">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
                  <MonitorUp className="w-8 h-8 animate-pulse" />
                </div>
                <h3 className="text-lg font-bold text-white">You are sharing your screen</h3>
                <p className="text-xs text-teams-muted max-w-sm">
                  Your screen is currently pinned on the main stage for all participants.
                </p>
                <button
                  onClick={() => setPinnedProducerId(null)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors"
                >
                  Unpin Stage
                </button>
              </div>
            ) : null}

            {/* Stage Header Badge & Control */}
            <div data-theme-preserve="dark" className="absolute top-4 left-4 px-3 py-1.5 bg-black/80 backdrop-blur rounded-xl text-xs font-bold text-emerald-400 border border-emerald-500/30 z-20 flex items-center gap-2">
              <Pin className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
              <span>Screen Share Stage • {activePresenterName}</span>
              {pinnedProducerId && (
                <button
                  onClick={() => setPinnedProducerId(null)}
                  className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold transition-colors"
                >
                  Unpin
                </button>
              )}
            </div>
          </div>

          {/* Right Sidebar - Active Screen Shares & Participants */}
          <div className="w-full md:w-72 flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto shrink-0">
            {/* Header if multiple screen shares */}
            {(remoteScreenStreams.length > 1 || (remoteScreenStreams.length >= 1 && isScreenSharing)) && (
              <div className="text-[11px] font-bold text-teams-purple uppercase tracking-wider px-1 pt-1 hidden md:block">
                Active Screen Shares ({remoteScreenStreams.length + (isScreenSharing ? 1 : 0)})
              </div>
            )}

            {/* Local Screen Share Thumbnail */}
            {isScreenSharing && (
              <div 
                onClick={() => setPinnedProducerId('local_screen')}
                className="w-48 md:w-full h-32 shrink-0 cursor-pointer"
              >
                <div className={`relative w-full h-full bg-[#151518] rounded-xl overflow-hidden border p-3 flex flex-col items-center justify-center text-center space-y-2 transition-all ${
                  isLocalPinned ? 'border-amber-400 ring-2 ring-amber-400/30 bg-amber-500/10' : 'border-teams-border/60 hover:border-emerald-500'
                }`}>
                  <MonitorUp className="w-6 h-6 text-emerald-400" />
                  <span className="text-xs font-bold text-white">Your Screen</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPinnedProducerId(isLocalPinned ? null : 'local_screen');
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                      isLocalPinned ? 'bg-amber-500 text-black' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40'
                    }`}
                  >
                    {isLocalPinned ? 'Pinned to Stage' : 'Pin to Stage'}
                  </button>
                </div>
              </div>
            )}

            {/* Remote Screen Share Thumbnails */}
            {remoteScreenStreams.map(stream => {
              const isCurrentlyPinned = activePinnedStream?.producerId === stream.producerId;
              return (
                <div 
                  key={stream.producerId} 
                  onClick={() => setPinnedProducerId(stream.producerId)}
                  className="w-48 md:w-full h-32 shrink-0 cursor-pointer"
                >
                  <RemoteVideoTile
                    streamObj={stream}
                    defaultDisplayName={stream.userName}
                    remoteStreams={remoteStreams}
                    isHandRaised={raisedHands.has(stream.participantId)}
                    selectedSpeakerId={selectedSpeakerId}
                    isPinned={isCurrentlyPinned}
                    onPinToggle={() => setPinnedProducerId(isCurrentlyPinned ? null : stream.producerId)}
                  />
                </div>
              );
            })}

            {/* Non-Screen Share Participants */}
            {participantIds.map(userId => {
              const userVideoStreams = remoteStreams.filter(s => s.participantId === userId && s.kind === 'video' && s.source !== 'screen');
              const userAudioStreams = remoteStreams.filter(s => s.participantId === userId && s.kind === 'audio');
              const camStream = userVideoStreams[0] || userAudioStreams[0] || remoteStreams.find(s => s.participantId === userId);
              return (
                <div key={userId} className="w-48 md:w-full h-28 shrink-0">
                  <RemoteVideoTile
                    userId={userId}
                    streamObj={camStream}
                    defaultDisplayName={camStream?.userName || displayName}
                    remoteStreams={remoteStreams}
                    isHandRaised={raisedHands.has(userId)}
                    selectedSpeakerId={selectedSpeakerId}
                  />
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // Equal Participant Grid (No Screen Sharing)
    const count = participantIds.length;
    let gridCols = "grid-cols-1";
    if (count === 1) gridCols = "grid-cols-1";
    else if (count === 2 || count === 3) gridCols = "grid-cols-2";
    else if (count >= 4) gridCols = "grid-cols-2 md:grid-cols-3";

    return (
      <div className={`w-full h-full grid ${gridCols} gap-4 p-4 items-center justify-center auto-rows-fr`}>
        {count === 0 && (
          <div className="flex flex-col items-center justify-center space-y-4 col-span-full">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-teams-purple/20 border-4 border-teams-purple/50 flex items-center justify-center text-4xl font-black text-teams-purple shadow-2xl animate-pulse">
              {displayName.charAt(0)}
            </div>
            <p className="text-teams-muted text-sm animate-pulse text-center px-4">
              {meetingState === 'CONNECTING' || meetingState === 'JOINING' || meetingState === 'CONNECTING_MEDIA'
                ? `Connecting WebRTC & SFU Media... (${meetingState})`
                : (isGroupCall ? 'Waiting for participants to join...' : `Waiting for ${displayName} to join...`)}
            </p>
          </div>
        )}
        
        {participantIds.map((userId) => {
          const userVideoStreams = remoteStreams.filter(s => s.participantId === userId && s.kind === 'video' && s.source !== 'screen');
          const userAudioStreams = remoteStreams.filter(s => s.participantId === userId && s.kind === 'audio');
          const targetStream = userVideoStreams[0] || userAudioStreams[0] || remoteStreams.find(s => s.participantId === userId);
          return (
            <RemoteVideoTile
              key={userId}
              userId={userId}
              streamObj={targetStream}
              defaultDisplayName={targetStream?.userName || displayName}
              remoteStreams={remoteStreams}
              isHandRaised={raisedHands.has(String(userId)) || raisedHands.has(userId)}
              selectedSpeakerId={selectedSpeakerId}
              isPinned={pinnedProducerId === targetStream?.producerId}
              onPinToggle={() => {
                if (targetStream?.producerId) {
                  setPinnedProducerId(pinnedProducerId === targetStream.producerId ? null : targetStream.producerId);
                }
              }}
            />
          );
        })}
      </div>
    );
  };

  if (isCallMinimized && callState === 'active') {
    return (
      <div 
        style={miniDraggable.style}
        onMouseDown={miniDraggable.handleDragStart}
        onTouchStart={miniDraggable.handleDragStart}
        className={`fixed ${miniDraggable.position ? '' : 'bottom-6 right-6'} w-96 h-60 bg-[#141417] text-white z-[999999] rounded-2xl shadow-2xl border-2 border-teams-purple flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300 select-none cursor-grab active:cursor-grabbing`}
        onClick={(e) => {
          if (miniDraggable.hasMoved) {
            e.stopPropagation();
            return;
          }
          meetingWebRTCManager.unlockAudioAutoplay();
        }}
      >
        {/* Mini Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#1B1B20] border-b border-teams-border/50 shrink-0 cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-2 min-w-0">
            <GripVertical className="w-4 h-4 text-teams-muted shrink-0" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-white truncate">
              {isEffectivelyGroupCall ? 'Group Meeting' : (displayName !== 'Participant' ? displayName : 'One-to-One Meeting')}
            </span>
            <span className="text-[10px] font-mono text-emerald-400 shrink-0">⏱️ {formatTime(callDuration)}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsCallMinimized(false)}
              className="p-1 rounded-lg hover:bg-teams-purple/30 text-teams-purple transition-colors"
              title="Expand / Fullscreen Meeting"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mini Video Body */}
        <div className="flex-1 bg-black relative overflow-hidden flex items-center justify-center">
          {callType === 'video' ? (
            <div className="w-full h-full relative">
              {renderVideoGrid()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-teams-purple/20 border border-teams-purple flex items-center justify-center mb-2">
                <Phone className="w-6 h-6 text-teams-purple" />
              </div>
              <span className="text-xs font-medium text-teams-muted">Audio Meeting in Progress</span>
            </div>
          )}
        </div>

        {/* Mini Controls Bar */}
        <div className="flex items-center justify-center gap-3 px-3 py-2 bg-[#1B1B20] border-t border-teams-border/50 shrink-0">
          <button
            onClick={toggleWebRTCAudio}
            className={`p-1.5 rounded-xl text-xs ${isAudioMuted ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-[#2A2A32] text-white hover:bg-[#34343E]'}`}
            title={isAudioMuted ? 'Unmute' : 'Mute'}
          >
            {isAudioMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={toggleWebRTCVideo}
            className={`p-1.5 rounded-xl text-xs ${isVideoMuted ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-[#2A2A32] text-white hover:bg-[#34343E]'}`}
            title={isVideoMuted ? 'Camera Off' : 'Camera On'}
          >
            {isVideoMuted ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleLeaveCall}
            className="px-3 py-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition-all active:scale-95"
            title="Leave Call"
          >
            Leave
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 w-full h-full bg-[#0B0D12] text-white z-[999999] flex flex-col p-4 md:p-6 select-none overflow-hidden"
      onClick={() => {
        meetingWebRTCManager.unlockAudioAutoplay();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Floating Reactions Overlay */}
      <div className="absolute inset-0 pointer-events-none z-[99999] overflow-hidden">
        {activeReactions.map(reaction => (
          <div 
            key={reaction.id}
            className="absolute bottom-28 text-5xl animate-bounce transition-all duration-700 transform -translate-y-16 scale-125 drop-shadow-[0_10px_10px_rgba(0,0,0,0.8)]"
            style={{ left: `${reaction.x}%` }}
          >
            {reaction.emoji}
          </div>
        ))}
      </div>

      {/* Persistent Global Audio Elements for all remote audio streams */}
      <div className="hidden" aria-hidden="true" style={{ display: 'none' }}>
        {remoteStreams
          .filter(s => s.kind === 'audio' && s.stream)
          .map(s => (
            <GlobalAudioPlayer
              key={`global-audio-${s.producerId}`}
              stream={s.stream}
              selectedSpeakerId={selectedSpeakerId}
            />
          ))}
      </div>

      {/* Top Header */}
      <div className="flex items-center justify-between w-full z-20 shrink-0 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-lg shadow-lg uppercase shadow-indigo-600/30">
            {isEffectivelyGroupCall ? (
              <Users className="w-5 h-5 text-white" />
            ) : callStarterName !== 'User' ? (
              callStarterName.charAt(0)
            ) : (
              <Phone className="w-5 h-5 text-white" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-bold text-base font-display line-clamp-1">
                {isEffectivelyGroupCall ? 'Group Meeting' : callStarterName}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 whitespace-nowrap">
                {isEffectivelyGroupCall ? (isCaller ? 'Host' : 'Attendee') : 'CALLER'}
              </span>
            </div>
            <p className="text-xs text-mc-muted flex items-center gap-1 mt-0.5">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>Mediasoup SFU • {meetingState}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Add People / Invite Participants Button */}
          {(callState === 'active' || callState === 'outgoing') && (
            <button
              onClick={() => setIsAddParticipantOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition-all active:scale-95"
              title="Invite teammate or add participant by email"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add People</span>
            </button>
          )}

          {/* Re-Sync / Rejoin Media Action Button */}
          <button
            onClick={handleRejoinSession}
            className="px-3 py-1.5 rounded-xl bg-[#171923] hover:bg-white/10 border border-white/10 text-xs font-semibold text-amber-300 shadow-md flex items-center gap-1.5 transition-colors"
            title="Re-sync media streams / Rejoin SFU session"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Re-Sync</span>
          </button>

          {callState === 'active' && (isRecording || remoteRecordingState?.isRecording) && (
            <div className="px-3.5 py-1 rounded-full bg-rose-950/90 border border-rose-500/60 text-xs font-bold text-rose-300 animate-pulse flex items-center gap-2 shadow-lg shadow-rose-900/30">
              <Circle className="w-2.5 h-2.5 fill-rose-500 text-rose-500 animate-ping" />
              <span>
                {isRecording
                  ? `REC • Recording In Progress (${formatRecordingTime(recordingSeconds)})`
                  : `REC • Recording In Progress (Host: ${remoteRecordingState?.recordedBy || 'Host'})`}
              </span>
            </div>
          )}

          {callState === 'active' && (
            <div className="px-4 py-1.5 rounded-full bg-[#171923] border border-white/10 text-xs font-mono font-bold text-emerald-400 shadow-md">
              ⏱️ {formatTime(callDuration)}
            </div>
          )}

          {callState === 'active' && (
            <button
              onClick={() => setIsCallMinimized(true)}
              className="p-2 rounded-xl bg-[#171923] hover:bg-white/10 border border-white/10 text-mc-muted hover:text-white transition-colors"
              title="Pop out call window to browse workspace"
            >
              <Minimize2 className="w-4 h-4 text-indigo-400" />
            </button>
          )}
        </div>
      </div>

      {/* Main Layout Area */}
      <div className="flex-1 flex gap-4 min-h-0 relative">
        {/* Video Grid Area */}
        <div className={`flex-1 transition-all duration-300 relative bg-[#151518] rounded-3xl overflow-hidden border border-teams-border/50 ${isChatOpen ? 'w-2/3 hidden md:flex' : 'w-full'}`}>
          
          {callState === 'active' && callType === 'video' ? (
            <>
              {renderVideoGrid()}
              
              {/* Local Video PIP */}
              <div className="absolute bottom-4 right-4 w-36 h-28 sm:w-48 sm:h-36 bg-[#18181C] rounded-2xl overflow-hidden border-2 border-teams-purple shadow-2xl z-20 flex items-center justify-center">
                {localStream ? (
                  <video ref={localVidElRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-1 p-2 text-center">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-teams-purple to-indigo-600 flex items-center justify-center font-bold text-base text-white uppercase shadow-md">
                      {currentUser?.name?.charAt(0) || 'Y'}
                    </div>
                    <span className="text-[10px] text-teams-muted font-medium">You</span>
                  </div>
                )}
                <div data-theme-preserve="dark" className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/80 backdrop-blur rounded text-[10px] font-bold text-white flex items-center gap-1 z-10">
                  <span>You {isScreenSharing ? '(Sharing Screen)' : ''}</span>
                  {(raisedHands.has(String(currentUser?.id || 'local')) || raisedHands.has('local')) && (
                    <span className="flex items-center gap-1 text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/40 animate-pulse">
                      <Hand className="w-3 h-3 animate-bounce" />
                      <span>Hand Raised</span>
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center space-y-6">
              <div className="relative flex items-center justify-center">
                {/* Teams-style outer ring that pulses with mic volume */}
                {!isAudioMuted && micLevel > 0.02 && (
                  <span
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      inset: `-${Math.round(4 + micLevel * 20)}px`,
                      border: `3px solid rgba(99,102,241,${0.3 + micLevel * 0.7})`,
                      boxShadow: `0 0 ${Math.round(micLevel * 30)}px rgba(99,102,241,${micLevel * 0.6}), inset 0 0 ${Math.round(micLevel * 20)}px rgba(99,102,241,${micLevel * 0.15})`,
                      transition: 'all 60ms linear',
                    }}
                  />
                )}
                {/* Second inner ring for Teams double-ring effect */}
                {!isAudioMuted && micLevel > 0.15 && (
                  <span
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      inset: `-${Math.round(2 + micLevel * 10)}px`,
                      border: `2px solid rgba(139,92,246,${0.5 + micLevel * 0.5})`,
                      transition: 'all 60ms linear',
                    }}
                  />
                )}
                <div className={`w-32 h-32 rounded-full bg-gradient-to-tr from-teams-purple via-indigo-600 to-purple-800 border-4 flex items-center justify-center font-black text-5xl text-white uppercase shadow-2xl transition-all ${
                  !isAudioMuted && micLevel > 0.05 ? 'border-indigo-400' : 'border-teams-purple'
                }`}>
                  {(callState === 'outgoing' ? displayName : (currentUser?.name || displayName)).charAt(0).toUpperCase()}
                </div>
                {/* Mic status badge */}
                <div className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center border-2 border-[#0B0D12] shadow-lg transition-all ${
                  isAudioMuted ? 'bg-rose-600' : 'bg-indigo-600'
                }`}>
                  {isAudioMuted ? <MicOff className="w-3.5 h-3.5 text-white" /> : <Mic className="w-3.5 h-3.5 text-white" />}
                </div>
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-white">
                  {callState === 'outgoing' ? displayName : (currentUser?.name || displayName)}
                </h3>
                <div className="flex items-center gap-2 justify-center">
                  {!isAudioMuted && micLevel > 0.05 && (
                    <span className="flex items-center gap-1 text-xs text-indigo-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                      Speaking
                    </span>
                  )}
                  {isAudioMuted && (
                    <span className="flex items-center gap-1 text-xs text-rose-400 font-medium">
                      <MicOff className="w-3 h-3" />
                      Muted
                    </span>
                  )}
                </div>
                <p className="text-sm text-teams-muted">
                  {callState === 'outgoing' ? 'Ringing teammate...' : callState === 'incoming' ? 'Incoming call request...' : 'Connected Audio Session'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel Drawer (Chat & AI Tools) */}
        {(isChatOpen || activeDrawer) && (
          <div className="w-full md:w-80 lg:w-96 bg-[#18181C] rounded-3xl border border-teams-border/50 flex flex-col overflow-hidden animate-in slide-in-from-right-5 duration-200 shadow-2xl">
            {/* Panel Header */}
            <div className="p-4 border-b border-teams-border/50 flex items-center justify-between bg-[#1E1E22]">
              <div className="flex items-center gap-2">
                {isChatOpen ? (
                  <MessageSquare className="w-4 h-4 text-teams-purple" />
                ) : activeDrawer === 'summary' ? (
                  <Sparkles className="w-4 h-4 text-amber-400" />
                ) : activeDrawer === 'transcript' ? (
                  <FileText className="w-4 h-4 text-sky-400" />
                ) : (
                  <Bot className="w-4 h-4 text-purple-400" />
                )}
                <h3 className="font-bold text-sm text-white capitalize">
                  {isChatOpen ? 'In-Call Chat' : `${activeDrawer} Panel`}
                </h3>
              </div>
              <button 
                onClick={() => {
                  setIsChatOpen(false);
                  setActiveDrawer(null);
                }}
                className="p-1.5 text-teams-muted hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Close Drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isChatOpen && (
                <>
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-teams-muted space-y-2 py-12">
                      <MessageSquare className="w-8 h-8 opacity-40 text-teams-purple" />
                      <p className="text-xs">No messages in this call session yet.</p>
                      <p className="text-[10px] text-teams-muted/70">Type below to send a message to participants</p>
                    </div>
                  ) : (
                    chatMessages.map(msg => (
                      <div key={msg.id} className="bg-[#222228] p-3 rounded-xl border border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-teams-purple">{msg.senderName}</span>
                          {msg.isViewOnce && (
                            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[9px] font-bold">
                              🔒 View Once
                            </span>
                          )}
                        </div>
                        {msg.imageUrl && (
                          <div className="relative group rounded-lg overflow-hidden border border-white/10 max-w-xs">
                            <img
                              src={getMediaUrl(msg.imageUrl)}
                              alt="In-call attachment"
                              className="max-h-48 w-full object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setAnnotationMedia(getMediaUrl(msg.imageUrl!));
                                setAnnotationInitialCaption(msg.text || '');
                                setIsAnnotationOpen(true);
                              }}
                              className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 hover:bg-black text-white text-[10px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shadow-lg cursor-pointer"
                              title="Markup & Annotate"
                            >
                              <Image className="w-3 h-3 text-emerald-400" />
                              <span>Markup</span>
                            </button>
                          </div>
                        )}
                        {msg.text && <p className="text-xs text-white leading-relaxed select-text">{msg.text}</p>}
                      </div>
                    ))
                  )}
                </>
              )}

              {!isChatOpen && (activeDrawer === 'summary' || activeDrawer === 'transcript' || activeDrawer === 'assistant') && (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-4 bg-[#1E1E22] rounded-2xl border border-white/5 my-auto">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-lg">
                    {activeDrawer === 'summary' ? (
                      <Sparkles className="w-7 h-7 text-amber-400 animate-pulse" />
                    ) : activeDrawer === 'transcript' ? (
                      <FileText className="w-7 h-7 text-sky-400 animate-pulse" />
                    ) : (
                      <Bot className="w-7 h-7 text-purple-400 animate-pulse" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-white capitalize">
                      {activeDrawer === 'summary' ? 'AI Summary & Insights' : activeDrawer === 'transcript' ? 'Live Searchable Transcript' : 'AI Copilot Assistant'}
                    </h4>
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] uppercase tracking-wider border border-amber-500/30">
                      Coming Soon
                    </span>
                    <p className="text-xs text-mc-muted mt-2 max-w-xs leading-relaxed">
                      This feature is currently under active development and will be released in the upcoming enterprise update.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input Bar */}
            {isChatOpen && (
              <form onSubmit={handleSendChat} className="p-3 border-t border-teams-border/50 bg-[#1E1E22] flex items-center gap-2">
                <input
                  type="file"
                  ref={chatImageInputRef}
                  onChange={handleChatImageSelect}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => chatImageInputRef.current?.click()}
                  className="p-2 text-teams-muted hover:text-emerald-400 hover:bg-white/5 rounded-xl transition-colors shrink-0"
                  title="Annotate & Send Photo (Draw, Text, Shapes, Blur, Stickers)"
                >
                  <Image className="w-4 h-4 text-emerald-400" />
                </button>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onPaste={handleChatPaste}
                  placeholder="Type message or paste image..."
                  className="flex-1 bg-[#141416] border border-teams-border/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teams-purple min-w-0"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="p-2 bg-teams-purple hover:bg-teams-purple-hover disabled:opacity-40 text-white rounded-xl transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Toast Notification Banner (Unified info / error toast) */}
      {toastMessage ? (
        <div className={`mt-2 border text-xs px-4 py-2 rounded-xl flex items-center justify-between gap-2 animate-in fade-in duration-200 ${
          toastMessage.includes('⚠️') || toastMessage.includes('Error') || toastMessage.includes('blocked')
            ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
            : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
        }`}>
          <div className="flex items-center gap-2">
            {toastMessage.includes('⚠️') || toastMessage.includes('blocked') ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-amber-400" />
            )}
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="hover:bg-white/10 text-xs font-bold px-2 py-0.5 rounded-lg transition-colors">✕</button>
        </div>
      ) : webRtcError ? (
        <div className="mt-2 bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs px-4 py-2 rounded-xl flex items-center justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{webRtcError}</span>
          </div>
          <button onClick={clearWebRtcError} className="hover:bg-white/10 text-xs font-bold px-2 py-0.5 rounded-lg transition-colors">✕</button>
        </div>
      ) : null}

      {/* Bottom Control Bar */}
      <div className="mt-4 flex items-center justify-between gap-4 shrink-0 z-20">
        <div className="flex items-center gap-3">
          {callState === 'active' && (
            <>
              {/* Hand Raise */}
              <button
                onClick={toggleHandRaise}
                className={`p-3 rounded-xl transition-all ${
                  raisedHands.has(String(currentUser?.id || 'local'))
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-lg shadow-amber-500/20 animate-pulse'
                    : 'bg-[#222226] text-teams-muted hover:text-white hover:bg-[#2A2A30]'
                }`}
                title={raisedHands.has(String(currentUser?.id || 'local')) ? 'Lower Hand' : 'Raise Hand'}
              >
                <Hand className="w-5 h-5" />
              </button>

              {/* Emoji Reactions */}
              <div className="flex items-center gap-1 bg-[#222226] p-1 rounded-xl border border-white/5">
                {['👍', '❤️', '👏', '🔥'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-sm transition-transform active:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Call State Actions */}
        <div className="flex items-center gap-4">
          {callState === 'incoming' ? (
            <>
              <button
                onClick={handleDecline}
                className="w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 transition-transform active:scale-95"
                title="Decline Call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
              <button
                onClick={handleAccept}
                className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 transition-transform active:scale-95 animate-bounce"
                title="Accept Call"
              >
                <Phone className="w-6 h-6" />
              </button>
            </>
          ) : callState === 'outgoing' ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsAddParticipantOpen(true)}
                className="h-12 px-5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white flex items-center gap-2 text-xs font-bold shadow-lg shadow-indigo-600/30 transition-transform active:scale-95"
                title="Add People to Call"
              >
                <UserPlus className="w-5 h-5" />
                <span>Add People</span>
              </button>
              <button
                onClick={handleDecline}
                className="w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 transition-transform active:scale-95"
                title="Cancel Call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </div>
          ) : (
            <>
              {/* Toggle Audio — with Teams-style mic level ring */}
              <div className="relative flex items-center justify-center">
                {/* Pulsing ring driven by mic level */}
                {!isAudioMuted && micLevel > 0.05 && (
                  <span
                    className="absolute rounded-xl pointer-events-none"
                    style={{
                      inset: `-${Math.round(micLevel * 8)}px`,
                      border: `2px solid rgba(99,102,241,${0.4 + micLevel * 0.6})`,
                      boxShadow: `0 0 ${Math.round(micLevel * 16)}px rgba(99,102,241,${micLevel * 0.7})`,
                      transition: 'all 50ms linear',
                      borderRadius: '0.75rem'
                    }}
                  />
                )}
                <button
                  onClick={toggleWebRTCAudio}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all relative z-10 ${
                    isAudioMuted
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      : micLevel > 0.05
                        ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/60'
                        : 'bg-[#222226] text-white hover:bg-[#2A2A30]'
                  }`}
                  title={isAudioMuted ? 'Unmute Mic' : 'Mute Mic'}
                >
                  {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              </div>

              {/* Toggle Video */}
              <button
                onClick={toggleWebRTCVideo}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  isVideoMuted
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-[#222226] text-white hover:bg-[#2A2A30]'
                }`}
                title={isVideoMuted ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>

              {/* Toggle Screen Share */}
              <button
                onClick={toggleScreenShare}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  isScreenSharing
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-[#222226] text-[#6366F1] hover:bg-[#2A2A30]'
                }`}
                title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
              >
                <MonitorUp className="w-5 h-5" />
              </button>

              {/* Add People to Call Button */}
              <button
                onClick={() => setIsAddParticipantOpen(true)}
                className="w-11 h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white flex items-center justify-center transition-all shadow-lg shadow-indigo-600/30 active:scale-95"
                title="Add People to Call"
              >
                <UserPlus className="w-5 h-5 text-white" />
              </button>

              {/* Open Device Hardware Settings */}
              <button
                onClick={() => setIsDeviceSettingsOpen(true)}
                className="w-11 h-11 rounded-xl bg-[#222226] text-white hover:bg-[#2A2A30] flex items-center justify-center transition-all border border-white/5"
                title="Audio & Video Device Settings"
              >
                <Sliders className="w-5 h-5 text-teams-purple" />
              </button>

              <div className="w-px h-6 bg-white/10 mx-0.5" />

              {/* Record Toggle Button */}
              <button
                onClick={() => {
                  if (!isCaller && !isRecording) {
                    setToastMessage('⚠️ Only the meeting host can record this meeting.');
                    setTimeout(() => setToastMessage(null), 3500);
                    return;
                  }
                  if (isRecording) {
                    stopCallRecording();
                  } else {
                    startCallRecording();
                  }
                }}
                disabled={!isCaller && !isRecording}
                className={`h-11 px-3.5 rounded-xl transition-all flex items-center gap-1.5 font-bold text-xs ${
                  isRecording
                    ? 'bg-rose-600/20 text-rose-400 border border-rose-500/50 animate-pulse ring-2 ring-rose-500/30'
                    : !isCaller
                    ? 'bg-[#1C1C20] text-teams-muted opacity-50 cursor-not-allowed border border-white/5'
                    : 'bg-[#222226] text-white hover:bg-[#2A2A30] border border-white/5'
                }`}
                title={
                  !isCaller
                    ? 'Only meeting host can record'
                    : isRecording
                    ? 'Stop Recording'
                    : 'Start Call Recording'
                }
              >
                <Circle className={`w-4 h-4 ${isRecording ? 'fill-current text-rose-500 animate-ping' : ''}`} />
                <span>{isRecording ? `REC ${formatRecordingTime(recordingSeconds)}` : 'Record'}</span>
              </button>

              {/* Host Recording Notification Visibility Toggle */}
              {isCaller && (
                <button
                  onClick={toggleRecordingNotificationVisibility}
                  className={`h-11 px-3 rounded-xl transition-all flex items-center gap-1.5 font-bold text-xs border ${
                    notifyParticipantsOfRecording
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  }`}
                  title={
                    notifyParticipantsOfRecording
                      ? 'Recording alert is SHOWN to attendees (Click to hide)'
                      : 'Recording alert is HIDDEN from attendees (Click to show)'
                  }
                >
                  {notifyParticipantsOfRecording ? (
                    <>
                      <Bell className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[11px]">Notify: ON</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[11px]">Notify: OFF</span>
                    </>
                  )}
                </button>
              )}

              {/* AI Summary & Insights (Coming Soon) */}
              <button
                onClick={() => {
                  setIsChatOpen(false);
                  setActiveDrawer(null);
                  setToastMessage('Coming Soon: AI Summary & Insights');
                  setTimeout(() => setToastMessage(null), 3000);
                }}
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all bg-[#222226] text-white hover:bg-[#2A2A30] border border-white/5 relative group"
                title="AI Summary & Insights (Coming Soon)"
              >
                <Sparkles className="w-5 h-5 text-amber-400 opacity-80 group-hover:opacity-100 transition-opacity" />
              </button>

              {/* Searchable Transcript (Coming Soon) */}
              <button
                onClick={() => {
                  setIsChatOpen(false);
                  setActiveDrawer(null);
                  setToastMessage('Coming Soon: Live Searchable Transcript');
                  setTimeout(() => setToastMessage(null), 3000);
                }}
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all bg-[#222226] text-white hover:bg-[#2A2A30] border border-white/5 relative group"
                title="Searchable Transcript (Coming Soon)"
              >
                <FileText className="w-5 h-5 text-sky-400 opacity-80 group-hover:opacity-100 transition-opacity" />
              </button>

              {/* AI Assistant (Coming Soon) */}
              <button
                onClick={() => {
                  setIsChatOpen(false);
                  setActiveDrawer(null);
                  setToastMessage('Coming Soon: AI Copilot Meeting Assistant');
                  setTimeout(() => setToastMessage(null), 3000);
                }}
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all bg-[#222226] text-white hover:bg-[#2A2A30] border border-white/5 relative group"
                title="AI Meeting Assistant (Coming Soon)"
              >
                <Bot className="w-5 h-5 text-purple-400 opacity-80 group-hover:opacity-100 transition-opacity" />
              </button>

              <div className="w-px h-6 bg-white/10 mx-0.5" />

              {/* Leave / End Call */}
              <button
                onClick={() => {
                  if (isCaller) setShowHostEndModal(true);
                  else setShowLeaveConfirmModal(true);
                }}
                className="h-11 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all active:scale-95"
              >
                <PhoneOff className="w-4 h-4" />
                <span>{isCaller ? 'End Call' : 'Leave'}</span>
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {callState === 'active' && (
            <button
              onClick={() => {
                setActiveDrawer(null);
                setIsChatOpen(!isChatOpen);
              }}
              className={`p-3 rounded-xl transition-all relative ${
                isChatOpen
                  ? 'bg-teams-purple text-white shadow-lg shadow-teams-purple/30'
                  : unreadChatCount > 0
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse'
                  : 'bg-[#222226] text-teams-muted hover:text-white hover:bg-[#2A2A30]'
              }`}
              title="In-Call Chat"
            >
              <MessageSquare className="w-5 h-5" />
              {unreadChatCount > 0 && !isChatOpen && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white font-black text-[10px] flex items-center justify-center border-2 border-[#151518] shadow-md animate-bounce">
                  {unreadChatCount > 9 ? '9+' : unreadChatCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Add Participant Modal */}
      <AddParticipantModal
        isOpen={isAddParticipantOpen}
        onClose={() => setIsAddParticipantOpen(false)}
        conversationId={conversationId}
        callType={callType}
      />

      {/* Disconnect Overlay */}
      {meetingState === 'RECONNECTING' && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <AlertCircle className="w-16 h-16 text-rose-500 mb-4 animate-pulse" />
          <h2 className="text-2xl font-bold text-white mb-2">Connection Lost</h2>
          <p className="text-teams-muted max-w-md mb-8">
            We are trying to reconnect you to the meeting. If the connection is not restored within {disconnectTimer} seconds, you will be automatically disconnected from the call.
          </p>
          <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden mb-6">
            <div 
              className="h-full bg-rose-500 transition-all duration-1000 ease-linear"
              style={{ width: `${(disconnectTimer / 20) * 100}%` }}
            />
          </div>
          <button
            onClick={handleLeaveCall}
            className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all"
          >
            Leave Now
          </button>
        </div>
      )}

      {/* Host End Modal */}
      {showHostEndModal && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center animate-in fade-in">
          <div className="bg-[#1F1F1F] border border-[#323232] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">End Meeting Options</h3>
            <p className="text-xs text-teams-muted mb-6">You are the host of this meeting. Do you want to end the meeting for everyone or just leave?</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setShowHostEndModal(false); handleEndCallForAll(); }}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors"
              >
                End Meeting for Everyone
              </button>
              <button
                onClick={() => { setShowHostEndModal(false); handleLeaveCall(); }}
                className="w-full py-3 rounded-xl bg-[#2A2A30] hover:bg-[#323238] text-white font-bold text-xs transition-colors"
              >
                Just Leave Meeting
              </button>
              <button
                onClick={() => setShowHostEndModal(false)}
                className="w-full py-3 rounded-xl hover:bg-white/5 text-teams-muted hover:text-white font-bold text-xs transition-colors mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Normal User Leave Modal */}
      {showLeaveConfirmModal && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center animate-in fade-in">
          <div className="bg-[#1F1F1F] border border-[#323232] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Leave Meeting</h3>
            <p className="text-xs text-teams-muted mb-6">Are you sure you want to leave this meeting?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#2A2A30] hover:bg-[#323238] text-white font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowLeaveConfirmModal(false); handleLeaveCall(); }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device Settings Modal */}
      <DeviceSettingsModal
        isOpen={isDeviceSettingsOpen}
        onClose={() => setIsDeviceSettingsOpen(false)}
        selectedCameraId={selectedCameraId}
        selectedMicId={selectedMicId}
        selectedSpeakerId={selectedSpeakerId}
        onSelectCamera={changeCamera}
        onSelectMic={changeMicrophone}
        onSelectSpeaker={changeSpeaker}
        onRejoinSession={handleRejoinSession}
        isScreenSharing={isScreenSharing}
        onToggleScreenShare={toggleScreenShare}
      />

      {/* In-Call Media Annotation Modal */}
      <MediaAnnotationModal
        isOpen={isAnnotationOpen}
        imageSource={annotationMedia}
        initialCaption={annotationInitialCaption}
        onClose={() => {
          setIsAnnotationOpen(false);
          setAnnotationMedia(null);
        }}
        onSend={handleSendAnnotatedChatMedia}
      />
    </div>
  );
};
