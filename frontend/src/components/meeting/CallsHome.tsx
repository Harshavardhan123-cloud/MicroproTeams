import React, { useEffect, useState } from 'react';
import { Video, PhoneCall, Loader2, Maximize2 } from 'lucide-react';
import { meetingService, CallHistoryEntry } from '../../services/meetingService';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';

interface CallsHomeProps {
  onMeetingStarted: (meetingId: string) => void;
}

export const CallsHome: React.FC<CallsHomeProps> = ({ onMeetingStarted }) => {
  const { user } = useAuthStore();
  const { callState, canRejoin, setIsCallMinimized, rejoinLastCall } = useCallStore();
  const [history, setHistory] = useState<CallHistoryEntry[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    meetingService
      .getCallHistory()
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setIsLoadingHistory(false));
  }, []);

  const startInstantMeeting = async () => {
    setIsStarting(true);
    try {
      const meeting = await meetingService.createInstantMeeting(`${user?.display_name || 'New'}'s Meeting`);
      
      useCallStore.setState({
        callState: 'active',
        callType: 'video',
        caller: user ? { id: user.id, name: user.display_name } : null,
        recipient: null,
        conversationId: meeting.id,
        callId: meeting.id,
        isGroupCall: true,
        isCaller: true,
        isCallMinimized: false,
        canRejoin: false
      });

      onMeetingStarted(meeting.id);
    } catch (err) {
      console.error('Failed to start meeting:', err);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="flex-1 bg-[#0B0D12] p-8 overflow-y-auto select-none">
      <div className="max-w-2xl mx-auto space-y-8">
        {(callState === 'active' || canRejoin) && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 flex items-center justify-between shadow-xl animate-in fade-in slide-in-from-top-3 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <div>
                <h3 className="font-bold text-sm text-emerald-400 font-display">Live Meeting in Progress</h3>
                <p className="text-xs text-emerald-300/70">
                  {callState === 'active' ? 'You are currently connected to an active call.' : 'Click to rejoin your meeting.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (callState === 'active') {
                  setIsCallMinimized(false);
                } else if (canRejoin) {
                  rejoinLastCall();
                }
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl inline-flex items-center gap-2 shadow-lg transition-all active:scale-95 shrink-0"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Rejoin Call</span>
            </button>
          </div>
        )}

        <div className="bg-[#11131A] border border-white/10 rounded-2xl p-8 text-center space-y-4 shadow-xl relative overflow-hidden">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center mx-auto shadow-lg shadow-indigo-600/30">
            <Video className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white font-display">Cinematic Video & Audio Rooms</h2>
          <p className="text-xs text-mc-secondary max-w-md mx-auto">
            Host high-definition WebRTC video meetings with real-time AI transcriptions, automated summaries, and persistent action items.
          </p>
          <button
            onClick={startInstantMeeting}
            disabled={isStarting}
            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 text-white font-bold text-xs rounded-xl inline-flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
          >
            {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
            <span>Start Instant Meeting</span>
          </button>
        </div>

        <div>
          <h3 className="text-xs font-bold text-mc-muted uppercase tracking-wider mb-3">Recent Call Sessions</h3>
          {isLoadingHistory ? (
            <div className="flex items-center gap-2 text-mc-muted text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading history…
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-mc-muted">No prior call records found.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between bg-[#11131A] border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
                      <PhoneCall className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white font-display">{h.title}</p>
                      <p className="text-[11px] text-mc-muted">
                        Hosted by {h.host_name} · {h.participant_count} participant{h.participant_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-400 uppercase bg-indigo-600/10 px-2 py-0.5 rounded-full">{h.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
