import React from 'react';
import { AlertTriangle, Calendar, Clock, User, X, CheckCircle2, ArrowRight } from 'lucide-react';

export interface ClashingMeetingInfo {
  id: string;
  title: string;
  scheduled_start: string;
  scheduled_end: string;
  host_name?: string;
}

interface ParallelMeetingConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  clashingMeetings: ClashingMeetingInfo[];
  onResolveMeeting?: (meetingIdToKeep: string) => void;
}

export const ParallelMeetingConflictModal: React.FC<ParallelMeetingConflictModalProps> = ({
  isOpen,
  onClose,
  clashingMeetings,
  onResolveMeeting
}) => {
  if (!isOpen || clashingMeetings.length < 2) return null;

  const timeStr = clashingMeetings[0]?.scheduled_start
    ? new Date(clashingMeetings[0].scheduled_start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
    : 'Selected Time';

  const dateStr = clashingMeetings[0]?.scheduled_start
    ? new Date(clashingMeetings[0].scheduled_start).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : 'Today';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 select-none">
      <div className="bg-[#1E1E20] border border-amber-500/50 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header Alert Bar */}
        <div className="bg-gradient-to-r from-amber-600/30 via-rose-600/20 to-amber-600/30 border-b border-amber-500/30 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0 shadow-lg">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <span>Parallel Meeting Conflict</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-extrabold uppercase">
                  {clashingMeetings.length} Meetings Clashing
                </span>
              </h3>
              <p className="text-xs text-amber-200/80">
                You are scheduled for multiple group meetings at {dateStr} • {timeStr}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-amber-200/60 hover:text-white rounded-lg hover:bg-amber-500/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          <p className="text-xs text-teams-muted leading-relaxed">
            Microsoft Teams Enterprise rules require non-overlapping schedules. Below are the group meetings scheduled at the exact same time:
          </p>

          {/* Clashing Meetings List */}
          <div className="space-y-3">
            {clashingMeetings.map((evt, idx) => {
              const sTime = new Date(evt.scheduled_start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
              const eTime = new Date(evt.scheduled_end).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

              return (
                <div
                  key={evt.id || idx}
                  className="bg-[#252528] border border-amber-500/30 hover:border-amber-400 rounded-xl p-4 transition-all shadow-md space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black flex items-center justify-center border border-amber-500/40">
                        {idx + 1}
                      </span>
                      <h4 className="font-bold text-sm text-white">{evt.title}</h4>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-teams-purple text-white font-bold">
                      {sTime} - {eTime} IST
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-teams-muted pt-1 border-t border-[#333336]">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-teams-purple" />
                      <span>Host: {evt.host_name || 'Organizer'}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-300 font-medium">Parallel Schedule</span>
                    </div>
                  </div>

                  {onResolveMeeting && (
                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => onResolveMeeting(evt.id)}
                        className="px-3 py-1.5 bg-teams-purple/30 hover:bg-teams-purple text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 border border-teams-purple/50"
                      >
                        <span>Keep This Meeting</span>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#181819] border-t border-[#2C2C2E] flex items-center justify-between">
          <span className="text-[11px] text-amber-300/80 italic flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Please notify meeting organizers to reschedule parallel slots.
          </span>

          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl shadow-lg shadow-amber-600/20 transition-all flex items-center gap-1.5"
          >
            <span>Acknowledge Conflict</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
