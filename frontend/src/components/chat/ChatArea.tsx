import React, { useEffect, useState, useRef } from 'react';
import { Hash, Lock, Users, Pin } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { Message } from '../../types';
import { apiClient } from '../../api/client';
import { MessageItem } from './MessageItem';
import { MessageComposer } from './MessageComposer';
import { ThreadDrawer } from './ThreadDrawer';
import { useWebSocket } from '../../hooks/useWebSocket';

export const ChatArea: React.FC = () => {
  const { selectedTeam, selectedChannel } = useUIStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeThreadMessage, setActiveThreadMessage] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const fetchMessages = async () => {
    if (!selectedChannel) return;
    try {
      setIsLoading(true);
      const res = await apiClient.get(`/channels/${selectedChannel.id}/messages`);
      setMessages(res.data.data || res.data);
    } catch (err) {
      console.error('Fetch messages error:', err);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollToBottom('auto'), 50);
    }
  };

  useWebSocket(selectedChannel?.id, (event) => {
    if (event.type === 'message.new' && event.message?.channel_id === selectedChannel?.id) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === event.message.id)) return prev;
        return [...prev, event.message];
      });
      setTimeout(() => scrollToBottom('smooth'), 50);
    } else if (event.type === 'message.update') {
      setMessages((prev) => prev.map((m) => (m.id === event.message.id ? event.message : m)));
    } else if (event.type === 'message.delete') {
      setMessages((prev) => prev.filter((m) => m.id !== event.message_id));
    } else if (event.type === 'reaction.toggle') {
      setMessages((prev) => prev.map((m) => (m.id === event.message.id ? event.message : m)));
    } else if (event.type === 'typing_indicator') {
      if (event.is_typing) {
        setTypingUsers((prev) => new Set(prev).add(event.user_id));
        setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Set(prev);
            next.delete(event.user_id);
            return next;
          });
        }, 3000);
      }
    }
  });

  useEffect(() => {
    fetchMessages();
  }, [selectedChannel?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('auto');
    }
  }, [messages.length]);

  if (!selectedChannel) {
    return (
      <div className="flex-1 bg-[#0B0D12] flex items-center justify-center text-mc-muted">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mx-auto">
            <Hash className="w-6 h-6 animate-pulse" />
          </div>
          <p className="font-bold text-sm text-white font-display">No Channel Selected</p>
          <p className="text-xs text-mc-secondary max-w-xs">Select a workspace team and channel from the sidebar to view discussions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#0B0D12]">
      {/* Main Channel Area */}
      <div data-chat-viewport="true" className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Channel Header Bar */}
        <div className="h-12 bg-[#11131A] border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center gap-3">
            {selectedChannel.type === 'private' ? (
              <Lock className="w-4 h-4 text-amber-400" />
            ) : (
              <Hash className="w-4 h-4 text-indigo-400" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-xs text-white font-display">{selectedChannel.name}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300 font-medium">
                  {selectedTeam?.name}
                </span>
              </div>
              {selectedChannel.description && (
                <p className="text-[11px] text-mc-muted truncate max-w-md">{selectedChannel.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button className="p-1.5 text-mc-secondary hover:text-white rounded-lg hover:bg-white/5 transition-colors" title="Pinned Messages">
              <Pin className="w-4 h-4" />
            </button>
            <button className="p-1.5 text-mc-secondary hover:text-white rounded-lg hover:bg-white/5 transition-colors" title="Channel Members">
              <Users className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Channel Messages Timeline */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {isLoading ? (
            <div className="space-y-4 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <div className="w-32 h-3 bg-white/10 rounded" />
                    <div className="w-full h-4 bg-white/10 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-mc-muted text-center p-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center mb-3 font-black text-xl shadow-lg shadow-indigo-600/30">
                #
              </div>
              <h3 className="font-bold text-base text-white mb-1 font-display">Start of #{selectedChannel.name}</h3>
              <p className="text-xs text-mc-secondary max-w-sm">This is the beginning of the #{selectedChannel.name} channel conversation.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                onOpenThread={(message) => setActiveThreadMessage(message)}
                onRefresh={fetchMessages}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing Indicator */}
        {typingUsers.size > 0 && (
          <div className="px-6 py-1 text-[11px] text-indigo-400 italic animate-pulse">
            Someone is typing...
          </div>
        )}

        {/* Message Input Composer */}
        <div className="p-4 bg-[#0B0D12] border-t border-white/5 shrink-0">
          <MessageComposer
            channelId={selectedChannel.id}
            placeholder={`Message #${selectedChannel.name}`}
            onSendSuccess={fetchMessages}
          />
        </div>
      </div>

      {/* Slide-out Thread Drawer */}
      <ThreadDrawer
        parentMessage={activeThreadMessage}
        isOpen={!!activeThreadMessage}
        onClose={() => setActiveThreadMessage(null)}
      />
    </div>
  );
};
