import React, { useEffect, useState } from 'react';
import { X, Calendar as CalendarIcon, Clock, Users, Check, Search, AlertCircle } from 'lucide-react';
import { User } from '../../types';
import { userService } from '../../services/userService';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(today);
      setIsLoadingUsers(true);
      userService
        .getUsers()
        .then((data) => {
          const userList = Array.isArray(data) ? data : (data as any)?.data || [];
          setUsers(userList);
        })
        .catch((err) => {
          console.error('Failed to load users for meeting:', err);
        })
        .finally(() => setIsLoadingUsers(false));
    }
  }, [isOpen]);

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

      await apiClient.post('/calendar/events', {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduled_start: startIso,
        scheduled_end: endIso,
        attendee_ids: selectedUserIds
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Schedule meeting error:', err);
      setError(err.response?.data?.detail || 'Failed to schedule meeting. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#202021] border border-[#333335] rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2C2C2E] bg-[#242426]">
          <div className="flex items-center gap-2.5 font-bold text-sm text-white">
            <div className="w-7 h-7 rounded-lg bg-teams-purple/20 flex items-center justify-center text-teams-purple border border-teams-purple/30">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <span>Schedule New Meeting</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-teams-muted hover:text-white rounded-md hover:bg-teams-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Meeting Title */}
          <div>
            <label className="block text-xs font-semibold text-teams-muted mb-1.5">
              Meeting Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Weekly Product Architecture Sync"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#181819] border border-[#333335] rounded-lg px-3 py-2 text-xs text-white placeholder-teams-muted focus:border-teams-purple focus:outline-none transition-colors"
            />
          </div>

          {/* Date & Time Picker */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-teams-muted mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3 text-teams-purple" />
                <span>Start Date & Time</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-[#181819] border border-[#333335] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-teams-purple focus:outline-none"
                />
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-24 bg-[#181819] border border-[#333335] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-teams-purple focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-teams-muted mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3 text-teams-purple" />
                <span>End Date & Time</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-[#181819] border border-[#333335] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-teams-purple focus:outline-none"
                />
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-24 bg-[#181819] border border-[#333335] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-teams-purple focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Agenda / Details */}
          <div>
            <label className="block text-xs font-semibold text-teams-muted mb-1.5">
              Agenda / Details
            </label>
            <textarea
              rows={3}
              placeholder="Add agenda topics, links, or notes for attendees..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#181819] border border-[#333335] rounded-lg px-3 py-2 text-xs text-white placeholder-teams-muted focus:border-teams-purple focus:outline-none resize-none transition-colors"
            />
          </div>

          {/* Invite Attendees */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-teams-muted flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-teams-purple" />
                <span>Invite Attendees</span>
              </label>
              {selectedUserIds.length > 0 && (
                <span className="text-[10px] text-teams-purple font-semibold bg-teams-purple/15 px-2 py-0.5 rounded-full border border-teams-purple/30">
                  {selectedUserIds.length} selected
                </span>
              )}
            </div>

            {/* Filter Input */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-teams-muted" />
              <input
                type="text"
                placeholder="Search teammates by name or email..."
                value={attendeeSearch}
                onChange={(e) => setAttendeeSearch(e.target.value)}
                className="w-full bg-[#181819] border border-[#333335] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-teams-muted focus:border-teams-purple focus:outline-none"
              />
            </div>

            {/* User List Container */}
            <div className="max-h-40 overflow-y-auto space-y-1 bg-[#181819] border border-[#333335] rounded-lg p-2 min-h-[60px]">
              {isLoadingUsers ? (
                <p className="text-xs text-teams-muted text-center py-4 animate-pulse">
                  Loading workspace members...
                </p>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => toggleUser(u.id)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-teams-purple/20 border border-teams-purple/40 text-white'
                          : 'hover:bg-[#28282B] text-teams-text'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-teams-purple flex items-center justify-center font-bold text-xs text-white uppercase shrink-0 shadow-sm">
                          {u.display_name?.charAt(0) || u.email?.charAt(0) || 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate leading-tight">
                            {u.display_name}
                          </p>
                          <p className="text-[10px] text-teams-muted truncate leading-tight">
                            {u.email}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-teams-purple border-teams-purple text-white'
                            : 'border-teams-border bg-[#252526]'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-teams-muted text-center py-4">
                  {attendeeSearch ? 'No matching members found.' : 'No other workspace members available to invite.'}
                </p>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#2C2C2E]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-teams-muted hover:text-white font-semibold rounded-lg hover:bg-[#28282B] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-5 py-2 text-xs text-white font-bold rounded-lg bg-teams-purple hover:bg-teams-purple-hover disabled:opacity-40 shadow-lg shadow-teams-purple/20 transition-all flex items-center gap-1.5"
            >
              {isSubmitting ? 'Scheduling...' : 'Save & Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
