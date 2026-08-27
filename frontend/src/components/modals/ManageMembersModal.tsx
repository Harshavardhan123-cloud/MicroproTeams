import React, { useEffect, useState } from 'react';
import { X, UserPlus, Trash2, Shield, User as UserIcon } from 'lucide-react';
import { Team } from '../../types';
import { teamService } from '../../services/teamService';
import { userService } from '../../services/userService';
import { User } from '../../types';

interface ManageMembersModalProps {
  team: Team | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ManageMembersModal: React.FC<ManageMembersModalProps> = ({ team, isOpen, onClose }) => {
  const [members, setMembers] = useState<any[]>([]);
  const [orgUsers, setOrgUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
    }
  }, [isOpen, team?.id]);

  if (!isOpen || !team) return null;

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    try {
      await teamService.addTeamMember(team.id, { user_id: selectedUserId, role: 'member' });
      setSelectedUserId('');
      fetchMembers();
    } catch (err) {
      console.error('Add member error:', err);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await teamService.removeTeamMember(team.id, userId);
      fetchMembers();
    } catch (err) {
      console.error('Remove member error:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#252525] border border-teams-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-teams-border flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-base text-white">
            <UserPlus className="w-5 h-5 text-teams-purple" />
            <span>Manage Members — {team.name}</span>
          </div>
          <button onClick={onClose} className="p-1 text-teams-muted hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Add Member Form */}
          <div className="flex items-center gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 bg-[#1F1F1F] border border-teams-border rounded-md px-3 py-2 text-xs text-teams-text focus:outline-none focus:border-teams-purple"
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
              className="px-3 py-2 bg-teams-purple hover:bg-teams-purple-hover text-white font-semibold text-xs rounded-md shadow disabled:opacity-50 transition-all"
            >
              Add Member
            </button>
          </div>

          {/* Members List */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            <label className="block text-xs font-semibold text-teams-muted uppercase tracking-wider mb-2">
              Current Team Members ({members.length})
            </label>
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-2.5 bg-[#1F1F1F] border border-teams-border/50 rounded-lg hover:border-teams-border transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-teams-purple/20 text-teams-purple flex items-center justify-center font-bold text-xs uppercase">
                    {m.user?.display_name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{m.user?.display_name}</p>
                    <p className="text-[10px] text-teams-muted">{m.user?.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[#2D2D2D] text-teams-muted border border-teams-border/40">
                    {m.role}
                  </span>
                  <button
                    onClick={() => handleRemoveMember(m.user_id)}
                    className="p-1 text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
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
