import React, { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Clock, Video, Users, Trash2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { ScheduleMeetingModal } from '../modals/ScheduleMeetingModal';

interface CalendarViewProps {
  onJoinMeeting: (meetingId: string) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onJoinMeeting }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchEvents = async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get('/calendar/events');
      setEvents(res.data.data || res.data);
    } catch (err) {
      console.error('Fetch calendar events error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleCancel = async (eventId: string) => {
    if (confirm('Are you sure you want to cancel this scheduled meeting?')) {
      try {
        await apiClient.delete(`/calendar/events/${eventId}`);
        fetchEvents();
      } catch (err) {
        console.error('Cancel meeting error:', err);
      }
    }
  };

  return (
    <div className="flex-1 bg-[#181818] flex flex-col h-full select-none overflow-hidden">
      {/* Top Header */}
      <div className="h-14 border-b border-teams-border flex items-center justify-between px-6 bg-[#1F1F1F]">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-5 h-5 text-teams-purple" />
          <h2 className="font-bold text-sm text-white">Calendar & Scheduled Meetings</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-teams-purple hover:bg-teams-purple-hover text-white font-semibold text-xs rounded-lg flex items-center gap-2 shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Meeting</span>
          </button>
        </div>
      </div>

      {/* Events Agenda List Grid */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {isLoading ? (
          <div className="p-8 text-center text-teams-muted animate-pulse text-xs">Loading scheduled calendar events...</div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center text-teams-muted border border-dashed border-teams-border rounded-xl bg-[#1F1F1F]">
            <CalendarIcon className="w-8 h-8 mx-auto text-teams-muted mb-3 opacity-60" />
            <h3 className="text-white font-bold text-sm mb-1">No Scheduled Meetings</h3>
            <p className="text-xs text-teams-muted mb-4">Your calendar is completely clear for the upcoming week.</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-teams-purple text-white text-xs font-semibold rounded-lg hover:bg-teams-purple-hover transition-colors"
            >
              + Schedule your first meeting
            </button>
          </div>
        ) : (
          events.map((evt) => {
            const startDate = evt.scheduled_start ? new Date(evt.scheduled_start) : new Date();
            const endDate = evt.scheduled_end ? new Date(evt.scheduled_end) : new Date();

            return (
              <div
                key={evt.id}
                className="bg-[#1F1F1F] border border-teams-border hover:border-teams-purple/50 rounded-xl p-4 flex items-center justify-between shadow-md transition-all group"
              >
                <div className="flex items-center gap-4">
                  {/* Date Badge */}
                  <div className="w-14 h-14 rounded-xl bg-teams-purple/20 border border-teams-purple/40 flex flex-col items-center justify-center text-teams-purple">
                    <span className="text-[10px] font-bold uppercase">{startDate.toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-lg font-extrabold text-white">{startDate.getDate()}</span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-white group-hover:text-teams-purple transition-colors">{evt.title}</h4>
                    {evt.description && <p className="text-xs text-teams-muted line-clamp-1">{evt.description}</p>}

                    <div className="flex items-center gap-4 text-[11px] text-teams-muted pt-1">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-teams-purple" />
                        <span>
                          {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-teams-purple" />
                        <span>Host: {evt.host?.display_name || 'Organizer'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCancel(evt.id)}
                    className="p-2 text-teams-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Cancel Meeting"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onJoinMeeting(evt.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    <Video className="w-4 h-4" />
                    <span>Join Meeting</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <ScheduleMeetingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchEvents}
      />
    </div>
  );
};
