import React, { useState } from 'react';
import { useWebRTC } from '../../hooks/useWebRTC';
import { MeetingLobby } from './MeetingLobby';
import { MeetingControlBar } from './MeetingControlBar';
import { useAuthStore } from '../../stores/authStore';
import { Users, Shield, Clock } from 'lucide-react';

interface MeetingRoomProps {
  title?: string;
  onLeave?: () => void;
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({ title = 'General Standup & Sync', onLeave }) => {
  const { user } = useAuthStore();
  const [hasJoined, setHasJoined] = useState(false);
  const {
    localStream,
    localVideoRef,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    stopStream
  } = useWebRTC();

  const handleLeave = () => {
    stopStream();
    if (onLeave) onLeave();
    else setHasJoined(false);
  };

  if (!hasJoined) {
    return (
      <MeetingLobby
        localVideoRef={localVideoRef}
        isAudioMuted={isAudioMuted}
        isVideoMuted={isVideoMuted}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onJoinMeeting={() => setHasJoined(true)}
      />
    );
  }

  return (
    <div className="flex-1 bg-[#141414] flex flex-col h-full relative overflow-hidden select-none">
      {/* Top Meeting Header Bar */}
      <div className="h-14 bg-[#1F1F1F]/80 backdrop-blur border-b border-teams-border flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="font-bold text-sm text-white">{title}</h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold uppercase">
            Live Meeting
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-teams-muted">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>00:14:32</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-teams-purple" />
            <span>1 Participant</span>
          </div>
        </div>
      </div>

      {/* Main Video Stream Grid */}
      <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 gap-4 items-center justify-center overflow-hidden">
        {/* Local Participant Video Feed */}
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

          {/* Name & Status Overlay */}
          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 text-xs font-semibold text-white">
            <span>{user?.display_name} (You)</span>
            {isAudioMuted && <span className="text-[10px] bg-rose-600/80 px-1.5 py-0.5 rounded">Muted</span>}
            {isScreenSharing && <span className="text-[10px] bg-teams-purple px-1.5 py-0.5 rounded">Sharing</span>}
          </div>
        </div>
      </div>

      {/* Floating Bottom Call Control Bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <MeetingControlBar
          isAudioMuted={isAudioMuted}
          isVideoMuted={isVideoMuted}
          isScreenSharing={isScreenSharing}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onLeaveCall={handleLeave}
        />
      </div>
    </div>
  );
};
