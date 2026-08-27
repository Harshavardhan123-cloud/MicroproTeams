import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Plus, Search, User as UserIcon } from 'lucide-react';
import { apiClient } from '../../api/client';
import { NewChatModal } from '../modals/NewChatModal';
import { useWebSocket } from '../../hooks/useWebSocket';

interface DirectMessageSidebarProps {
  selectedConvId: string | null;
  onSelectConversation: (convId: string) => void;
}

export const DirectMessageSidebar: React.FC<DirectMessageSidebarProps> = ({
  selectedConvId,
  onSelectConversation
}) => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchConversations = async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get('/direct-conversations');
      setConversations(res.data.data || res.data);
    } catch (err) {
      console.error('Fetch DM conversations error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  const handleWSEvent = useCallback((event: any) => {
    if (event.type === 'direct_message.new' || event.type === 'message.new') {
      fetchConversations();
    }
  }, []);

  useWebSocket(undefined, handleWSEvent);

  return (
    <aside className="w-64 bg-[#1F1F1F] border-r border-teams-border flex flex-col h-full select-none shrink-0">
      {/* Header */}
      <div className="h-14 border-b border-teams-border flex items-center justify-between px-4 font-bold text-sm text-white">
        <span>Chat & Direct Messages</span>
        <button
          onClick={() => setIsModalOpen(true)}
          className="p-1.5 hover:bg-teams-hover text-teams-muted hover:text-white rounded-md transition-colors"
          title="New Direct Message"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="p-4 text-xs text-teams-muted animate-pulse text-center">Loading conversations...</div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-teams-muted">
            <p className="text-xs mb-2">No recent conversations.</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-xs text-teams-accent hover:underline font-semibold"
            >
              + Start a chat
            </button>
          </div>
        ) : (
          conversations.map((conv) => {
            const isSelected = selectedConvId === conv.id;

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected ? 'bg-teams-purple/20 border border-teams-purple/40 text-white' : 'text-teams-muted hover:bg-teams-hover hover:text-white'
                }`}
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-teams-purple flex items-center justify-center font-bold text-xs text-white uppercase shadow-sm">
                    {conv.title?.charAt(0) || 'C'}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#1F1F1F]" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs text-white truncate">{conv.title}</p>
                  <p className="text-[10px] text-teams-muted truncate">
                    {conv.is_group ? 'Group Chat' : 'Direct Message'}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <NewChatModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectConversation={(convId) => {
          fetchConversations();
          onSelectConversation(convId);
        }}
      />
    </aside>
  );
};
