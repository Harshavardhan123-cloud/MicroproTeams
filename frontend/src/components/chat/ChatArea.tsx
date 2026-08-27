import React, { useEffect, useState, useRef } from 'react';
import { Hash, Lock, Users, Search, Bell, Pin } from 'lucide-react';
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

  // Real-time WebSocket integration
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
      <div className="flex-1 bg-[#181818] flex items-center justify-center text-teams-muted">
        <div className="text-center space-y-2">
          <Hash className="w-10 h-10 mx-auto text-teams-purple/60 animate-pulse" />
          <p className="font-semibold text-sm text-white">No Channel Selected</p>
          <p className="text-xs">Select a team and channel from the sidebar to view conversations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#181818]">
      {/* Main Channel Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Channel Header Bar */}
        <div className="h-14 bg-[#1F1F1F] border-b border-teams-border flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            {selectedChannel.type === 'private' ? (
              <Lock className="w-5 h-5 text-amber-400" />
            ) : (
              <Hash className="w-5 h-5 text-teams-purple" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-white">{selectedChannel.name}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-teams-purple/20 text-teams-accent font-semibold uppercase">
                  {selectedTeam?.name}
                </span>
              </div>
              {selectedChannel.description && (
                <p className="text-[11px] text-teams-muted truncate max-w-md">{selectedChannel.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="p-1.5 text-teams-muted hover:text-white rounded hover:bg-teams-hover" title="Pinned Messages">
              <Pin className="w-4 h-4" />
            </button>
            <button className="p-1.5 text-teams-muted hover:text-white rounded hover:bg-teams-hover" title="Channel Members">
              <Users className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Channel Messages Timeline */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="space-y-4 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-[#2A2A2A]" />
                  <div className="flex-1 space-y-2">
                    <div className="w-32 h-3 bg-[#2A2A2A] rounded" />
                    <div className="w-full h-4 bg-[#2A2A2A] rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-teams-muted text-center p-8">
              <div className="w-12 h-12 rounded-2xl bg-teams-purple/20 text-teams-purple flex items-center justify-center mb-3 font-bold text-xl">
                #
              </div>
              <h3 className="font-bold text-base text-white mb-1">Welcome to #{selectedChannel.name}!</h3>
              <p className="text-xs max-w-sm">This is the start of the #{selectedChannel.name} channel. Send a message to start collaboration.</p>
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
          <div className="px-6 py-1 text-[11px] text-teams-accent italic animate-pulse">
            Someone is typing...
          </div>
        )}

        {/* Message Input Composer */}
        <div className="p-4 bg-[#181818] border-t border-teams-border/50 shrink-0">
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
