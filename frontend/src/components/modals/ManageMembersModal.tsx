import React, { useEffect, useState } from 'react';
import { X, UserPlus, Trash2, Clock, AlertCircle } from 'lucide-react';
import { Team, User } from '../../types';
import { teamService } from '../../services/teamService';
import { userService } from '../../services/userService';

interface ManageMembersModalProps {
  team: Team | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ManageMembersModal: React.FC<ManageMembersModalProps> = ({ team, isOpen, onClose }) => {
  const [members, setMembers] = useState<any[]>([]);
  const [orgUsers, setOrgUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [historySharingOption, setHistorySharingOption] = useState<'ALL' | 'NONE' | 'DAYS'>('ALL');
  const [historyDays, setHistoryDays] = useState<number>(7);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchMembers = async () => {
    if (!team) return;
    try {
      setIsLoading(true);
      const data = await teamService.getTeamMembers(team.id);
      setMembers(data);
      const users = await userService.getUsers();
      setOrgUsers(users);
    } catch (err) {
      console.error('Fetch members error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && team) {
      fetchMembers();
      setErrorMsg(null);
    }
  }, [isOpen, team?.id]);

  if (!isOpen || !team) return null;

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    try {
      setErrorMsg(null);
      await teamService.addTeamMember(team.id, {
        user_id: selectedUserId,
        role: 'member',
        history_sharing_option: historySharingOption,
        history_days: historySharingOption === 'DAYS' ? Number(historyDays) || 7 : undefined
      });
      setSelectedUserId('');
      setHistorySharingOption('ALL');
      fetchMembers();
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.error?.message ||
        err.message ||
        'Failed to add member';
      setErrorMsg(detail);
      console.error('Add member error:', err);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member from the team?')) return;
    try {
      await teamService.removeTeamMember(team.id, userId);
      fetchMembers();
    } catch (err) {
      console.error('Remove member error:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#252525] border border-slate-200 dark:border-teams-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-slate-200 dark:border-teams-border flex items-center justify-between bg-slate-50 dark:bg-[#1F1F1F]">
          <div className="flex items-center gap-2 font-bold text-base text-slate-900 dark:text-white">
            <UserPlus className="w-5 h-5 text-indigo-600 dark:text-teams-purple" />
            <span>Manage Members — {team.name}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 dark:text-teams-muted hover:text-slate-900 dark:hover:text-white rounded cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Add Member Form */}
          <div className="space-y-3 bg-slate-50 dark:bg-[#1F1F1F] p-3.5 rounded-xl border border-slate-200 dark:border-teams-border/60">
            <div className="flex items-center gap-2">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="flex-1 bg-white dark:bg-[#252525] border border-slate-200 dark:border-teams-border rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-teams-text focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="">Select team member to invite...</option>
                {orgUsers
                  .filter((u) => !members.some((m) => m.user_id === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name} ({u.email})
                    </option>
                  ))}
              </select>
              <button
                onClick={handleAddMember}
                disabled={!selectedUserId}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 dark:bg-teams-purple dark:hover:bg-teams-purple-hover text-white font-semibold text-xs rounded-lg shadow disabled:opacity-50 transition-all cursor-pointer shrink-0"
              >
                Add Member
              </button>
            </div>

            {/* History Sharing selector */}
            <div className="pt-2 border-t border-slate-200 dark:border-white/5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-white">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>Share Chat History</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modalHistoryOption"
                    checked={historySharingOption === 'ALL'}
                    onChange={() => setHistorySharingOption('ALL')}
                    className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-slate-800 dark:text-white">Include all chat history</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modalHistoryOption"
                    checked={historySharingOption === 'DAYS'}
                    onChange={() => setHistorySharingOption('DAYS')}
                    className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-slate-800 dark:text-white flex items-center gap-1.5">
                    Include past
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={historyDays}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setHistoryDays(Math.max(1, Number(e.target.value) || 1));
                        setHistorySharingOption('DAYS');
                      }}
                      className="w-14 px-1.5 py-0.5 rounded border border-slate-300 dark:border-teams-border bg-white dark:bg-[#252525] text-xs font-bold text-center text-slate-900 dark:text-white"
                    />
                    days of chat history
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modalHistoryOption"
                    checked={historySharingOption === 'NONE'}
                    onChange={() => setHistorySharingOption('NONE')}
                    className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-slate-800 dark:text-white">Don't include chat history</span>
                </label>
              </div>
            </div>
          </div>

          {/* Members List */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-teams-muted uppercase tracking-wider mb-2">
              Current Team Members ({members.length})
            </label>
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-[#1F1F1F] border border-slate-200 dark:border-teams-border/50 rounded-lg hover:border-slate-300 dark:hover:border-teams-border transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-teams-purple flex items-center justify-center font-bold text-xs uppercase">
                    {m.user?.display_name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">{m.user?.display_name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-teams-muted">{m.user?.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-[#2D2D2D] text-slate-700 dark:text-teams-muted border border-slate-300 dark:border-teams-border/40">
                    {m.role}
                  </span>
                  <button
                    onClick={() => handleRemoveMember(m.user_id)}
                    className="p-1 text-rose-500 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                    title="Remove member"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
