import React, { useState } from 'react';
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Hand, MessageSquare, Users, Circle, Sparkles, FileText, Bot, Sliders, UserPlus, ExternalLink, ChevronUp, X, Bell, BellOff } from 'lucide-react';

interface MeetingControlBarProps {
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isScreenSharing: boolean;
  isRecording?: boolean;
  notifyParticipants?: boolean;
  activeDrawer?: string | null;
  isHost?: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleRecording?: () => void;
  onToggleNotifyParticipants?: () => void;
  onToggleDrawer?: (drawer: string) => void;
  onOpenSettings?: () => void;
  onOpenAddParticipant?: () => void;
  onPopOut?: () => void;
  onLeaveCall: () => void;
  onEndCallForEveryone?: () => void;
}

export const MeetingControlBar: React.FC<MeetingControlBarProps> = ({
  isAudioMuted,
  isVideoMuted,
  isScreenSharing,
  isRecording = false,
  notifyParticipants = true,
  activeDrawer = null,
  isHost = false,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleRecording,
  onToggleNotifyParticipants,
  onToggleDrawer,
  onOpenSettings,
  onOpenAddParticipant,
  onPopOut,
  onLeaveCall,
  onEndCallForEveryone
}) => {
  const [isLeaveMenuOpen, setIsLeaveMenuOpen] = useState(false);
  return (
    <div className="bg-[#1F1F1F]/90 backdrop-blur-md border border-teams-border rounded-2xl px-6 py-3 flex items-center gap-3 shadow-2xl z-30">
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

      {/* Add Participant Button */}
      {onOpenAddParticipant && (
        <button
          onClick={onOpenAddParticipant}
          className="p-3 rounded-xl transition-all bg-teams-purple text-white hover:bg-teams-purple-hover shadow-lg shadow-teams-purple/20"
          title="Add Participant by Email or Contact"
        >
          <UserPlus className="w-5 h-5" />
        </button>
      )}

      {/* Device Settings Button */}
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="p-3 rounded-xl transition-all bg-[#292929] text-white hover:bg-teams-hover"
          title="Audio & Video Settings"
        >
          <Sliders className="w-5 h-5 text-teams-purple" />
        </button>
      )}

      {/* Pop Out Button */}
      {onPopOut && (
        <button
          onClick={onPopOut}
          className="p-3 rounded-xl transition-all bg-[#292929] text-white hover:bg-teams-hover"
          title="Pop Out Meeting (Picture-in-Picture)"
        >
          <ExternalLink className="w-5 h-5 text-emerald-400" />
        </button>
      )}

      <div className="w-px h-6 bg-teams-border mx-0.5" />

      {/* Record Toggle Button */}
      {onToggleRecording && (
        <button
          onClick={onToggleRecording}
          className={`px-3 py-3 rounded-xl transition-all flex items-center gap-1.5 font-bold text-xs ${
            isRecording
              ? 'bg-rose-600/20 text-rose-400 border border-rose-500/50 animate-pulse'
              : 'bg-[#292929] text-white hover:bg-teams-hover'
          }`}
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          <Circle className={`w-4 h-4 ${isRecording ? 'fill-current text-rose-500' : ''}`} />
          <span>{isRecording ? 'REC' : 'Record'}</span>
        </button>
      )}

      {/* Host Toggle: Notify Participants of Recording */}
      {isHost && onToggleNotifyParticipants && (
        <button
          onClick={onToggleNotifyParticipants}
          className={`px-3 py-2.5 rounded-xl transition-all flex items-center gap-1.5 font-bold text-xs border ${
            notifyParticipants
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
          }`}
          title={
            notifyParticipants
              ? 'Recording alert is SHOWN to attendees (Click to hide)'
              : 'Recording alert is HIDDEN from attendees (Click to show)'
          }
        >
          {notifyParticipants ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          <span className="hidden sm:inline">{notifyParticipants ? 'Alert: ON' : 'Alert: OFF'}</span>
        </button>
      )}

      {/* Intelligence & Drawer Buttons */}
      {onToggleDrawer && (
        <>
          <button
            onClick={() => onToggleDrawer('summary')}
            className={`p-3 rounded-xl transition-all ${
              activeDrawer === 'summary' ? 'bg-teams-purple text-white' : 'bg-[#292929] text-white hover:bg-teams-hover'
            }`}
            title="AI Summary & Insights"
          >
            <Sparkles className="w-5 h-5" />
          </button>

          <button
            onClick={() => onToggleDrawer('transcript')}
            className={`p-3 rounded-xl transition-all ${
              activeDrawer === 'transcript' ? 'bg-teams-purple text-white' : 'bg-[#292929] text-white hover:bg-teams-hover'
            }`}
            title="Searchable Transcript"
          >
            <FileText className="w-5 h-5" />
          </button>

          <button
            onClick={() => onToggleDrawer('assistant')}
            className={`p-3 rounded-xl transition-all ${
              activeDrawer === 'assistant' ? 'bg-teams-purple text-white' : 'bg-[#292929] text-white hover:bg-teams-hover'
            }`}
            title="AI Meeting Assistant"
          >
            <Bot className="w-5 h-5" />
          </button>
        </>
      )}

      <div className="w-px h-6 bg-teams-border mx-0.5" />

      {/* Leave / End Call Split Button for Host */}
      {isHost && onEndCallForEveryone ? (
        <div className="relative">
          {/* Popover Dropdown Menu */}
          {isLeaveMenuOpen && (
            <div className="absolute bottom-full right-0 mb-3 w-56 bg-[#242424] border border-teams-border rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <button
                onClick={() => {
                  setIsLeaveMenuOpen(false);
                  onEndCallForEveryone();
                }}
                className="w-full px-3 py-2.5 hover:bg-rose-600/20 hover:text-rose-400 text-rose-400 text-xs font-bold rounded-lg flex items-center gap-2.5 transition-all text-left group"
              >
                <div className="w-6 h-6 rounded-md bg-rose-600/30 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <PhoneOff className="w-3.5 h-3.5 text-rose-400 group-hover:text-white" />
                </div>
                <div>
                  <p className="font-bold">End meeting for all</p>
                  <p className="text-[10px] text-rose-300/70 font-normal">Terminates call for everyone</p>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsLeaveMenuOpen(false);
                  onLeaveCall();
                }}
                className="w-full px-3 py-2.5 hover:bg-[#333333] text-teams-muted hover:text-white text-xs font-medium rounded-lg flex items-center gap-2.5 transition-all text-left"
              >
                <div className="w-6 h-6 rounded-md bg-[#333333] flex items-center justify-center shrink-0">
                  <PhoneOff className="w-3.5 h-3.5 text-teams-muted" />
                </div>
                <div>
                  <p className="font-bold text-white">Leave meeting</p>
                  <p className="text-[10px] text-teams-muted font-normal">Only you will leave</p>
                </div>
              </button>
            </div>
          )}

          {/* Teams Split Red Button */}
          <div className="flex items-center rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg shadow-rose-600/25 transition-all overflow-hidden">
            <button
              onClick={() => setIsLeaveMenuOpen(!isLeaveMenuOpen)}
              className="px-4 py-3 flex items-center gap-2 border-r border-rose-700 hover:bg-rose-700 transition-colors"
              title="Leave or End Meeting"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Leave Meeting</span>
            </button>
            <button
              onClick={() => setIsLeaveMenuOpen(!isLeaveMenuOpen)}
              className="px-2.5 py-3 hover:bg-rose-700 transition-colors flex items-center justify-center"
              title="Meeting Exit Options"
            >
              <ChevronUp className={`w-4 h-4 transition-transform duration-200 ${isLeaveMenuOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onLeaveCall}
          className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all active:scale-95"
        >
          <PhoneOff className="w-4 h-4" />
          <span>Leave Meeting</span>
        </button>
      )}
    </div>
  );
};
