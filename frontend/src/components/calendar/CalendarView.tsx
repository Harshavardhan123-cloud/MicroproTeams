import React, { useEffect, useState } from 'react';
import {
  Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Clock, Video,
  Users, Trash2, LayoutGrid, List, UserCheck, AlertCircle, Copy, Link as LinkIcon, Check
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { ScheduleMeetingModal } from '../modals/ScheduleMeetingModal';
import { ParallelMeetingConflictModal, ClashingMeetingInfo } from '../modals/ParallelMeetingConflictModal';

interface CalendarViewProps {
  onJoinMeeting: (meetingId: string) => void;
}

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  scheduled_start: string;
  scheduled_end: string;
  meeting_code?: string;
  meeting_link?: string;
  host?: {
    id: string;
    display_name: string;
    email: string;
  };
  participants?: any[];
}

const HOURS = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
  '19:00', '20:00', '21:00'
];

export function parseDate(str?: string): Date {
  if (!str) return new Date();
  let s = str;
  if (!s.endsWith('Z') && !s.includes('+') && !s.includes('-')) {
    s += 'Z';
  }
  return new Date(s);
}

function getStartOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onJoinMeeting }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clashingModalOpen, setClashingModalOpen] = useState(false);
  const [clashingEventsList, setClashingEventsList] = useState<ClashingMeetingInfo[]>([]);
  const [viewMode, setViewMode] = useState<'week' | 'agenda'>('week');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getStartOfWeek(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [copiedEventId, setCopiedEventId] = useState<string | null>(null);

  const handleCopyEventLink = (evt: CalendarEvent) => {
    const code = evt.meeting_code || evt.id;
    const link = `${window.location.origin}/#/meet/${code}`;
    navigator.clipboard.writeText(link);
    setCopiedEventId(evt.id);
    setTimeout(() => setCopiedEventId(null), 2500);
  };

  const handleJoinAndNotifyStart = async (meetingId: string) => {
    try {
      await apiClient.post(`/calendar/events/${meetingId}/notify_start`).catch(() => {});
    } catch {
      // ignore
    }
    onJoinMeeting(meetingId);
  };

  const checkEventClash = (evt: CalendarEvent): boolean => {
    if (!evt.scheduled_start || !evt.scheduled_end) return false;
    const eStart = parseDate(evt.scheduled_start).getTime();
    const eEnd = parseDate(evt.scheduled_end).getTime();

    return events.some((other) => {
      if (other.id === evt.id || !other.scheduled_start || !other.scheduled_end) return false;
      const oStart = parseDate(other.scheduled_start).getTime();
      const oEnd = parseDate(other.scheduled_end).getTime();
      return oStart < eEnd && oEnd > eStart;
    });
  };

  const detectParallelClashes = (list: CalendarEvent[]) => {
    const clashingGroup = list.filter((e, idx, arr) =>
      arr.some((other, oIdx) => {
        if (idx === oIdx || !e.scheduled_start || !other.scheduled_start) return false;
        const s1 = parseDate(e.scheduled_start).getTime();
        const e1 = parseDate(e.scheduled_end).getTime();
        const s2 = parseDate(other.scheduled_start).getTime();
        const e2 = parseDate(other.scheduled_end).getTime();
        return s1 < e2 && e1 > s2;
      })
    );

    if (clashingGroup.length >= 2) {
      setClashingEventsList(
        clashingGroup.map((c) => ({
          id: c.id,
          title: c.title,
          scheduled_start: c.scheduled_start,
          scheduled_end: c.scheduled_end,
          host_name: c.host?.display_name || 'Organizer'
        }))
      );
      setClashingModalOpen(true);
    }
  };

  const fetchEvents = async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get('/calendar/events');
      const fetched: CalendarEvent[] = res.data.data || res.data;

      if (fetched && fetched.length > 0) {
        setEvents(fetched);
        detectParallelClashes(fetched);
      } else {
        const monday = getStartOfWeek(new Date());
        const demoList: CalendarEvent[] = [
          {
            id: 'evt-demo-1',
            title: 'Engineering Daily Standup',
            description: 'Sync on sprint goals, blocker resolution & deployment pipeline.',
            scheduled_start: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 10, 0).toISOString(),
            scheduled_end: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 10, 30).toISOString(),
            host: { id: 'u1', display_name: 'Alex Vance', email: 'admin@example.com' }
          },
          {
            id: 'evt-demo-2',
            title: 'Micropro_Commute Architecture Review',
            description: 'Deep dive into SFU Mediasoup scalability & media worker routing.',
            scheduled_start: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1, 14, 0).toISOString(),
            scheduled_end: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1, 15, 30).toISOString(),
            host: { id: 'u2', display_name: 'Alice Smith', email: 'alice@example.com' }
          },
          {
            id: 'evt-demo-3',
            title: 'Product Roadmap & UX Design Sync',
            description: 'Reviewing enterprise admin compliance features & files workspace.',
            scheduled_start: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2, 11, 0).toISOString(),
            scheduled_end: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2, 12, 0).toISOString(),
            host: { id: 'u3', display_name: 'Bob Jones', email: 'bob@example.com' }
          },
          {
            id: 'evt-demo-4',
            title: 'Acme Executive All-Hands',
            description: 'Quarterly organization updates & engineering milestone reviews.',
            scheduled_start: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4, 16, 0).toISOString(),
            scheduled_end: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4, 17, 0).toISOString(),
            host: { id: 'u4', display_name: 'Diana Prince', email: 'diana@example.com' }
          }
        ];
        setEvents(demoList);
      }
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
        if (!eventId.startsWith('evt-demo-')) {
          await apiClient.delete(`/calendar/events/${eventId}`);
        }
        setEvents((prev) => prev.filter((e) => e.id !== eventId));
        if (selectedEvent?.id === eventId) setSelectedEvent(null);
      } catch (err) {
        console.error('Cancel meeting error:', err);
      }
    }
  };

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(currentWeekStart, i));
  const endDateOfWeek = addDays(currentWeekStart, 4);

  const formatWeekRange = () => {
    const startStr = currentWeekStart.toLocaleDateString('default', { month: 'short', day: 'numeric' });
    const endStr = endDateOfWeek.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} – ${endStr}`;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div className="flex-1 bg-[#0B0D12] text-mc-text flex flex-col h-full select-none overflow-hidden">
      {/* Top Header Controls Bar */}
      <div className="h-14 border-b border-white/5 bg-[#11131A] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-white font-display">Calendar & Schedules</h2>
            <p className="text-[11px] text-mc-muted">{formatWeekRange()} • IST (UTC+5:30)</p>
          </div>

          <div className="flex items-center gap-1 bg-[#171923] p-1 rounded-xl border border-white/10 ml-4">
            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
              className="p-1.5 hover:bg-white/5 text-mc-muted hover:text-white rounded-lg transition-colors"
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentWeekStart(getStartOfWeek(new Date()))}
              className="px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
              className="p-1.5 hover:bg-white/5 text-mc-muted hover:text-white rounded-lg transition-colors"
              title="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Switcher */}
          <div className="flex items-center bg-[#171923] p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                viewMode === 'week' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md' : 'text-mc-muted hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Work Week</span>
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                viewMode === 'agenda' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md' : 'text-mc-muted hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Agenda List</span>
            </button>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Meeting</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      {viewMode === 'week' ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0B0D12]">
          {/* Day Headers Grid Row */}
          <div className="grid grid-cols-6 border-b border-white/5 bg-[#11131A] text-xs font-semibold shrink-0">
            <div className="p-3 border-r border-white/5 text-center text-mc-muted font-mono text-[11px]">Time (IST)</div>
            {weekDays.map((day, idx) => {
              const today = isToday(day);
              return (
                <div
                  key={idx}
                  className={`p-3 text-center border-r border-white/5 transition-colors ${
                    today ? 'bg-indigo-600/15 text-white' : 'text-mc-text'
                  }`}
                >
                  <div className="text-[10px] text-mc-muted uppercase tracking-wider font-display">
                    {day.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })}
                  </div>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <span className={`text-sm font-bold ${today ? 'text-indigo-400 font-black' : ''}`}>
                      {day.getDate()}
                    </span>
                    {today && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Weekly Time Slot Matrix */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {HOURS.map((hourStr) => {
              const hourNum = parseInt(hourStr.split(':')[0], 10);

              return (
                <div key={hourStr} className="grid grid-cols-6 min-h-[70px]">
                  {/* Time Label */}
                  <div className="p-2 border-r border-white/5 bg-[#11131A]/40 text-[11px] text-mc-muted font-mono flex items-start justify-center">
                    {hourStr}
                  </div>

                  {/* Day Slots */}
                  {weekDays.map((day, dayIdx) => {
                    const matchingEvents = events.filter((evt) => {
                      if (!evt.scheduled_start) return false;
                      const evtDate = parseDate(evt.scheduled_start);
                      return (
                        evtDate.getDate() === day.getDate() &&
                        evtDate.getMonth() === day.getMonth() &&
                        evtDate.getFullYear() === day.getFullYear() &&
                        evtDate.getHours() === hourNum
                      );
                    });

                    return (
                      <div
                        key={dayIdx}
                        onClick={() => setIsModalOpen(true)}
                        className="border-r border-white/5 p-1.5 hover:bg-white/[0.02] transition-colors relative cursor-pointer group"
                      >
                        {matchingEvents.map((evt) => {
                          const sTime = parseDate(evt.scheduled_start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
                          const isClashing = checkEventClash(evt);

                          return (
                            <div
                              key={evt.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(evt);
                              }}
                              className={`rounded-xl p-2.5 shadow-md text-xs cursor-pointer transition-all group/card mb-1 border ${
                                isClashing
                                  ? 'bg-amber-500/15 border-amber-500/50 hover:bg-amber-500/25'
                                  : 'bg-indigo-600/20 border-indigo-500/40 hover:bg-indigo-600/30'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-white font-display group-hover/card:text-indigo-300 truncate flex-1">
                                  {evt.title}
                                </span>
                                {isClashing && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-300 font-bold border border-amber-500/40 flex items-center gap-0.5 shrink-0" title="Meeting Clash Detected">
                                    <AlertCircle className="w-2.5 h-2.5 text-amber-400" /> Clash
                                  </span>
                                )}
                                <span className="text-[9px] px-2 py-0.2 rounded-full bg-indigo-600 text-white font-semibold shrink-0">
                                  {sTime}
                                </span>
                              </div>
                              <p className="text-[10px] text-mc-muted mt-1 line-clamp-1">
                                {evt.description || `Host: ${evt.host?.display_name || 'Organizer'}`}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Agenda List Mode */
        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-[#0B0D12]">
          {events.length === 0 ? (
            <div className="p-12 text-center text-mc-muted border border-dashed border-white/10 rounded-2xl bg-[#11131A]">
              <CalendarIcon className="w-8 h-8 mx-auto text-mc-muted mb-3 opacity-60" />
              <h3 className="text-white font-bold text-sm mb-1 font-display">No Scheduled Meetings</h3>
              <p className="text-xs text-mc-secondary mb-4">Your calendar is clear for this timeframe.</p>
            </div>
          ) : (
            events.map((evt) => {
              const startDate = evt.scheduled_start ? parseDate(evt.scheduled_start) : new Date();
              const endDate = evt.scheduled_end ? parseDate(evt.scheduled_end) : new Date();
              const isClashing = checkEventClash(evt);

              return (
                <div
                  key={evt.id}
                  className={`border rounded-2xl p-4 flex items-center justify-between shadow-md transition-all group ${
                    isClashing
                      ? 'bg-amber-500/10 border-amber-500/40 hover:border-amber-500'
                      : 'bg-[#11131A] border-white/5 hover:border-indigo-500/40'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center border ${
                      isClashing ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-gradient-to-tr from-indigo-600 to-violet-600 border-indigo-500/40 text-white shadow-md'
                    }`}>
                      <span className="text-[10px] font-bold uppercase">{startDate.toLocaleString('default', { month: 'short' })}</span>
                      <span className="text-lg font-black text-white">{startDate.getDate()}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-white font-display group-hover:text-indigo-300 transition-colors">{evt.title}</h4>
                        {isClashing && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-400" /> Clash Detected
                          </span>
                        )}
                      </div>
                      {evt.description && <p className="text-xs text-mc-muted line-clamp-1">{evt.description}</p>}

                      <div className="flex items-center gap-4 text-[11px] text-mc-muted pt-1">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-400" />
                          <span>
                            {startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} - {endDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Host: {evt.host?.display_name || 'Organizer'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCancel(evt.id)}
                      className="p-2 text-mc-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                      title="Cancel Meeting"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleCopyEventLink(evt)}
                      className="px-3 py-2 bg-[#171923] hover:bg-white/10 border border-white/10 text-indigo-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                      title="Copy Meeting Link"
                    >
                      {copiedEventId === evt.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedEventId === evt.id ? 'Copied!' : 'Copy Link'}</span>
                    </button>

                    <button
                      onClick={() => handleJoinAndNotifyStart(evt.id)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
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
      )}

      {/* Selected Meeting Details Modal Popover */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#11131A] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white font-display">{selectedEvent.title}</h3>
                  <span className="text-[10px] text-indigo-400 font-medium">Scheduled Enterprise Session</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-mc-muted hover:text-white text-xs font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-mc-text">
              <div className="flex items-center gap-2 text-mc-muted">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>
                  {parseDate(selectedEvent.scheduled_start).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })} IST
                </span>
              </div>

              <div className="flex items-center gap-2 text-mc-muted">
                <UserCheck className="w-4 h-4 text-indigo-400" />
                <span>Organizer: {selectedEvent.host?.display_name || 'Acme Executive'}</span>
              </div>

              {selectedEvent.description && (
                <div className="p-3 bg-[#171923] border border-white/5 rounded-xl text-mc-secondary leading-relaxed">
                  {selectedEvent.description}
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center gap-3 justify-end border-t border-white/5">
              <button
                onClick={() => handleCancel(selectedEvent.id)}
                className="px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
              >
                Cancel Meeting
              </button>
              <button
                onClick={() => {
                  const id = selectedEvent.id;
                  setSelectedEvent(null);
                  handleJoinAndNotifyStart(id);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
              >
                <Video className="w-4 h-4" />
                <span>Join Call Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ScheduleMeetingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchEvents}
      />

      <ParallelMeetingConflictModal
        isOpen={clashingModalOpen}
        onClose={() => setClashingModalOpen(false)}
        clashingMeetings={clashingEventsList}
        onResolveMeeting={(id) => {
          setClashingEventsList((prev) => prev.filter((m) => m.id === id));
          setClashingModalOpen(false);
        }}
      />
    </div>
  );
};
