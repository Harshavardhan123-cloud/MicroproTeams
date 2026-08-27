import React, { useEffect, useState } from 'react';
import { X, Search, Check, MessageSquare } from 'lucide-react';
import { User } from '../../types';
import { userService } from '../../services/userService';
import { apiClient } from '../../api/client';

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
      <div className="bg-[#252525] border border-teams-border rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-teams-border">
          <div className="flex items-center gap-2 font-bold text-sm text-white">
            <MessageSquare className="w-4 h-4 text-teams-purple" />
            <span>New Chat Conversation</span>
          </div>
          <button onClick={onClose} className="p-1 text-teams-muted hover:text-white rounded-md">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* User Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-teams-muted" />
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#1A1A1A] border border-teams-border rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-teams-muted focus:border-teams-purple focus:outline-none"
            />
          </div>

          {/* User Multi-select List */}
          <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
            {isLoading ? (
              <div className="p-4 text-xs text-teams-muted text-center animate-pulse">Loading directory users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-xs text-teams-muted text-center">No matching users found.</div>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = selectedUserIds.includes(u.id);

                return (
                  <div
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-teams-purple/20 border border-teams-purple/50' : 'hover:bg-teams-hover'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-teams-purple flex items-center justify-center font-bold text-xs text-white uppercase">
                        {u.display_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-xs text-white">{u.display_name}</p>
                        <p className="text-[10px] text-teams-muted">{u.email}</p>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                        isSelected ? 'bg-teams-purple border-teams-purple text-white' : 'border-teams-border'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-teams-border bg-[#1A1A1A]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-teams-muted hover:text-white font-semibold rounded-lg hover:bg-teams-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStartChat}
            disabled={selectedUserIds.length === 0}
            className="px-4 py-2 text-xs text-white font-semibold rounded-lg bg-teams-purple hover:bg-teams-purple-hover disabled:opacity-40 shadow transition-all"
          >
            Start Chat ({selectedUserIds.length})
          </button>
        </div>
      </div>
    </div>
  );
};
