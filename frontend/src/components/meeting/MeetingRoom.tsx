import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useWebRTC } from '../../hooks/useWebRTC';
import { MeetingLobby } from './MeetingLobby';
import { MeetingControlBar } from './MeetingControlBar';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { useUIStore } from '../../stores/uiStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { wsService } from '../../services/websocketService';
import { meetingService, Meeting } from '../../services/meetingService';
import { Users, Clock, Loader2, ShieldAlert, Circle, X, Sparkles, AlertCircle, UserPlus, Maximize2, RotateCcw, Mic, MicOff, Video, VideoOff, PhoneOff, FileText, Bot } from 'lucide-react';

import { recordingService } from '../../services/recordingService';
import { saveRecording } from '../../services/localRecordingStore';
import { meetingAIService } from '../../services/meetingAIService';
import { MeetingSummaryView } from '../../features/meeting-ai/MeetingSummary';
import { ActionItemsView } from '../../features/meeting-ai/ActionItems';
import { TranscriptView } from '../../features/transcripts/TranscriptView';
import { MeetingAssistantPanel } from '../../features/meeting-ai/MeetingAssistant';
import { RecordingPlayer } from '../../features/recordings/RecordingPlayer';
import { TranscriptSegment, MeetingSummary, ActionItem, Recording } from '../../types/meetingAI';
import { DeviceSettingsModal } from '../modals/DeviceSettingsModal';
import { AddParticipantModal } from '../modals/AddParticipantModal';

interface MeetingRoomProps {
  meetingId: string;
  onLeave?: () => void;
  isPoppedOut?: boolean;
  onRestore?: () => void;
  onPopOut?: () => void;
}

type JoinPhase = 'loading' | 'ready-to-join' | 'waiting-for-host' | 'in-call' | 'error';

const POLL_INTERVAL_MS = 4000;

