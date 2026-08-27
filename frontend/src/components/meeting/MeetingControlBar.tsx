import React from 'react';
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Hand, MessageSquare, Users } from 'lucide-react';

interface MeetingControlBarProps {
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isScreenSharing: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onLeaveCall: () => void;
}

export const MeetingControlBar: React.FC<MeetingControlBarProps> = ({
  isAudioMuted,
  isVideoMuted,
  isScreenSharing,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onLeaveCall
}) => {
  return (
    <div className="bg-[#1F1F1F]/90 backdrop-blur-md border border-teams-border rounded-2xl px-6 py-3 flex items-center gap-4 shadow-2xl z-30">
      {/* Audio Mute/Unmute */}
      <button
        onClick={onToggleAudio}
        className={`p-3 rounded-xl transition-all ${
          isAudioMuted ? 'bg-rose-600 text-white shadow-rose-600/30' : 'bg-[#292929] text-white hover:bg-teams-hover'
        }`}
        title={isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone'}
      >
        {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>

      {/* Video Camera Toggle */}
      <button
        onClick={onToggleVideo}
        className={`p-3 rounded-xl transition-all ${
          isVideoMuted ? 'bg-rose-600 text-white shadow-rose-600/30' : 'bg-[#292929] text-white hover:bg-teams-hover'
        }`}
        title={isVideoMuted ? 'Turn Camera On' : 'Turn Camera Off'}
      >
        {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
      </button>

      {/* Screen Sharing Toggle */}
      <button
        onClick={onToggleScreenShare}
        className={`p-3 rounded-xl transition-all ${
          isScreenSharing ? 'bg-teams-purple text-white shadow-teams-purple/30' : 'bg-[#292929] text-white hover:bg-teams-hover'
        }`}
        title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
      >
        <MonitorUp className="w-5 h-5" />
      </button>

      <div className="w-px h-6 bg-teams-border mx-1" />

      {/* Raise Hand */}
      <button className="p-3 bg-[#292929] text-white hover:bg-teams-hover rounded-xl transition-all" title="Raise Hand">
        <Hand className="w-5 h-5" />
      </button>

      {/* Toggle Chat Drawer */}
      <button className="p-3 bg-[#292929] text-white hover:bg-teams-hover rounded-xl transition-all" title="Meeting Chat">
        <MessageSquare className="w-5 h-5" />
      </button>

      {/* Participants Drawer */}
      <button className="p-3 bg-[#292929] text-white hover:bg-teams-hover rounded-xl transition-all" title="Participants">
        <Users className="w-5 h-5" />
      </button>

      <div className="w-px h-6 bg-teams-border mx-1" />

      {/* Leave Meeting Button */}
      <button
        onClick={onLeaveCall}
        className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all"
      >
        <PhoneOff className="w-4 h-4" />
        <span>Leave Meeting</span>
      </button>
    </div>
  );
};
