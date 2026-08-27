import React, { useEffect, useState } from 'react';
import { X, MessageSquare } from 'lucide-react';
import { Message } from '../../types';
import { apiClient } from '../../api/client';
import { MessageItem } from './MessageItem';
import { MessageComposer } from './MessageComposer';

interface ThreadDrawerProps {
  parentMessage: Message | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ThreadDrawer: React.FC<ThreadDrawerProps> = ({ parentMessage, isOpen, onClose }) => {
  const [replies, setReplies] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReplies = async () => {
    if (!parentMessage) return;
    try {
      setIsLoading(true);
      const res = await apiClient.get(`/messages/${parentMessage.id}/replies`);
      setReplies(res.data.data || res.data);
    } catch (err) {
      console.error('Fetch replies error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && parentMessage) {
      fetchReplies();
    }
  }, [isOpen, parentMessage?.id]);

  if (!isOpen || !parentMessage) return null;

  return (
    <div className="w-80 bg-[#1F1F1F] border-l border-teams-border flex flex-col h-full shrink-0 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="h-14 border-b border-teams-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2 font-bold text-sm text-white">
          <MessageSquare className="w-4 h-4 text-teams-purple" />
          <span>Thread Replies</span>
        </div>
        <button onClick={onClose} className="p-1 text-teams-muted hover:text-white rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Parent Message Box */}
      <div className="p-3 border-b border-teams-border/60 bg-[#1A1A1A]">
        <MessageItem message={parentMessage} onOpenThread={() => {}} onRefresh={fetchReplies} />
      </div>

      {/* Replies List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <label className="block text-[10px] font-semibold text-teams-muted uppercase tracking-wider mb-2">
          Replies ({replies.length})
        </label>

        {isLoading ? (
          <div className="p-4 text-xs text-teams-muted text-center animate-pulse">Loading replies...</div>
        ) : replies.length === 0 ? (
          <div className="p-4 text-xs text-teams-muted text-center">No replies yet. Be the first to reply!</div>
        ) : (
          replies.map((reply) => (
            <MessageItem key={reply.id} message={reply} onOpenThread={() => {}} onRefresh={fetchReplies} />
          ))
        )}
      </div>

      {/* Reply Composer Input */}
      <div className="p-3 border-t border-teams-border">
        <MessageComposer
          channelId={parentMessage.channel_id}
          parentMessageId={parentMessage.id}
          placeholder="Reply in thread..."
          onSendSuccess={fetchReplies}
        />
      </div>
    </div>
  );
};
