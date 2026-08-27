import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MessageSquare, Send, Paperclip, Smile, Phone, Video, Trash2, Edit2, Check, X, CornerDownLeft, Copy } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { wsService } from '../../services/websocketService';

interface DirectChatAreaProps {
  conversationId: string | null;
}

export const DirectChatArea: React.FC<DirectChatAreaProps> = ({ conversationId }) => {
  const { user: currentUser } = useAuthStore();
  const { initiateCall } = useCallStore();

  const [conversation, setConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Edit Message State
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const fetchDMMessages = async () => {
    if (!conversationId) return;
    try {
      setIsLoading(true);

      const convsRes = await apiClient.get('/direct-conversations');
      const convList = convsRes.data.data || convsRes.data || [];
      const currentConv = convList.find((c: any) => c.id === conversationId);
      setConversation(currentConv || null);

      const msgRes = await apiClient.get(`/direct-conversations/${conversationId}/messages`);
      const msgData = msgRes.data.data || msgRes.data || [];
      setMessages(msgData);
    } catch (err) {
      console.error('Fetch DM messages error:', err);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollToBottom('auto'), 50);
    }
  };

  useEffect(() => {
    fetchDMMessages();
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('auto');
    }
  }, [messages.length, conversationId]);

  const handleWebSocketEvent = useCallback((event: any) => {
    if (event.type === 'direct_message.new' || event.type === 'message.new') {
      const targetConvId = event.conversation_id || event.message?.conversation_id;
      if (targetConvId === conversationId) {
        const newMsg = event.message || event;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        setTimeout(scrollToBottom, 100);
      }
    } else if (event.type === 'direct_message.update' || event.type === 'message.update') {
      if (event.conversation_id === conversationId) {
        const updatedMsg = event.message;
        setMessages((prev) => prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)));
      }
    } else if (event.type === 'direct_message.delete' || event.type === 'message.delete') {
      if (event.conversation_id === conversationId) {
        setMessages((prev) => prev.filter((m) => m.id !== event.message_id));
      }
    } else if (event.type === 'direct_message.clear') {
      if (event.conversation_id === conversationId) {
        setMessages([]);
      }
    }
  }, [conversationId]);

  useWebSocket(undefined, handleWebSocketEvent);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!content.trim() || !conversationId || isSending) return;

    try {
      setIsSending(true);
      const res = await apiClient.post(`/direct-conversations/${conversationId}/messages`, {
        content: content.trim()
      });
      const newMsg = res.data.data || res.data;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      setContent('');
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Send DM message error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDownComposer = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyText = async (msg: any) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMsgId(msg.id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch (err) {
      console.error('Failed to copy DM text:', err);
    }
  };

  const handleStartEdit = (msg: any) => {
    setEditingMsgId(msg.id);
    setEditContent(msg.content);
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!editContent.trim() || !conversationId) return;
    try {
      const res = await apiClient.patch(`/direct-conversations/${conversationId}/messages/${msgId}`, {
        content: editContent.trim()
      });
      const updated = res.data.data || res.data;
      setMessages((prev) => prev.map((m) => (m.id === msgId ? updated : m)));
      setEditingMsgId(null);
    } catch (err) {
      console.error('Save edit error:', err);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!conversationId) return;
    try {
      await apiClient.delete(`/direct-conversations/${conversationId}/messages/${msgId}`);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      console.error('Delete DM message error:', err);
    }
  };

  const handleClearChat = async () => {
    if (!conversationId) return;
    if (window.confirm('Are you sure you want to clear all chat messages in this conversation?')) {
      try {
        await apiClient.delete(`/direct-conversations/${conversationId}/clear`);
        setMessages([]);
      } catch (err) {
        console.error('Clear conversation error:', err);
      }
    }
  };

  const handleStartCall = async (type: 'audio' | 'video') => {
    const otherMember = conversation?.members?.find((m: any) => m.id !== currentUser?.id) || conversation?.members?.[0];
    const targetName = conversation?.title || otherMember?.display_name || 'Teammate';

    const isGroupCall = (conversation?.members?.length || 0) > 2;

    // 1. Trigger global Fullscreen Call Overlay ("Calling...")
    initiateCall(
      {
        id: otherMember?.id || 'target-user',
        name: targetName,
        avatar: otherMember?.avatar_url
      },
      type,
      conversationId || undefined,
      isGroupCall
    );

    // 2. Broadcast live WebSocket call invitation signal to all other members
    const otherMembers = conversation?.members?.filter((m: any) => m.id !== currentUser?.id) || [];
    otherMembers.forEach((member: any) => {
      if (member.id) {
        wsService.send({
          type: 'call_invite',
          target_user_id: member.id,
          caller_name: currentUser?.display_name || 'Teammate',
          caller_avatar: currentUser?.avatar_url,
          call_type: type,
          conversation_id: conversationId,
          is_group_call: isGroupCall
        });
      }
    });

    // 3. Post a message to the chat timeline
    if (conversationId) {
      apiClient.post(`/direct-conversations/${conversationId}/messages`, {
        content: `📞 Started a ${type === 'video' ? 'video' : 'audio'} call.`
      }).catch(console.error);
    }

    try {
      await apiClient.post('/meetings', {
        title: `Direct ${type === 'video' ? 'Video' : 'Audio'} Call with ${targetName}`,
        meeting_type: 'INSTANT',
        lobby_enabled: false
      });

      const callNotice = `📞 Started a 1-on-1 ${type === 'video' ? 'Video' : 'Audio'} call with ${targetName}.`;
      await apiClient.post(`/direct-conversations/${conversationId}/messages`, {
        content: callNotice
      });
      fetchDMMessages();
    } catch (err) {
      console.error('Start call error:', err);
    }
  };

  if (!conversationId) {
    return (
      <div className="flex-1 bg-[#181818] flex items-center justify-center text-teams-muted select-none">
        <div className="text-center p-8 bg-[#1F1F1F] border border-teams-border rounded-2xl max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="w-14 h-14 bg-teams-purple/20 border border-teams-purple/40 rounded-2xl flex items-center justify-center text-teams-purple mx-auto mb-4 shadow-inner">
            <MessageSquare className="w-7 h-7" />
          </div>
          <h3 className="text-white font-bold text-base mb-1.5">Direct & Group Messaging</h3>
          <p className="text-xs text-teams-muted leading-relaxed">
            Select a conversation from the sidebar or click <strong className="text-white">+</strong> to start a private 1-on-1 or group chat with teammates.
          </p>
        </div>
      </div>
    );
  }

  const otherMember = conversation?.members?.find((m: any) => m.id !== currentUser?.id) || conversation?.members?.[0];
  const chatTitle = conversation?.title || otherMember?.display_name || 'Direct Message';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#181818] select-none relative">
      {/* Direct Message Header */}
      <div className="h-14 bg-[#1F1F1F] border-b border-teams-border flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-teams-purple flex items-center justify-center font-bold text-xs text-white uppercase shadow-md">
              {chatTitle.charAt(0)}
            </div>
            <span
              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#1F1F1F] ${
                otherMember?.presence === 'available'
                  ? 'bg-emerald-500'
                  : otherMember?.presence === 'busy'
                  ? 'bg-rose-500'
                  : 'bg-amber-500'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-white">{chatTitle}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-teams-purple/20 text-teams-accent font-semibold uppercase">
                {conversation?.is_group ? 'Group Chat' : 'Direct Message'}
              </span>
            </div>
            {otherMember?.email && (
              <p className="text-[10px] text-teams-muted truncate">{otherMember.email}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleStartCall('audio')}
            className="p-2 text-teams-muted hover:text-white rounded-lg hover:bg-teams-hover transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Start Audio Call"
          >
            <Phone className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Audio Call</span>
          </button>
          <button
            onClick={() => handleStartCall('video')}
            className="p-2 bg-teams-purple hover:bg-teams-purple-hover text-white rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-md"
            title="Start Video Meeting"
          >
            <Video className="w-4 h-4" />
            <span className="hidden sm:inline">Video Call</span>
          </button>
          <button
            onClick={handleClearChat}
            className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Clear Chat History"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Clear Chat</span>
          </button>
        </div>
      </div>

      {/* Messages Timeline */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-[#2A2A2A]" />
                <div className="flex-1 space-y-2">
                  <div className="w-32 h-3 bg-[#2A2A2A] rounded" />
                  <div className="w-3/4 h-4 bg-[#2A2A2A] rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-teams-muted text-center p-8">
            <div className="w-12 h-12 rounded-2xl bg-teams-purple/20 text-teams-purple flex items-center justify-center mb-3 font-bold text-xl">
              {chatTitle.charAt(0)}
            </div>
            <h3 className="font-bold text-base text-white mb-1">Conversation with {chatTitle}</h3>
            <p className="text-xs max-w-sm">This is the start of your direct message history. Send a message to get connected.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === currentUser?.id || msg.sender?.id === currentUser?.id;
            const senderName = msg.sender?.display_name || msg.sender_name || (isMe ? currentUser?.display_name : chatTitle);
            const timeStr = msg.created_at
              ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '';
            const isEditing = editingMsgId === msg.id;

            return (
              <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''} group relative`}>
                <div className="w-8 h-8 rounded-full bg-teams-purple flex items-center justify-center font-bold text-xs text-white uppercase shrink-0 shadow-sm">
                  {senderName?.charAt(0) || 'U'}
                </div>
                <div className={`max-w-md flex flex-col ${isMe ? 'items-end text-right' : 'items-start'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-white">{senderName}</span>
                    <span className="text-[10px] text-teams-muted">{timeStr}</span>
                    {msg.is_edited && (
                      <span className="text-[9px] text-teams-muted italic">(edited)</span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flex flex-col gap-2 bg-[#252528] p-2.5 rounded-xl border border-teams-purple/60 w-full min-w-[280px]">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full bg-[#181819] text-xs text-white p-2 rounded-lg border border-teams-border focus:outline-none focus:border-teams-purple resize-none min-h-[60px]"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingMsgId(null)}
                          className="px-2 py-1 text-[11px] text-teams-muted hover:text-white rounded"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(msg.id)}
                          className="px-3 py-1 bg-teams-purple hover:bg-teams-purple-hover text-white text-[11px] font-bold rounded flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div
                        className={`p-3 rounded-2xl text-xs leading-relaxed break-words whitespace-pre-wrap shadow-md ${
                          isMe
                            ? 'bg-teams-purple text-white rounded-tr-none'
                            : 'bg-[#252528] text-teams-text border border-teams-border/60 rounded-tl-none'
                        }`}
                      >
                        {msg.content}
                      </div>

                      {/* Always-Visible Action Toolbar under each message */}
                      <div className={`flex items-center gap-2 pt-0.5 text-[10px] ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <button
                          onClick={() => handleCopyText(msg)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#202022] border border-teams-border/60 hover:border-teams-purple text-teams-muted hover:text-white transition-colors"
                          title="Copy Message Text"
                        >
                          {copiedMsgId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        {isMe && (
                          <>
                            <button
                              onClick={() => handleStartEdit(msg)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#202022] border border-teams-border/60 hover:border-teams-purple text-teams-muted hover:text-white transition-colors"
                              title="Edit Message"
                            >
                              <Edit2 className="w-3 h-3 text-amber-400" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#202022] border border-teams-border/60 hover:border-rose-500/60 text-teams-muted hover:text-rose-400 transition-colors"
                              title="Delete Message"
                            >
                              <Trash2 className="w-3 h-3 text-rose-400" />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Composer Bar */}
      <div className="p-4 bg-[#1F1F1F] border-t border-teams-border shrink-0">
        <form onSubmit={handleSendMessage} className="flex items-end gap-2 bg-[#181819] border border-teams-border rounded-xl px-3 py-2 focus-within:border-teams-purple transition-all shadow-inner">
          <button type="button" className="p-1.5 text-teams-muted hover:text-white rounded-md hover:bg-teams-hover mb-0.5">
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDownComposer}
            placeholder={`Message ${chatTitle}... (Shift + Enter for new line)`}
            rows={1}
            className="flex-1 bg-transparent text-xs text-white placeholder-teams-muted focus:outline-none resize-none max-h-32 min-h-[32px] py-1.5 leading-relaxed"
          />
          <button type="button" className="p-1.5 text-teams-muted hover:text-white rounded-md hover:bg-teams-hover mb-0.5">
            <Smile className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={!content.trim() || isSending}
            className="p-2 bg-teams-purple hover:bg-teams-purple-hover disabled:opacity-40 text-white rounded-lg transition-all shadow-md mb-0.5 flex items-center gap-1 text-xs font-semibold"
            title="Send (Enter)"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
        <p className="text-[10px] text-teams-muted mt-1 px-1 flex items-center gap-1">
          <CornerDownLeft className="w-3 h-3 text-teams-purple" />
          <span>Press <strong>Enter</strong> to send, <strong>Shift + Enter</strong> for line break</span>
        </p>
      </div>
    </div>
  );
};
