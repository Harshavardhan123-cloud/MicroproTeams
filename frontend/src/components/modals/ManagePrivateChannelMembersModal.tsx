import React, { useEffect, useState } from 'react';
import { X, Lock, Users, Plus, Trash2, Check } from 'lucide-react';
import { Channel, User } from '../../types';
import { apiClient } from '../../api/client';

interface ManagePrivateChannelMembersModalProps {
  isOpen: boolean;
  channel: Channel | null;
  teamMembers: User[];
  onClose: () => void;
}

export const ManagePrivateChannelMembersModal: React.FC<ManagePrivateChannelMembersModalProps> = ({
  isOpen,
  channel,
  teamMembers,
  onClose
}) => {
  const [channelMembers, setChannelMembers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && channel) {
      fetchMembers();
    }
  }, [isOpen, channel]);

  const fetchMembers = async () => {
    if (!channel) return;
    try {
      const res = await apiClient.get(`/channels/${channel.id}/members`);
      setChannelMembers(res.data.data || res.data);
    } catch (err) {
      console.error('Fetch private channel members error:', err);
    }
  };

  if (!isOpen || !channel) return null;

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    try {
      setIsSubmitting(true);
      await apiClient.post(`/channels/${channel.id}/members`, {
        user_id: selectedUserId
      });
      setSelectedUserId('');
      fetchMembers();
    } catch (err) {
      console.error('Add channel member error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await apiClient.delete(`/channels/${channel.id}/members/${userId}`);
      fetchMembers();
    } catch (err) {
      console.error('Remove channel member error:', err);
    }
  };

  const currentMemberIds = channelMembers.map((cm) => cm.user_id);
  const eligibleMembers = teamMembers.filter((tm) => !currentMemberIds.includes(tm.id));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-[#252525] border border-teams-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-teams-border bg-[#1F1F1F]">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm text-white">🔒 {channel.name} Members</h3>
          </div>
          <button onClick={onClose} className="p-1 text-teams-muted hover:text-white rounded-md">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Add Member Dropdown */}
          <div className="flex gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 bg-[#1A1A1A] border border-teams-border rounded-lg px-3 py-2 text-xs text-white focus:border-teams-purple focus:outline-none"
            >
              <option value="">Select team member to add...</option>
              {eligibleMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} ({m.email})
                </option>
              ))}
            </select>
            <button
              onClick={handleAddMember}
              disabled={!selectedUserId || isSubmitting}
              className="px-4 py-2 bg-teams-purple hover:bg-teams-purple-hover disabled:opacity-40 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          {/* Current Roster */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-teams-muted">Private Access Roster</label>
            <div className="max-h-48 overflow-y-auto space-y-1 bg-[#1A1A1A] border border-teams-border rounded-lg p-2">
              {channelMembers.map((cm) => (
                <div key={cm.id} className="flex items-center justify-between p-2 rounded hover:bg-teams-hover">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-teams-purple flex items-center justify-center font-bold text-[10px] text-white">
                      {cm.user?.display_name?.charAt(0) || 'U'}
                    </div>
                    <span className="text-xs text-white font-medium">{cm.user?.display_name}</span>
                  </div>

                  <button
                    onClick={() => handleRemoveMember(cm.user_id)}
                    className="p-1 text-teams-muted hover:text-rose-400 rounded transition-colors"
                    title="Remove access"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
