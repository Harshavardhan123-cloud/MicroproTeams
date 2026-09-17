import React, { useEffect, useState } from 'react';
import {
  X,
  Settings,
  Users,
  Hash,
  Shield,
  Crown,
  UserMinus,
  UserPlus,
  ArrowRightLeft,
  Trash2,
  Lock,
  Clock,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { Team, User } from '../../types';
import { apiClient } from '../../api/client';
import { userService } from '../../services/userService';

interface TeamSettingsModalProps {
  isOpen: boolean;
  team: Team | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const TeamSettingsModal: React.FC<TeamSettingsModalProps> = ({
  isOpen,
  team,
  onClose,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'channels'>('general');
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [members, setMembers] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedNewOwner, setSelectedNewOwner] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Member State
  const [selectedUserIdToAdd, setSelectedUserIdToAdd] = useState('');
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState<'member' | 'owner'>('member');
  const [historySharingOption, setHistorySharingOption] = useState<'ALL' | 'NONE' | 'DAYS'>('ALL');
  const [historyDays, setHistoryDays] = useState<number>(7);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [addMemberSuccess, setAddMemberSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && team) {
      setTeamName(team.name);
      setDescription(team.description || '');
      setPrivacy(team.privacy || 'public');
      fetchMembers();
      userService.getUsers().then(setUsers).catch(console.error);
    }
  }, [isOpen, team]);

  const fetchMembers = async () => {
    if (!team) return;
    try {
      const res = await apiClient.get(`/teams/${team.id}/members`);
      setMembers(res.data.data || res.data);
    } catch (err) {
      console.error('Fetch members error:', err);
    }
  };

  if (!isOpen || !team) return null;

  const availableUsersToInvite = users.filter(
    (u) => !members.some((m) => m.user_id === u.id)
  );

  const handleUpdateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await apiClient.patch(`/teams/${team.id}`, {
        name: teamName,
        description,
        privacy
      });
      onSuccess();
    } catch (err) {
      console.error('Update team error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserIdToAdd || isAddingMember) return;
    try {
      setIsAddingMember(true);
      setAddMemberError(null);
      setAddMemberSuccess(null);

      await apiClient.post(`/teams/${team.id}/members`, {
        user_id: selectedUserIdToAdd,
        role: selectedRoleToAdd,
        history_sharing_option: historySharingOption,
        history_days: historySharingOption === 'DAYS' ? Number(historyDays) || 7 : undefined
      });

      const addedUser = users.find((u) => u.id === selectedUserIdToAdd);
      setAddMemberSuccess(`Added ${addedUser?.display_name || 'member'} to team.`);
      setSelectedUserIdToAdd('');
      setHistorySharingOption('ALL');
      fetchMembers();
      onSuccess();
      setTimeout(() => setAddMemberSuccess(null), 4000);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.error?.message ||
        err.message ||
        'Failed to add member to team';
      setAddMemberError(detail);
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!selectedNewOwner) return;
    if (confirm('Are you sure you want to transfer ownership of this team? You will become a standard member.')) {
      try {
        await apiClient.post(`/teams/${team.id}/transfer-ownership`, {
          new_owner_id: selectedNewOwner
        });
        fetchMembers();
        onSuccess();
      } catch (err) {
        console.error('Transfer ownership error:', err);
      }
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (confirm('Remove this member from the team? They will lose access to all channels.')) {
      try {
        await apiClient.delete(`/teams/${team.id}/members/${userId}`);
        fetchMembers();
        onSuccess();
      } catch (err) {
        console.error('Remove member error:', err);
      }
    }
  };

  const handleDeleteTeam = async () => {
    if (confirm(`Delete "${team.name}"? This action will remove the team and soft delete all associated channels.`)) {
      try {
        await apiClient.delete(`/teams/${team.id}`);
        onSuccess();
        onClose();
      } catch (err) {
        console.error('Delete team error:', err);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-white dark:bg-[#252525] border border-slate-200 dark:border-teams-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col h-[580px] max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-teams-border bg-slate-50 dark:bg-[#1F1F1F]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 dark:bg-teams-purple flex items-center justify-center text-white font-bold text-sm shadow-md">
              {team.name.charAt(0)}
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">{team.name} Settings</h3>
              <p className="text-[11px] text-slate-500 dark:text-teams-muted">Manage workspace configuration, members, and privacy</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 dark:text-teams-muted hover:text-slate-900 dark:hover:text-white rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-teams-border bg-slate-50/50 dark:bg-[#1F1F1F]/60 px-6 gap-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'general'
                ? 'border-indigo-600 dark:border-teams-purple text-indigo-600 dark:text-teams-purple'
                : 'border-transparent text-slate-500 dark:text-teams-muted hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>General</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'members'
                ? 'border-indigo-600 dark:border-teams-purple text-indigo-600 dark:text-teams-purple'
                : 'border-transparent text-slate-500 dark:text-teams-muted hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Members ({members.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('channels')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'channels'
                ? 'border-indigo-600 dark:border-teams-purple text-indigo-600 dark:text-teams-purple'
                : 'border-transparent text-slate-500 dark:text-teams-muted hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Hash className="w-4 h-4" />
            <span>Channels ({team.channels?.length || 0})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'general' && (
            <form onSubmit={handleUpdateTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-teams-muted mb-1">Team Name</label>
                <input
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-teams-border rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-teams-muted mb-1">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-teams-border rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-teams-muted mb-1">Privacy Level</label>
                <select
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-teams-border rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="public">Public - Anyone in organization can join</option>
                  <option value="private">Private - Only invited members can join</option>
                </select>
              </div>

              <div className="pt-4 flex justify-between items-center border-t border-slate-200 dark:border-teams-border">
                <button
                  type="button"
                  onClick={handleDeleteTeam}
                  className="px-3 py-1.5 text-xs text-rose-500 hover:text-rose-600 font-semibold rounded-lg hover:bg-rose-500/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Team</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs text-white font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 dark:bg-teams-purple dark:hover:bg-teams-purple-hover shadow transition-all cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {activeTab === 'members' && (
            <div className="space-y-6">
              {/* Add Member Card with Chat History Sharing Options */}
              <div className="bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-teams-border rounded-xl p-4 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                      <UserPlus className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white">Add Member to Team</h4>
                      <p className="text-[11px] text-slate-500 dark:text-teams-muted">
                        Invite organization members and configure their chat history visibility
                      </p>
                    </div>
                  </div>
                  {addMemberSuccess && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{addMemberSuccess}</span>
                    </span>
                  )}
                </div>

                {addMemberError && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{addMemberError}</span>
                  </div>
                )}

                <form onSubmit={handleAddMember} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-teams-muted uppercase tracking-wider">
                        Select Member
                      </label>
                      <select
                        value={selectedUserIdToAdd}
                        onChange={(e) => setSelectedUserIdToAdd(e.target.value)}
                        className="w-full bg-white dark:bg-[#252525] border border-slate-200 dark:border-teams-border rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                      >
                        <option value="">-- Choose employee to add --</option>
                        {availableUsersToInvite.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.display_name} ({u.email}) {u.job_title ? `- ${u.job_title}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-teams-muted uppercase tracking-wider">
                        Team Role
                      </label>
                      <select
                        value={selectedRoleToAdd}
                        onChange={(e) => setSelectedRoleToAdd(e.target.value as any)}
                        className="w-full bg-white dark:bg-[#252525] border border-slate-200 dark:border-teams-border rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                      >
                        <option value="member">Member (Standard)</option>
                        <option value="owner">Owner (Admin)</option>
                      </select>
                    </div>
                  </div>

                  {/* Chat History Sharing Radio Options */}
                  <div className="p-3 rounded-xl bg-white dark:bg-[#15171E] border border-slate-200 dark:border-white/5 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                      <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Share Chat History</span>
                    </div>

                    <div className="space-y-2">
                      {/* Option 1: ALL */}
                      <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                        <input
                          type="radio"
                          name="historyOption"
                          checked={historySharingOption === 'ALL'}
                          onChange={() => setHistorySharingOption('ALL')}
                          className="mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white">
                            Include all chat history
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-teams-muted">
                            New member will be able to view all past conversations and messages in team channels.
                          </div>
                        </div>
                      </label>

                      {/* Option 2: DAYS */}
                      <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                        <input
                          type="radio"
                          name="historyOption"
                          checked={historySharingOption === 'DAYS'}
                          onChange={() => setHistorySharingOption('DAYS')}
                          className="mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="flex-1">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <span>Include chat history from the past</span>
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
                              className="w-16 px-2 py-0.5 rounded border border-slate-300 dark:border-teams-border bg-slate-50 dark:bg-[#252525] text-xs font-bold text-center text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                            />
                            <span>days</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-teams-muted mt-0.5">
                            New member will only see messages posted within the past {historyDays} day(s).
                          </div>
                        </div>
                      </label>

                      {/* Option 3: NONE */}
                      <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                        <input
                          type="radio"
                          name="historyOption"
                          checked={historySharingOption === 'NONE'}
                          onChange={() => setHistorySharingOption('NONE')}
                          className="mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white">
                            Don't include chat history
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-teams-muted">
                            New member will only see messages sent after they join the team.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={!selectedUserIdToAdd || isAddingMember}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow transition-all cursor-pointer"
                    >
                      {isAddingMember ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Adding Member...</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Add Member</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Transfer Ownership Box */}
              <div className="bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-teams-border rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span>Transfer Team Ownership</span>
                </div>
                <div className="flex gap-2">
                  <select
                    value={selectedNewOwner}
                    onChange={(e) => setSelectedNewOwner(e.target.value)}
                    className="flex-1 bg-white dark:bg-[#252525] border border-slate-200 dark:border-teams-border rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">Select new team owner...</option>
                    {members
                      .filter((m) => m.user_id !== team.owner_id)
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.user?.display_name || m.user_id}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleTransferOwnership}
                    disabled={!selectedNewOwner}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-black font-bold text-xs rounded-lg flex items-center gap-1.5 shadow transition-all cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Transfer</span>
                  </button>
                </div>
              </div>

              {/* Roster List */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-teams-muted uppercase tracking-wider">
                  Team Roster ({members.length})
                </h4>
                <div className="space-y-1.5">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-teams-border/60 hover:border-slate-300 dark:hover:border-teams-border transition-colors shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-xs text-white shadow-sm">
                          {m.user?.display_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{m.user?.display_name}</span>
                            {m.role === 'owner' ? (
                              <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Crown className="w-3 h-3" /> Owner
                              </span>
                            ) : (
                              <span className="text-[10px] bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-transparent font-semibold px-2 py-0.5 rounded-full">
                                Member
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-teams-muted flex items-center gap-2 mt-0.5">
                            <span>{m.user?.email}</span>
                            {m.visible_history_from ? (
                              <span
                                className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-500/20"
                                title={`Member can view messages starting from ${new Date(m.visible_history_from).toLocaleString()}`}
                              >
                                <Clock className="w-3 h-3" />
                                <span>History from {new Date(m.visible_history_from).toLocaleDateString()}</span>
                              </span>
                            ) : (
                              <span
                                className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20"
                                title="Member can view all past channel history"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>Full history</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {m.user_id !== team.owner_id && (
                        <button
                          onClick={() => handleRemoveMember(m.user_id)}
                          className="p-1.5 text-slate-400 dark:text-teams-muted hover:text-rose-500 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer"
                          title="Remove Member"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'channels' && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-teams-muted">Team Channels</h4>
              <div className="space-y-2">
                {team.channels?.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-teams-border/60"
                  >
                    <div className="flex items-center gap-3">
                      {c.type === 'private' ? (
                        <Lock className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Hash className="w-4 h-4 text-slate-400 dark:text-teams-muted" />
                      )}
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{c.name}</div>
                        {c.description && <div className="text-[11px] text-slate-500 dark:text-teams-muted">{c.description}</div>}
                      </div>
                    </div>

                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-teams-border text-slate-700 dark:text-teams-muted capitalize font-semibold">
                      {c.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
