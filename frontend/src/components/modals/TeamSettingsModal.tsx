import React, { useEffect, useState } from 'react';
import { X, Settings, Users, Hash, Shield, Crown, UserMinus, ArrowRightLeft, Trash2, Lock } from 'lucide-react';
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
      <div className="bg-[#252525] border border-teams-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col h-[520px]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-teams-border bg-[#1F1F1F]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-teams-purple flex items-center justify-center text-white font-bold text-sm">
              {team.name.charAt(0)}
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">{team.name} Settings</h3>
              <p className="text-[11px] text-teams-muted">Manage workspace configuration, members, and privacy</p>
            </div>
          </div>

          <button onClick={onClose} className="p-1 text-teams-muted hover:text-white rounded-md">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-teams-border bg-[#1F1F1F]/60 px-6 gap-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'general'
                ? 'border-teams-purple text-teams-purple'
                : 'border-transparent text-teams-muted hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>General</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'members'
                ? 'border-teams-purple text-teams-purple'
                : 'border-transparent text-teams-muted hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Members ({members.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('channels')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'channels'
                ? 'border-teams-purple text-teams-purple'
                : 'border-transparent text-teams-muted hover:text-white'
            }`}
          >
            <Hash className="w-4 h-4" />
            <span>Channels ({team.channels?.length || 0})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'general' && (
            <form onSubmit={handleUpdateTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-teams-muted mb-1">Team Name</label>
                <input
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-teams-border rounded-lg px-3 py-2 text-xs text-white focus:border-teams-purple focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-teams-muted mb-1">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-teams-border rounded-lg px-3 py-2 text-xs text-white focus:border-teams-purple focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-teams-muted mb-1">Privacy Level</label>
                <select
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value as any)}
                  className="w-full bg-[#1A1A1A] border border-teams-border rounded-lg px-3 py-2 text-xs text-white focus:border-teams-purple focus:outline-none"
                >
                  <option value="public">Public - Anyone in organization can join</option>
                  <option value="private">Private - Only invited members can join</option>
                </select>
              </div>

              <div className="pt-4 flex justify-between items-center border-t border-teams-border">
                <button
                  type="button"
                  onClick={handleDeleteTeam}
                  className="px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 font-semibold rounded-lg hover:bg-rose-500/10 flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Team</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs text-white font-semibold rounded-lg bg-teams-purple hover:bg-teams-purple-hover shadow transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {activeTab === 'members' && (
            <div className="space-y-6">
              {/* Transfer Ownership Box */}
              <div className="bg-[#1A1A1A] border border-teams-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 font-bold text-xs text-white">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>Transfer Team Ownership</span>
                </div>
                <div className="flex gap-2">
                  <select
                    value={selectedNewOwner}
                    onChange={(e) => setSelectedNewOwner(e.target.value)}
                    className="flex-1 bg-[#252525] border border-teams-border rounded-lg px-3 py-1.5 text-xs text-white focus:border-teams-purple focus:outline-none"
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
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-black font-bold text-xs rounded-lg flex items-center gap-1.5 shadow transition-all"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Transfer</span>
                  </button>
                </div>
              </div>

              {/* Roster List */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-teams-muted">Team Roster</h4>
                <div className="space-y-1">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-[#1A1A1A] border border-teams-border/60"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-teams-purple flex items-center justify-center font-bold text-xs text-white">
                          {m.user?.display_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>{m.user?.display_name}</span>
                            {m.role === 'owner' && (
                              <span className="text-[10px] bg-amber-400/20 text-amber-300 font-semibold px-1.5 py-0.2 rounded flex items-center gap-1">
                                <Crown className="w-3 h-3" /> Owner
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-teams-muted">{m.user?.email}</div>
                        </div>
                      </div>

                      {m.user_id !== team.owner_id && (
                        <button
                          onClick={() => handleRemoveMember(m.user_id)}
                          className="p-1.5 text-teams-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
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
              <h4 className="text-xs font-semibold text-teams-muted">Team Channels</h4>
              <div className="space-y-2">
                {team.channels?.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#1A1A1A] border border-teams-border/60"
                  >
                    <div className="flex items-center gap-3">
                      {c.type === 'private' ? (
                        <Lock className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Hash className="w-4 h-4 text-teams-muted" />
                      )}
                      <div>
                        <div className="text-xs font-bold text-white">{c.name}</div>
                        {c.description && <div className="text-[11px] text-teams-muted">{c.description}</div>}
                      </div>
                    </div>

                    <span className="text-[10px] px-2 py-0.5 rounded bg-teams-border text-teams-muted capitalize font-semibold">
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
