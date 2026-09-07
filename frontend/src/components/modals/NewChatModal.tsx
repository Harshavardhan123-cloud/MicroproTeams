import React, { useEffect, useState } from 'react';
import { X, Search, Check, MessageSquare } from 'lucide-react';
import { User } from '../../types';
import { userService } from '../../services/userService';
import { apiClient } from '../../api/client';
import { UserAvatar } from '../common/UserAvatar';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (convId: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose, onSelectConversation }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      userService.getUsers()
        .then(setUsers)
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleStartChat = async () => {
    if (selectedUserIds.length === 0) return;
    try {
      const res = await apiClient.post('/direct-conversations', {
        target_user_ids: selectedUserIds
      });
      onSelectConversation(res.data.data.id || res.data.id);
      onClose();
    } catch (err) {
      console.error('Start chat error:', err);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.display_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#171923] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#11131A]">
          <div className="flex items-center gap-2 font-bold text-sm text-mc-text font-display">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            <span>New Chat Conversation</span>
          </div>
          <button onClick={onClose} className="p-1 text-mc-muted hover:text-mc-text rounded-lg hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* User Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-mc-muted" />
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#11131A] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-mc-text placeholder-mc-muted focus:border-indigo-500 focus:outline-none transition-all"
            />
          </div>

          {/* User Multi-select List */}
          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
            {isLoading ? (
              <div className="p-6 text-xs text-mc-muted text-center animate-pulse">Loading workspace directory...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-6 text-xs text-mc-muted text-center">No matching directory users found.</div>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = selectedUserIds.includes(u.id);

                return (
                  <div
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                      isSelected ? 'bg-indigo-600/20 border border-indigo-500/40' : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        user={u}
                        avatarUrl={u.avatar_url}
                        name={u.display_name}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-mc-text truncate">{u.display_name}</p>
                        <p className="text-[10px] text-mc-muted truncate">{u.email}</p>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all ${
                        isSelected ? 'bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-500 text-white shadow-sm' : 'border-white/20'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10 bg-[#11131A]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-mc-muted hover:text-mc-text font-semibold rounded-xl hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStartChat}
            disabled={selectedUserIds.length === 0}
            className="px-4 py-2 text-xs text-white font-semibold rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
          >
            Start Chat ({selectedUserIds.length})
          </button>
        </div>
      </div>
    </div>
  );
};
