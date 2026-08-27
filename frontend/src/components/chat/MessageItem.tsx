import React, { useState } from 'react';
import { Message } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { MessageSquare, Edit2, Trash2, Smile, Copy, Check, X } from 'lucide-react';
import { apiClient } from '../../api/client';

interface MessageItemProps {
  message: Message;
  onOpenThread: (message: Message) => void;
  onRefresh: () => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '🎉', '🚀'];

export const MessageItem: React.FC<MessageItemProps> = ({ message, onOpenThread, onRefresh }) => {
  const { user } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const isOwner = user?.id === message.sender_id;

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleUpdate = async () => {
    if (!editContent.trim()) return;
    try {
      await apiClient.patch(`/messages/${message.id}`, { content: editContent });
      setIsEditing(false);
      onRefresh();
    } catch (err) {
      console.error('Update error:', err);
    }
  };

  const handleDelete = async () => {
    if (confirm('Delete this message?')) {
      try {
        await apiClient.delete(`/messages/${message.id}`);
        onRefresh();
      } catch (err) {
        console.error('Delete error:', err);
      }
    }
  };

  const handleToggleReaction = async (emoji: string) => {
    try {
      await apiClient.post(`/messages/${message.id}/reactions`, { emoji });
      setShowEmojiPicker(false);
      onRefresh();
    } catch (err) {
      console.error('Reaction error:', err);
    }
  };

  return (
    <div className="group relative flex items-start gap-3 px-4 py-2 hover:bg-[#1E1E1E] transition-colors rounded-lg">
      {/* Sender Avatar */}
      <div className="w-8 h-8 rounded-full bg-teams-purple flex items-center justify-center font-bold text-xs text-white uppercase shrink-0 mt-0.5 shadow">
        {message.sender?.display_name?.charAt(0) || 'U'}
      </div>

      {/* Message Content Area */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-xs text-white">{message.sender?.display_name}</span>
          <span className="text-[10px] text-teams-muted">
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {message.is_edited && <span className="text-[9px] text-teams-muted italic">(edited)</span>}
        </div>

        {isEditing ? (
          <div className="flex flex-col gap-2 bg-[#282828] p-2.5 rounded-xl border border-teams-purple/60 mt-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-[#181819] text-xs text-white p-2 rounded-lg border border-teams-border focus:outline-none focus:border-teams-purple resize-none min-h-[60px]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-2 py-1 text-[11px] text-teams-muted hover:text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="px-3 py-1 bg-teams-purple hover:bg-teams-purple-hover text-white text-[11px] font-bold rounded flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Save
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-teams-text leading-relaxed whitespace-pre-wrap">{message.content}</p>
        )}

        {/* Emoji Reactions Row */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(
              message.reactions.reduce((acc: any, r) => {
                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                return acc;
              }, {})
            ).map(([emoji, count]: any) => (
              <button
                key={emoji}
                onClick={() => handleToggleReaction(emoji)}
                className="flex items-center gap-1 px-2 py-0.5 bg-[#2A2A2A] border border-teams-border/60 hover:border-teams-purple rounded-full text-xs transition-colors"
              >
                <span>{emoji}</span>
                <span className="text-[10px] text-teams-muted font-bold">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread Replies Button */}
        <div className="mt-1.5 flex items-center gap-3">
          <button
            onClick={() => onOpenThread(message)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teams-accent hover:underline"
          >
            <MessageSquare className="w-3 h-3" />
            <span>{message.replies_count ? `${message.replies_count} replies` : 'Reply in thread'}</span>
          </button>
        </div>
      </div>

      {/* Floating Action Menu Bar */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-2 bg-[#282828] border border-teams-border rounded-lg shadow-lg flex items-center p-1 gap-1 z-10">
        <button
          onClick={handleCopyText}
          className="p-1 text-teams-muted hover:text-white rounded hover:bg-teams-hover flex items-center gap-1 text-[10px]"
          title="Copy message text"
        >
          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1 text-teams-muted hover:text-white rounded hover:bg-teams-hover"
            title="Add reaction"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
          {showEmojiPicker && (
            <div className="absolute right-0 top-7 bg-[#202020] border border-teams-border rounded-lg shadow-xl p-1.5 flex gap-1 z-20">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleToggleReaction(emoji)}
                  className="p-1 hover:bg-teams-hover rounded text-sm transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {isOwner && (
          <>
            <button
              onClick={() => {
                setEditContent(message.content);
                setIsEditing(true);
              }}
              className="p-1 text-teams-muted hover:text-white rounded hover:bg-teams-hover"
              title="Edit message"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1 text-rose-400 hover:bg-rose-500/20 rounded"
              title="Delete message"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
