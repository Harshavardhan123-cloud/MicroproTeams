import React from 'react';
import { Mic, MicOff, Video, VideoOff, Play, GripHorizontal } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useDraggable } from '../../hooks/useDraggable';

interface MeetingLobbyProps {
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onJoinMeeting: () => void;
}

export const MeetingLobby: React.FC<MeetingLobbyProps> = ({
  localVideoRef,
  isAudioMuted,
  isVideoMuted,
  onToggleAudio,
  onToggleVideo,
  onJoinMeeting
}) => {
  const { user } = useAuthStore();
  const draggable = useDraggable();

  return (
    <div className="flex-1 bg-[#141414] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div 
        style={draggable.style}
        onMouseDown={draggable.handleDragStart}
        onTouchStart={draggable.handleDragStart}
        className={`max-w-xl w-full bg-[#1F1F1F] border border-teams-border rounded-2xl p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200 select-none cursor-grab active:cursor-grabbing ${draggable.position ? 'fixed z-50' : 'relative'}`}
      >
        <div className="text-center space-y-1 flex flex-col items-center cursor-grab active:cursor-grabbing">
          <GripHorizontal className="w-5 h-5 text-teams-muted opacity-60 mb-1" />
          <h2 className="text-xl font-bold text-white">Ready to join the meeting?</h2>
          <p className="text-xs text-teams-muted">Check your camera and microphone settings before joining.</p>
        </div>

        {/* Camera Preview Tile */}
        <div className="relative aspect-video bg-[#141414] rounded-xl overflow-hidden border border-teams-border flex items-center justify-center shadow-inner">
          <video
            ref={localVideoRef as any}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isVideoMuted ? 'hidden' : 'block'}`}
          />

          {isVideoMuted && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-teams-purple flex items-center justify-center font-bold text-2xl text-white uppercase shadow-lg">
                {user?.display_name?.charAt(0) || 'U'}
              </div>
              <p className="text-xs text-teams-muted">Camera is turned off</p>
            </div>
          )}

          {/* Quick Pre-join Controls Overlay */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#1A1A1A]/80 backdrop-blur px-4 py-2 rounded-xl border border-teams-border/50">
            <button
              onClick={onToggleAudio}
              className={`p-2 rounded-lg ${isAudioMuted ? 'bg-rose-600 text-white' : 'bg-[#292929] text-white hover:bg-teams-hover'}`}
            >
              {isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              onClick={onToggleVideo}
              className={`p-2 rounded-lg ${isVideoMuted ? 'bg-rose-600 text-white' : 'bg-[#292929] text-white hover:bg-teams-hover'}`}
            >
              {isVideoMuted ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Join CTA Footer */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-teams-muted">
            Signed in as <span className="font-bold text-white">{user?.display_name}</span>
          </div>

          <button
            onClick={onJoinMeeting}
            className="px-6 py-2.5 bg-teams-purple hover:bg-teams-purple-hover text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-teams-purple/20 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Join Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
