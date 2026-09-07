import React, { useEffect, useState } from 'react';
import { X, Calendar as CalendarIcon, Clock, Users, Check, Search, AlertCircle, Copy, Link as LinkIcon, Video, CheckCircle2, Share2 } from 'lucide-react';
import { User } from '../../types';
import { userService } from '../../services/userService';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useCallStore } from '../../stores/callStore';
import { useNotificationStore } from '../../stores/notificationStore';

interface ScheduleMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ScheduleMeetingModal: React.FC<ScheduleMeetingModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { user: currentUser } = useAuthStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('11:00');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [existingEvents, setExistingEvents] = useState<any[]>([]);
  const [clashWarning, setClashWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [scheduledMeeting, setScheduledMeeting] = useState<any | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setClashWarning(null);
      setScheduledMeeting(null);
      setCopiedLink(false);
      setCopiedInvite(false);
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(today);
      setIsLoadingUsers(true);

      // Load users & existing events for live clash avoidance
      Promise.all([
        userService.getUsers(),
        apiClient.get('/calendar/events').catch(() => ({ data: [] }))
      ])
        .then(([userData, eventsData]) => {
          const userList = Array.isArray(userData) ? userData : (userData as any)?.data || [];
          setUsers(userList);
          const eventList = Array.isArray(eventsData.data) ? eventsData.data : eventsData.data?.data || [];
          setExistingEvents(eventList);
        })
        .catch((err) => {
          console.error('Failed to load users/events for meeting:', err);
        })
        .finally(() => setIsLoadingUsers(false));
    }
  }, [isOpen]);

  // Check for time slot clash on schedule inputs change
  useEffect(() => {
    if (!startDate || !startTime || !endDate || !endTime) {
      setClashWarning(null);
      return;
    }
    try {
      const start = new Date(`${startDate}T${startTime}:00`).getTime();
      const end = new Date(`${endDate}T${endTime}:00`).getTime();

      if (start >= end) {
        setClashWarning('Start time must be before end time.');
        return;
      }

      const conflicting = existingEvents.find((evt) => {
        if (!evt.scheduled_start || !evt.scheduled_end) return false;
        const eStart = new Date(evt.scheduled_start).getTime();
        const eEnd = new Date(evt.scheduled_end).getTime();
        return eStart < end && eEnd > start;
      });

      if (conflicting) {
        const sTimeStr = new Date(conflicting.scheduled_start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
        const eTimeStr = new Date(conflicting.scheduled_end).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
        setClashWarning(`Meeting Clash: "${conflicting.title}" is already scheduled at ${sTimeStr} - ${eTimeStr} IST.`);
      } else {
        setClashWarning(null);
      }
    } catch {
      setClashWarning(null);
    }
  }, [startDate, startTime, endDate, endTime, existingEvents]);

  if (!isOpen) return null;

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const filteredUsers = users.filter(
    (u) =>
      u.id !== currentUser?.id &&
      (u.display_name?.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(attendeeSearch.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Please enter a meeting title.');
      return;
    }

    if (clashWarning && clashWarning.includes('Meeting Clash')) {
      setError(clashWarning);
      return;
    }

    try {
      setIsSubmitting(true);
      let startIso: string;
      let endIso: string;

      try {
        startIso = new Date(`${startDate}T${startTime}:00`).toISOString();
        endIso = new Date(`${endDate}T${endTime}:00`).toISOString();
      } catch {
        startIso = new Date().toISOString();
        endIso = new Date(Date.now() + 3600000).toISOString();
      }

      const res = await apiClient.post('/calendar/events', {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduled_start: startIso,
        scheduled_end: endIso,
        attendee_ids: selectedUserIds
      });

      const meetingData = res.data?.data || res.data;
      setScheduledMeeting({
        ...meetingData,
        title: title.trim(),
        description: description.trim(),
        scheduled_start: startIso,
        scheduled_end: endIso
      });

      useNotificationStore.getState().addToast({
        title: 'Meeting Scheduled',
        body: `Meeting '${title.trim()}' scheduled. Meeting link ready.`,
        type: 'info'
      });

      onSuccess();
    } catch (err: any) {
      console.error('Schedule meeting error:', err);
      const msg = err.response?.data?.message || err.response?.data?.detail || 'Failed to schedule meeting. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const meetingUrl = scheduledMeeting?.meeting_code
    ? `${window.location.origin}/#/meet/${scheduledMeeting.meeting_code}`
    : `${window.location.origin}/#/app/teams`;

  const handleCopyMeetingLink = () => {
    navigator.clipboard.writeText(meetingUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyInvitation = () => {
    const startStr = scheduledMeeting?.scheduled_start
      ? new Date(scheduledMeeting.scheduled_start).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
      : '';
    const inviteText = `You are invited to join a Micropro Commute meeting:\n\nTitle: ${scheduledMeeting?.title || 'Team Meeting'}\nTime: ${startStr}\nJoin Link: ${meetingUrl}\nMeeting Code: ${scheduledMeeting?.meeting_code || ''}`;
    navigator.clipboard.writeText(inviteText);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  };

  const handleJoinNow = () => {
    if (!scheduledMeeting) return;
    useUIStore.setState({ activeTab: 'calls', activeMeetingId: scheduledMeeting.id });
    useCallStore.setState({
      callState: 'active',
      callType: 'video',
      caller: currentUser ? { id: currentUser.id, name: currentUser.display_name } : null,
      recipient: null,
      conversationId: scheduledMeeting.id,
      callId: scheduledMeeting.id,
      isGroupCall: true,
      isCaller: true,
      isCallMinimized: false,
      canRejoin: false
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#171923] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#11131A]">
          <div className="flex items-center gap-2.5 font-bold text-sm text-mc-text font-display">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <CalendarIcon className="w-4 h-4 text-white" />
            </div>
            <span>{scheduledMeeting ? 'Meeting Scheduled!' : 'Schedule New Meeting'}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-mc-muted hover:text-mc-text rounded-xl hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Screen with Shareable Link */}
        {scheduledMeeting ? (
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10 animate-in zoom-in-90 duration-200">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-white font-display">Meeting Link Created</h3>
              <p className="text-xs text-mc-muted max-w-sm mx-auto leading-relaxed">
                Your meeting has been scheduled on the workspace calendar. Share the meeting link with attendees to let them join directly.
              </p>
            </div>

            {/* Meeting Summary Box */}
            <div className="p-4 bg-[#11131A] rounded-2xl border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-mc-muted">Title</span>
                <span className="text-xs font-bold text-white font-display truncate max-w-[260px]">{scheduledMeeting.title}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-mc-muted">Meeting Code</span>
                <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/20">{scheduledMeeting.meeting_code}</span>
              </div>
              {scheduledMeeting.scheduled_start && (
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-mc-muted">Scheduled Time</span>
                  <span className="text-xs text-slate-300">
                    {new Date(scheduledMeeting.scheduled_start).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>

            {/* Shareable Link Input Box */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-mc-muted flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-indigo-400" /> Shareable Meeting Link
              </label>
              <div className="flex items-center gap-2 p-2.5 bg-[#0B0D12] border border-white/10 rounded-xl focus-within:border-indigo-500/50 transition-colors">
                <input
                  type="text"
                  readOnly
                  value={meetingUrl}
                  className="bg-transparent text-xs text-indigo-300 font-mono flex-1 outline-none select-all truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyMeetingLink}
                  className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/30 active:scale-95 shrink-0 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyInvitation}
                  className="flex-1 py-2.5 px-3 bg-[#11131A] hover:bg-white/5 border border-white/10 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {copiedInvite ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-indigo-400" />}
                  <span>{copiedInvite ? 'Invitation Copied' : 'Copy Full Invite'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleJoinNow}
                  className="flex-1 py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-600/20 active:scale-95 cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                  <span>Join Now</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 text-xs text-mc-muted hover:text-white font-semibold rounded-xl hover:bg-white/5 transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 text-xs p-3 rounded-xl flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Meeting Title */}
          <div>
            <label className="block text-xs font-semibold text-mc-muted mb-1.5 uppercase tracking-wider">
              Meeting Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Weekly Product Architecture Sync"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#11131A] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-mc-text placeholder-mc-muted focus:border-indigo-500 focus:outline-none transition-all"
            />
          </div>

          {/* Date & Time Picker */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-mc-muted mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Start Date & Time (IST)</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-[#11131A] border border-white/10 rounded-xl px-3 py-2 text-xs text-mc-text focus:border-indigo-500 focus:outline-none"
                />
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-28 bg-[#11131A] border border-white/10 rounded-xl px-3 py-2 text-xs text-mc-text focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-mc-muted mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>End Date & Time (IST)</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-[#11131A] border border-white/10 rounded-xl px-3 py-2 text-xs text-mc-text focus:border-indigo-500 focus:outline-none"
                />
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-28 bg-[#11131A] border border-white/10 rounded-xl px-3 py-2 text-xs text-mc-text focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {clashWarning && (
            <div className="bg-amber-500/10 border border-amber-500/40 text-amber-600 dark:text-amber-300 text-xs p-3 rounded-xl flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{clashWarning}</span>
            </div>
          )}

          {/* Agenda / Details */}
          <div>
            <label className="block text-xs font-semibold text-mc-muted mb-1.5 uppercase tracking-wider">
              Agenda / Details
            </label>
            <textarea
              rows={3}
              placeholder="Add agenda topics, links, or notes for attendees..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#11131A] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-mc-text placeholder-mc-muted focus:border-indigo-500 focus:outline-none resize-none transition-all"
            />
          </div>

          {/* Invite Attendees */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-mc-muted flex items-center gap-1.5 uppercase tracking-wider">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>Invite Attendees</span>
              </label>
              {selectedUserIds.length > 0 && (
                <span className="badge-gradient text-[10px] text-white font-bold bg-gradient-to-r from-indigo-600 to-violet-600 px-2.5 py-0.5 rounded-full shadow-sm">
                  {selectedUserIds.length} selected
                </span>
              )}
            </div>

            {/* Filter Input */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-mc-muted" />
              <input
                type="text"
                placeholder="Search teammates by name or email..."
                value={attendeeSearch}
                onChange={(e) => setAttendeeSearch(e.target.value)}
                className="w-full bg-[#11131A] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-mc-text placeholder-mc-muted focus:border-indigo-500 focus:outline-none transition-all"
              />
            </div>

            {/* User List Container */}
            <div className="max-h-44 overflow-y-auto space-y-1.5 bg-[#11131A] border border-white/10 rounded-xl p-2 min-h-[60px]">
              {isLoadingUsers ? (
                <p className="text-xs text-mc-muted text-center py-4 animate-pulse">
                  Loading workspace members...
                </p>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => toggleUser(u.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-indigo-600/20 border border-indigo-500/40'
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-xs text-white uppercase shrink-0 shadow-md">
                          {u.display_name?.charAt(0) || u.email?.charAt(0) || 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-mc-text truncate leading-tight">
                            {u.display_name}
                          </p>
                          <p className="text-[10px] text-mc-muted truncate leading-tight">
                            {u.email}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-500 text-white shadow-sm'
                            : 'border-white/20'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-mc-muted text-center py-4">
                  {attendeeSearch ? 'No matching members found.' : 'No other workspace members available to invite.'}
                </p>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-mc-muted hover:text-mc-text font-semibold rounded-xl hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-5 py-2 text-xs text-white font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-1.5 active:scale-95"
            >
              {isSubmitting ? 'Scheduling...' : 'Save & Schedule'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