function useElapsedTime(startedAt: number | null) {
  const [elapsed, setElapsed] = useState('00:00:00');
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const h = String(Math.floor(secs / 3600)).padStart(2, '0');
      const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({ meetingId, onLeave, isPoppedOut = false, onRestore, onPopOut }) => {
  const { user } = useAuthStore();
  const [phase, setPhase] = useState<JoinPhase>('loading');
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recording & Intelligence State
  const [isRecording, setIsRecording] = useState(false);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [recordingToast, setRecordingToast] = useState<string | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
  const [seekToTime, setSeekToTime] = useState<number | null>(null);

  // Intelligence Data
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([
    {
      id: '1',
      speaker_name: 'Alice',
      start_time: 0,
      end_time: 12,
      text: "Welcome everyone to today's enterprise sync.",
      confidence: 98
    },
    {
      id: '2',
      speaker_name: 'Bob',
      start_time: 13,
      end_time: 35,
      text: "Thanks! We should confirm our PostgreSQL migration timeline and release schedule for Friday.",
      confidence: 95
    },
    {
      id: '3',
      speaker_name: 'Alice',
      start_time: 36,
      end_time: 60,
      text: "Agreed. API testing is nearly complete and production deployment will happen Friday.",
      confidence: 97
    },
    {
      id: '4',
      speaker_name: 'Bob',
      start_time: 61,
      end_time: 90,
      text: "I will prepare the deployment scripts by Thursday afternoon.",
      confidence: 96
    }
  ]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);

  const [isDeviceSettingsOpen, setIsDeviceSettingsOpen] = useState(false);
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false);
  const [notifyParticipantsOfRecording, setNotifyParticipantsOfRecording] = useState(true);

  const {
    localStream,
    remoteStreams,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    selectedCameraId,
    selectedMicId,
    selectedSpeakerId,
    joinMeeting,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    changeCamera,
    changeMicrophone,
    changeSpeaker,
    leaveMeeting,
  } = useWebRTC();

  const elapsed = useElapsedTime(joinedAt);

  const { isCaller: storeIsCaller, conversationId: storeConvId } = useCallStore();

  const isHost = useMemo(() => {
    if (!user) return false;
    if (meeting && String(meeting.host_id) === String(user.id)) return true;
    if (storeIsCaller && (!storeConvId || storeConvId === meetingId)) return true;
    return false;
  }, [meeting, user, meetingId, storeIsCaller, storeConvId]);

  const loadMeeting = async () => {
    try {
      const data = await meetingService.getMeeting(meetingId);
      setMeeting(data);
      return data;
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load meeting details.');
      setPhase('error');
      return null;
    }
  };

  const evaluatePhase = (m: Meeting) => {
    if (m.status === 'ENDED') {
      setErrorMessage('This meeting has already ended.');
      setPhase('error');
      return;
    }

    if (m.host_id === user?.id) {
      setPhase('ready-to-join');
      return;
    }

    if (m.status === 'IN_PROGRESS') {
      setPhase('ready-to-join');
    } else {
      setPhase('waiting-for-host');
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function init() {
      const m = await loadMeeting();
      if (m && isMounted) {
        evaluatePhase(m);
      }
    }

    init();

    return () => {
      isMounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [meetingId]);

  const handleRejoin = async () => {
    setPhase('loading');
    setErrorMessage(null);
    try {
      leaveMeeting();
      const m = await loadMeeting();
      if (m) evaluatePhase(m);
    } catch (err) {
      setPhase('error');
    }
  };

  useEffect(() => {
    if (phase === 'waiting-for-host') {
      pollRef.current = setInterval(async () => {
        const m = await loadMeeting();
        if (m && m.status === 'IN_PROGRESS') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase('ready-to-join');
        }
      }, POLL_INTERVAL_MS);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [phase]);

  const confirmJoin = async () => {
    try {
      if (isHost && meeting?.status === 'SCHEDULED') {
        await meetingService.joinMeeting(meetingId);
      }

      await joinMeeting(meetingId, user?.display_name || user?.username || 'Participant');
      wsService.joinChannel(meetingId);
      setJoinedAt(Date.now());
      setPhase('in-call');
    } catch (err: any) {
      console.error('Failed to join WebRTC meeting:', err);
      setErrorMessage('Could not connect to media stream. Please check camera/mic permissions.');
      setPhase('error');
    }
  };

  useEffect(() => {
    if (isPoppedOut && phase !== 'in-call') {
      useUIStore.getState().setIsMeetingPoppedOut(false);
      useUIStore.getState().setActiveMeetingId(null);
    }
  }, [isPoppedOut, phase]);

  const handleLeave = async () => {
    if (isRecording) {
      await handleToggleRecording();
    }
    wsService.leaveChannel(meetingId);
    leaveMeeting();
    useUIStore.getState().setIsMeetingPoppedOut(false);
    useUIStore.getState().setActiveMeetingId(null);
    useCallStore.getState().endCall(false);
    if (onLeave) onLeave();
  };

  const handleEndCallForEveryone = async () => {
    if (isRecording) {
      await handleToggleRecording();
    }
    const targetRoom = meetingId || 'direct-call-room';
    wsService.send({ type: 'mesh_end', conversation_id: targetRoom, channel_id: targetRoom });
    wsService.leaveChannel(targetRoom);
    try {
      await meetingService.endMeeting(meetingId);
    } catch (err) {
      console.error('End meeting error:', err);
    }
    leaveMeeting();
    useUIStore.getState().setActiveMeetingId(null);
    useUIStore.getState().setIsMeetingPoppedOut(false);
    useCallStore.getState().endCall(true); // Host terminated -> no rejoin
    if (onLeave) onLeave();
  };

  // MediaRecorder Ref for MeetingRoom
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingDurationRef = useRef(0);
  const recordAnimFrameRef = useRef<number | null>(null);
  const recordAudioCtxRef = useRef<AudioContext | null>(null);

  const createCompositeStream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

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

    const draw = () => {
      if (!ctx) return;
      ctx.fillStyle = '#141416';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

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
        ctx.fillStyle = '#1E1E24';
        ctx.fillRect(80, 80, canvas.width - 160, canvas.height - 160);
        ctx.fillStyle = '#6366F1';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MicroproTeams Meeting Room', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = '#94A3B8';
        ctx.font = '20px sans-serif';
        ctx.fillText(`Meeting ID: ${meetingId || 'Group Meeting'}`, canvas.width / 2, canvas.height / 2 + 20);
      }

      recordAnimFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    const canvasStream = canvas.captureStream(30);
    const vTrack = canvasStream.getVideoTracks()[0];

    return new MediaStream([vTrack, ...audioTracks]);
  };

  // Recording Toggles
  const handleToggleRecording = async () => {
    try {
      if (!isRecording) {
        recordedChunksRef.current = [];
        recordingDurationRef.current = 0;

        const captureStream = createCompositeStream();

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

        recorder.onstop = async () => {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          if (blob.size === 0) {
            setRecordingToast('Recording failed — no audio/video data captured.');
            setTimeout(() => setRecordingToast(null), 5000);
            return;
          }
          try {
            await saveRecording({
              blob,
              mimeType,
              meetingId: meetingId || 'Group Meeting',
              durationSeconds: recordingDurationRef.current,
            });
            setRecordingToast('✅ Recording saved to Downloads & Media Vault.');
          } catch (e) {
            setRecordingToast('Recording captured but save failed.');
          }
          setTimeout(() => setRecordingToast(null), 5000);
        };

        recorder.start(1000);
        mediaRecorderRef.current = recorder;

        // Track duration
        const durTimer = setInterval(() => { recordingDurationRef.current += 1; }, 1000);
        mediaRecorderRef.current.addEventListener('stop', () => clearInterval(durTimer));

        try {
          const rec = await recordingService.startRecording(meetingId);
          setActiveRecordingId(rec.id);
        } catch (apiErr) {
          console.warn('API recording endpoint fallback:', apiErr);
        }

        setIsRecording(true);
        const hostName = user?.display_name || user?.username || 'Host';
        wsService.send({
          type: 'recording_state_change',
          conversation_id: meetingId,
          channel_id: meetingId,
          isRecording: true,
          recordedBy: hostName,
          notifyParticipants: notifyParticipantsOfRecording
        });
        setRecordingToast(
          notifyParticipantsOfRecording
            ? '🔴 Recording started. Audio & video captured.'
            : '🔴 Recording started (Silent host mode).'
        );
        setTimeout(() => setRecordingToast(null), 5000);
      } else {
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
        if (activeRecordingId) {
          try {
            await recordingService.stopRecording(meetingId, activeRecordingId);
          } catch (apiErr) {
            console.warn('API stop recording endpoint fallback:', apiErr);
          }
        }
        setIsRecording(false);
        setActiveRecordingId(null);
        const hostName = user?.display_name || user?.username || 'Host';
        wsService.send({
          type: 'recording_state_change',
          conversation_id: meetingId,
          channel_id: meetingId,
          isRecording: false,
          recordedBy: hostName,
          notifyParticipants: false
        });
        setRecordingToast('Recording stopped. Processing...');
        setTimeout(() => setRecordingToast(null), 5000);
      }
    } catch (err) {
      console.error('Failed to toggle recording:', err);
      setRecordingToast('Could not start recording session.');
      setTimeout(() => setRecordingToast(null), 5000);
    }
  };

  const toggleRecordingNotificationVisibility = () => {
    const nextVal = !notifyParticipantsOfRecording;
    setNotifyParticipantsOfRecording(nextVal);
    if (isRecording) {
      const hostName = user?.display_name || user?.username || 'Host';
      wsService.send({
        type: 'recording_visibility_change',
        conversation_id: meetingId,
        channel_id: meetingId,
        isRecording: true,
        notifyParticipants: nextVal,
        recordedBy: hostName
      });
      setRecordingToast(
        nextVal
          ? 'Attendee recording notification is now ON'
          : 'Attendee recording notification is now HIDDEN'
      );
      setTimeout(() => setRecordingToast(null), 4000);
    }
  };

  const handleWSEvents = useCallback((event: any) => {
    if (event.type === 'recording_state_change' || event.type === 'recording_visibility_change') {
      if (event.isRecording && event.notifyParticipants !== false) {
        setIsRecording(true);
        setRecordingToast(`🔴 Meeting is being recorded by ${event.recordedBy || 'Host'}`);
      } else {
        setIsRecording(false);
        if (event.type === 'recording_state_change' && !event.isRecording) {
          setRecordingToast('Meeting recording stopped');
        }
      }
      setTimeout(() => setRecordingToast(null), 5000);
    } else if (event.type === 'mesh_end' || event.type === 'call_ended_for_all') {
      if (isRecording) {
        handleToggleRecording();
      }
      leaveMeeting();
      useUIStore.getState().setIsMeetingPoppedOut(false);
      useUIStore.getState().setActiveMeetingId(null);
      useCallStore.getState().endCall(true);
      if (onLeave) onLeave();
    }
  }, [isRecording, leaveMeeting, onLeave]);

  useWebSocket(undefined, handleWSEvents);

  // Intelligence Drawer Toggles (Coming Soon)
  const handleToggleDrawer = async (drawerType: string) => {
    setActiveDrawer(null);
    const featureName = drawerType === 'summary' ? 'AI Summary & Insights' : drawerType === 'transcript' ? 'Live Searchable Transcript' : 'AI Copilot Assistant';
    setRecordingToast(`Coming Soon: ${featureName}`);
    setTimeout(() => setRecordingToast(null), 3000);
  };

  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localStream) return;

    if (el.srcObject !== localStream) {
      el.srcObject = localStream;
    }
    el.play().catch((err) => {
      if (err.name !== 'AbortError') {
        console.warn('Local preview video play warning:', err);
      }
    });
  }, [localStream, phase, isVideoMuted]);

  const remoteVideoTiles = useMemo(() => {
    const map = new Map<string, { userName: string; videoStream?: MediaStream; audioStream?: MediaStream }>();

    remoteStreams.forEach((streamObj) => {
      const pid = streamObj.participantId;
      if (!map.has(pid)) {
        map.set(pid, { userName: streamObj.userName });
      }
      const entry = map.get(pid)!;
      if (streamObj.kind === 'video') {
        entry.videoStream = streamObj.stream;
      } else if (streamObj.kind === 'audio') {
        entry.audioStream = streamObj.stream;
      }
    });

    return Array.from(map.entries());
  }, [remoteStreams]);

  const participantCount = remoteVideoTiles.length + 1;

  if (phase === 'loading') {
    return (
      <div className="flex-1 bg-[#141414] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 text-teams-purple animate-spin" />
        <p className="text-sm text-teams-muted">Loading meeting details...</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex-1 bg-[#141414] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-lg text-white">Meeting Unavailable</h3>
        <p className="text-xs text-teams-muted max-w-sm">{errorMessage}</p>
        <button
          onClick={onLeave}
          className="px-4 py-2 bg-[#252424] hover:bg-[#323131] text-white text-xs font-semibold rounded-lg transition-colors w-full sm:w-auto"
        >
          Back to Dashboard
        </button>
        <button
          onClick={handleRejoin}
          className="px-4 py-2 bg-teams-purple hover:bg-teams-purple-hover text-white text-xs font-semibold rounded-lg transition-colors w-full sm:w-auto flex items-center justify-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Retry / Rejoin</span>
        </button>
      </div>
    );
  }

  if (phase === 'waiting-for-host') {
    return (
      <div className="flex-1 bg-[#141414] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-teams-purple/20 border border-teams-purple/50 flex items-center justify-center text-teams-purple animate-pulse">
          <Clock className="w-8 h-8" />
        </div>
        <h3 className="font-bold text-lg text-white">Waiting for Host to Start</h3>
        <p className="text-xs text-teams-muted max-w-md">
          This meeting hasn't started yet. You will be automatically joined as soon as host <strong className="text-white">{meeting?.host_id}</strong> enters.
        </p>
        <button
          onClick={onLeave}
          className="px-4 py-2 bg-[#252424] hover:bg-[#323131] text-white text-xs font-semibold rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (isPoppedOut && phase !== 'in-call') {
    return null;
  }

  if (phase === 'ready-to-join') {
    return (
      <MeetingLobby
        localVideoRef={localVideoRef as any}
        isAudioMuted={isAudioMuted}
        isVideoMuted={isVideoMuted}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onJoinMeeting={confirmJoin}
      />
    );
  }

  if (isPoppedOut) {
    const activeStream = remoteVideoTiles.length > 0 ? remoteVideoTiles[0] : null;
    return (
      <div className="flex-1 bg-[#141414] flex flex-col h-full relative overflow-hidden group">
        <div className="absolute top-2 right-2 flex gap-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onRestore} className="p-2 bg-black/70 hover:bg-black/90 backdrop-blur rounded-lg text-white shadow-lg border border-white/10" title="Back to Meeting Workspace">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        <div className="absolute top-2 left-2 z-50 px-2 py-1 bg-black/60 backdrop-blur rounded-lg flex items-center gap-1.5 text-[10px] font-bold text-white shadow-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
          <Users className="w-3 h-3 text-teams-purple" />
          <span>{participantCount}</span>
        </div>
        
        <div className="flex-1 relative bg-[#111111]">
           {activeStream ? (
             <RemoteVideoTile userName={activeStream[1].userName} videoStream={activeStream[1].videoStream} audioStream={activeStream[1].audioStream} />
           ) : (
             <video
               ref={localVideoRef as any}
               autoPlay
               playsInline
               muted
               className={`w-full h-full object-cover ${isVideoMuted ? 'hidden' : 'block'}`}
             />
           )}
           {(!activeStream && isVideoMuted) && (
             <div className="absolute inset-0 flex items-center justify-center bg-[#181818]">
               <div className="w-16 h-16 rounded-full bg-teams-purple flex items-center justify-center text-white font-bold text-2xl uppercase shadow-xl">
                 {user?.display_name?.charAt(0) || 'U'}
               </div>
             </div>
           )}
        </div>

        <div className="h-14 bg-[#1F1F1F] flex items-center justify-center gap-4 shrink-0 border-t border-teams-border">
          <button onClick={toggleAudio} className={`p-2.5 rounded-xl transition-all ${isAudioMuted ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30' : 'bg-[#292929] text-white hover:bg-[#323232]'}`} title="Toggle Audio">
            {isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button onClick={toggleVideo} className={`p-2.5 rounded-xl transition-all ${isVideoMuted ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30' : 'bg-[#292929] text-white hover:bg-[#323232]'}`} title="Toggle Video">
            {isVideoMuted ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
          </button>
          <div className="w-px h-6 bg-teams-border mx-1" />
          <button onClick={handleLeave} className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30 font-bold text-[11px] flex items-center gap-1.5 transition-all">
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Leave</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#141414] flex flex-col h-full relative overflow-hidden select-none">
      {/* Global Persistent Audio Elements for all remote audio streams */}
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

      {/* Recording Consent Notification Banner */}
      {recordingToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-rose-950/90 border border-rose-500 text-white px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur text-xs animate-bounce">
          <Circle className="w-4 h-4 fill-current text-rose-500 animate-pulse" />
          <span className="font-semibold">{recordingToast}</span>
          <button onClick={() => setRecordingToast(null)}>
            <X className="w-4 h-4 text-rose-300 hover:text-white" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="h-14 bg-[#1F1F1F]/80 backdrop-blur border-b border-teams-border flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
          <h2 className="font-bold text-sm text-white">{meeting?.title || 'Meeting'}</h2>
          {isRecording ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-400 font-bold border border-rose-800 uppercase flex items-center gap-1">
              <Circle className="w-2 h-2 fill-current text-rose-500" />
              Recording In Progress
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold uppercase">
              Live Meeting
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-teams-muted">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>{elapsed}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-teams-purple" />
            <span>{participantCount} Participant{participantCount !== 1 ? 's' : ''}</span>
          </div>
          <button
            onClick={() => setIsAddParticipantOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-teams-purple hover:bg-teams-purple-hover text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-teams-purple/30 transition-all active:scale-95 ml-2"
            title="Add Participant by Email or Contact"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Participant</span>
          </button>
        </div>
      </div>

      {/* Main Body with Drawer Side Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 gap-4 items-center justify-center overflow-y-auto">
          <div className="relative aspect-video bg-[#1F1F1F] rounded-2xl overflow-hidden border border-teams-border/60 shadow-2xl flex items-center justify-center group">
            <video
              ref={localVideoRef as any}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isVideoMuted ? 'hidden' : 'block'}`}
            />

            {isVideoMuted && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-full bg-teams-purple flex items-center justify-center font-bold text-3xl text-white uppercase shadow-xl">
                  {user?.display_name?.charAt(0) || 'U'}
                </div>
                <p className="text-xs text-teams-muted font-medium">{user?.display_name} (Camera Off)</p>
              </div>
            )}

            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 text-xs font-semibold text-white">
              <span>{user?.display_name} (You)</span>
              {isAudioMuted && <span className="text-[10px] bg-rose-600/80 px-1.5 py-0.5 rounded">Muted</span>}
              {isScreenSharing && <span className="text-[10px] bg-teams-purple px-1.5 py-0.5 rounded">Sharing</span>}
            </div>
          </div>

          {remoteVideoTiles.map(([participantId, entry]) => (
            <RemoteVideoTile key={participantId} userName={entry.userName} videoStream={entry.videoStream} audioStream={entry.audioStream} />
          ))}
        </div>

        {/* Intelligence Side Drawer */}
        {activeDrawer && (
          <div className="w-96 bg-[#181818] border-l border-teams-border flex flex-col p-4 z-20 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-teams-border pb-3">
              <h3 className="font-bold text-sm text-white capitalize flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teams-purple" />
                <span>{activeDrawer.replace('-', ' ')} Panel</span>
              </h3>
              <button onClick={() => setActiveDrawer(null)} className="p-1 hover:bg-[#252424] rounded-lg">
                <X className="w-4 h-4 text-teams-muted" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-6 text-center space-y-4">
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
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
        <MeetingControlBar
          isAudioMuted={isAudioMuted}
          isVideoMuted={isVideoMuted}
          isScreenSharing={isScreenSharing}
          isRecording={isRecording}
          notifyParticipants={notifyParticipantsOfRecording}
          activeDrawer={activeDrawer}
          isHost={isHost}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onToggleRecording={handleToggleRecording}
          onToggleNotifyParticipants={toggleRecordingNotificationVisibility}
          onToggleDrawer={handleToggleDrawer}
          onOpenSettings={() => setIsDeviceSettingsOpen(true)}
          onOpenAddParticipant={() => setIsAddParticipantOpen(true)}
          onPopOut={onPopOut}
          onLeaveCall={handleLeave}
          onEndCallForEveryone={handleEndCallForEveryone}
        />
      </div>

      <DeviceSettingsModal
        isOpen={isDeviceSettingsOpen}
        onClose={() => setIsDeviceSettingsOpen(false)}
        selectedCameraId={selectedCameraId}
        selectedMicId={selectedMicId}
        selectedSpeakerId={selectedSpeakerId}
        onSelectCamera={changeCamera}
        onSelectMic={changeMicrophone}
        onSelectSpeaker={changeSpeaker}
      />

      <AddParticipantModal
        isOpen={isAddParticipantOpen}
        onClose={() => setIsAddParticipantOpen(false)}
        conversationId={meetingId}
      />
    </div>
  );
};

// Global persistent audio player component for MeetingRoom
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

const RemoteVideoTile: React.FC<{ userName: string; videoStream?: MediaStream; audioStream?: MediaStream }> = ({
  userName,
  videoStream,
  audioStream
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const hasVideoTrack = Boolean(
    videoStream && videoStream.getVideoTracks().some(t => t.enabled && t.readyState !== 'ended')
  );

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoStream || !hasVideoTrack) return;

    if (el.srcObject !== videoStream) {
      el.srcObject = videoStream;
    }
    el.play().catch((err) => {
      if (err.name !== 'AbortError') {
        console.warn('[MEDIA] Remote video tile play warning:', err);
      }
    });
  }, [videoStream, hasVideoTrack]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioStream) return;

    if (el.srcObject !== audioStream) {
      el.srcObject = audioStream;
    }
    el.play().catch((err) => {
      if (err.name !== 'AbortError') {
        console.warn('[MEDIA] Remote audio element play warning:', err);
      }
    });
  }, [audioStream]);

  return (
    <div className="relative aspect-video bg-[#1F1F1F] rounded-2xl overflow-hidden border border-teams-border/60 shadow-2xl flex items-center justify-center group">
      {hasVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-teams-purple flex items-center justify-center font-bold text-3xl text-white uppercase shadow-xl">
            {userName?.charAt(0) || 'U'}
          </div>
          <p className="text-xs text-teams-muted font-medium">{userName}</p>
        </div>
      )}

      {audioStream && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          controls={false}
        />
      )}

      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 text-xs font-semibold text-white">
        <span>{userName}</span>
      </div>
    </div>
  );
};
