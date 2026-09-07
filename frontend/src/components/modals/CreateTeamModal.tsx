import React, { useState, useEffect } from 'react';
import { X, FolderPlus, UserPlus, Check } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

interface CreateTeamModalProps {
  onSuccess: () => void;
}

interface MemberUser {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string | null;
}

export const CreateTeamModal: React.FC<CreateTeamModalProps> = ({ onSuccess }) => {
  const { isCreateTeamOpen, setCreateTeamOpen } = useUIStore();
  const { user: currentUser } = useAuthStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  
  const [availableUsers, setAvailableUsers] = useState<MemberUser[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<MemberUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isCreateTeamOpen) {
      // Fetch organization users when modal opens
      apiClient.get('/users')
        .then((res) => {
          const raw = res.data.data || res.data || [];
          // Filter out current user (since current user is automatically added as Owner)
          const filtered = raw.filter((u: any) => String(u.id) !== String(currentUser?.id));
          setAvailableUsers(filtered);
        })
        .catch((err) => console.error('Failed to fetch org users for team modal:', err));
    } else {
      // Reset state on close
      setName('');
      setDescription('');
      setPrivacy('public');
      setSelectedMembers([]);
      setSearchQuery('');
      setIsDropdownOpen(false);
    }
  }, [isCreateTeamOpen, currentUser?.id]);

  if (!isCreateTeamOpen) return null;

  const filteredUsers = availableUsers.filter((u) => {
    const isAlreadySelected = selectedMembers.some((m) => String(m.id) === String(u.id));
    if (isAlreadySelected) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.display_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  const handleAddMember = (user: MemberUser) => {
    setSelectedMembers((prev) => [...prev, user]);
    setSearchQuery('');
    setIsDropdownOpen(false);
  };

  const handleRemoveMember = (userId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => String(m.id) !== String(userId)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setIsSubmitting(true);
      const memberIds = selectedMembers.map((m) => m.id);
      await apiClient.post('/teams', {
        name: name.trim(),
        description: description.trim(),
        privacy,
        member_ids: memberIds
      });
      setCreateTeamOpen(false);
      onSuccess();
    } catch (err) {
      console.error('Create team error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#171923] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-white/10 bg-[#11131A] flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-base text-mc-text font-display">
            <FolderPlus className="w-5 h-5 text-indigo-400" />
            <span>Create a New Team</span>
          </div>
          <button
            onClick={() => setCreateTeamOpen(false)}
            className="p-1 text-mc-muted hover:text-mc-text rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-mc-muted uppercase tracking-wider mb-1.5">
              Team Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering, Product Launch"
              required
              className="w-full bg-[#11131A] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-mc-text placeholder-mc-muted focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-mc-muted uppercase tracking-wider mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the team's objective..."
              rows={2}
              className="w-full bg-[#11131A] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-mc-text placeholder-mc-muted focus:outline-none focus:border-indigo-500 resize-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-mc-muted uppercase tracking-wider mb-1.5">
              Privacy
            </label>
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as 'public' | 'private')}
              className="w-full bg-[#11131A] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-mc-text focus:outline-none focus:border-indigo-500 transition-all"
            >
              <option value="public">Public — Anyone in organization can join</option>
              <option value="private">Private — Invite only</option>
            </select>
          </div>

          {/* ADD MEMBERS SECTION */}
          <div>
            <label className="block text-xs font-semibold text-mc-muted uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                Add Team Members
              </span>
              <span className="text-[10px] text-mc-muted lowercase font-normal">
                {selectedMembers.length} selected
              </span>
            </label>

            {/* Selected Member Chips */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto p-1.5 bg-[#11131A] border border-white/5 rounded-xl">
                {selectedMembers.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 text-xs font-medium"
                  >
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-indigo-500/40 flex items-center justify-center text-[10px] font-bold">
                        {m.display_name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate max-w-[100px]">{m.display_name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.id)}
                      className="text-indigo-300 hover:text-white transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search Input & Dropdown */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setIsDropdownOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsDropdownOpen(true);
                }}
                placeholder="Search organization members to add..."
                className="w-full bg-[#11131A] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-mc-text placeholder-mc-muted focus:outline-none focus:border-indigo-500 transition-all"
              />

              {isDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute left-0 right-0 top-full mt-1 bg-[#171923] border border-white/10 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-white/5">
                    {filteredUsers.length === 0 ? (
                      <div className="px-3.5 py-2.5 text-xs text-mc-muted text-center">
                        {availableUsers.length === 0 ? 'No members found' : 'All matching members added'}
                      </div>
                    ) : (
                      filteredUsers.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => handleAddMember(u)}
                          className="w-full px-3.5 py-2 flex items-center justify-between text-left hover:bg-white/5 transition-colors group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300 shrink-0">
                                {u.display_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-white truncate">{u.display_name}</p>
                              <p className="text-[10px] text-mc-muted truncate">{u.email}</p>
                            </div>
                          </div>
                          <UserPlus className="w-4 h-4 text-mc-muted group-hover:text-indigo-400 transition-colors shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => setCreateTeamOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-mc-muted hover:text-mc-text hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-2 rounded-xl font-semibold text-xs bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 flex items-center gap-1.5"
            >
              {isSubmitting ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
