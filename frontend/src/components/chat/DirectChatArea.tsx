import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MessageSquare, Send, Paperclip, Smile, Phone, Video, Trash2, Edit2, Check, CheckCheck, Copy, PhoneCall, ExternalLink, Image, FileText, Download, X, CornerDownLeft } from 'lucide-react';
import { apiClient, getMediaUrl } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { useUIStore } from '../../stores/uiStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { UserAvatar } from '../common/UserAvatar';
import { DeleteMessageModal } from '../modals/DeleteMessageModal';
import { formatISTTime } from '../../utils/dateUtils';
import { AttachmentCard } from './AttachmentCard';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '🚀', '🙏', '👏'];
const EXTRA_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '🚀', '🙏', '👏', '😁', '🥳', '💡', '✨', '💯', '🙌', '💬', '👌'];

interface ChatAttachment {
  id: string;
  file?: File;
  name: string;
  size: number;
  type: string;
  url: string;
}

interface DirectChatAreaProps {
  conversationId: string | null;
}

export const DirectChatArea: React.FC<DirectChatAreaProps> = ({ conversationId }) => {
  const { user: currentUser } = useAuthStore();
  const { initiateCall, callState, canRejoin, setIsCallMinimized, rejoinLastCall } = useCallStore();

  const [conversation, setConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Attachments & Clipboard Paste state
  const [attachedFiles, setAttachedFiles] = useState<ChatAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Emoji Pickers state
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  // Edit Message State
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  // Delete Modal State
  const [deleteTargetMsgId, setDeleteTargetMsgId] = useState<string | null>(null);
  const isAdmin = currentUser?.role === 'ADMIN' || (currentUser as any)?.is_admin || (currentUser as any)?.is_superuser;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const markAsRead = async () => {
    const readReceiptsEnabled = localStorage.getItem('mc_read_receipts') !== 'false';
    if (!readReceiptsEnabled || !conversationId) return;
    try {
      await apiClient.post(`/direct-conversations/${conversationId}/read`);
    } catch (err) {
      // silent fallback
    }
  };

  const fetchDMMessages = async () => {
    if (!conversationId) return;
    try {
      if (messages.length === 0) setIsLoading(true);

      const convsRes = await apiClient.get('/direct-conversations');
      const convList = convsRes.data.data || convsRes.data || [];
      const currentConv = convList.find((c: any) => c.id === conversationId);
      setConversation(currentConv || null);

      const msgRes = await apiClient.get(`/direct-conversations/${conversationId}/messages`);
      const msgData = msgRes.data.data || msgRes.data || [];
      setMessages(msgData);
      markAsRead();
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
          if (!newMsg.id || prev.some((m) => String(m.id) === String(newMsg.id))) {
            return prev.map((m) => String(m.id) === String(newMsg.id) ? { ...m, ...newMsg } : m);
          }
          return [...prev, newMsg];
        });
        if (String(newMsg.sender_id) !== String(currentUser?.id)) {
          markAsRead();
        }
        setTimeout(scrollToBottom, 100);
      }
    } else if (event.type === 'direct_message.read' || event.type === 'message.read_receipt') {
      if (event.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            String(m.sender_id) === String(currentUser?.id)
              ? { ...m, is_read: true, read_at: event.read_at }
              : m
          )
        );
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
    } else if (event.type === 'reaction.toggle') {
      if (event.message) {
        const updatedMsg = event.message;
        setMessages((prev) => prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)));
      }
    } else if (event.type === 'direct_message.clear') {
      if (event.conversation_id === conversationId) {
        setMessages([]);
      }
    } else if (event.type === 'presence_update') {
      setConversation((prev: any) => {
        if (!prev || !prev.members) return prev;
        return {
          ...prev,
          members: prev.members.map((m: any) =>
            String(m.id || m.user_id) === String(event.user_id)
              ? { ...m, presence: event.presence }
              : m
          )
        };
      });
    }
  }, [conversationId, currentUser?.id]);

  useWebSocket(conversationId || undefined, handleWebSocketEvent);

  // Helper to add files into attachedFiles
  const addFilesToAttachments = (files: FileList | File[]) => {
    const newAttachments: ChatAttachment[] = [];
    Array.from(files).forEach((file) => {
      const objectUrl = URL.createObjectURL(file);
      newAttachments.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        url: objectUrl
      });
    });
    setAttachedFiles((prev) => [...prev, ...newAttachments]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToAttachments(e.target.files);
      e.target.value = '';
    }
  };

  // Clipboard Paste Handler (Ctrl+V / Cmd+V)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const filesToAttach: File[] = [];

    // Check items for image/file data
    if (clipboardData.items) {
      Array.from(clipboardData.items).forEach((item) => {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) filesToAttach.push(file);
        }
      });
    }

    if (filesToAttach.length > 0) {
      e.preventDefault();
      addFilesToAttachments(filesToAttach);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachedFiles((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.url.startsWith('blob:')) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if ((!trimmed && attachedFiles.length === 0) || !conversationId || isSending) return;

    try {
      setIsSending(true);

      // Upload attached files if any exist
      const uploadedAttachments: any[] = [];
      for (const att of attachedFiles) {
        if (att.file) {
          try {
            const formData = new FormData();
            formData.append('file', att.file);
            const uploadRes = await apiClient.post('/files/upload', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
            const fileData = uploadRes.data.data || uploadRes.data;
            const fileName = fileData.name || fileData.original_name || fileData.file_name || att.name;
            const finalUploadedUrl = fileData.file_url || fileData.url || fileData.download_url || att.url;
            uploadedAttachments.push({
              file_id: fileData.id,
              name: fileName,
              size: fileData.size || att.size,
              type: fileData.mime_type || att.type,
              url: finalUploadedUrl
            });
          } catch (uploadErr) {
            console.error('File upload error:', uploadErr);
          }
        } else if (att.url && !att.url.startsWith('blob:')) {
          uploadedAttachments.push({
            name: att.name,
            size: att.size,
            type: att.type,
            url: att.url
          });
        }
      }

      // Construct message text with persistent attachment markdown tags
      let finalContent = trimmed;
      if (uploadedAttachments.length > 0) {
        const attText = uploadedAttachments.map(a => `[Attachment: ${a.name}](${getMediaUrl(a.url)})`).join('\n');
        finalContent = finalContent ? `${finalContent}\n\n${attText}` : attText;
      }

      // Optimistically clear composer input & attachments immediately
      setContent('');
      setAttachedFiles([]);
      setIsEmojiPickerOpen(false);

      const res = await apiClient.post(`/direct-conversations/${conversationId}/messages`, {
        content: finalContent,
        attachments: uploadedAttachments
      });

      const newMsg = res.data.data || res.data;
      // Ensure attachments are stored locally on message object if present
      if (uploadedAttachments.length > 0 && !newMsg.attachments) {
        newMsg.attachments = uploadedAttachments;
      }

      setMessages((prev) => {
        if (prev.some((m) => String(m.id) === String(newMsg.id))) {
          return prev.map((m) => String(m.id) === String(newMsg.id) ? { ...m, ...newMsg } : m);
        }
        return [...prev, newMsg];
      });
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      console.error('Send DM error:', err);
      // Only restore content if message was not already received & rendered via WebSocket
      setMessages((currentMsgs) => {
        const alreadyRendered = currentMsgs.some(
          (m) => (m.sender_id === currentUser?.id || m.sender?.id === currentUser?.id) && m.content === trimmed
        );
        if (!alreadyRendered) {
          setContent(trimmed);
        }
        return currentMsgs;
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleReaction = async (msgId: string, emoji: string) => {
    try {
      setActiveReactionMsgId(null);
      const res = await apiClient.post(`/messages/${msgId}/reactions`, { emoji });
      const updatedMsg = res.data.data || res.data;
      setMessages((prev) => prev.map((m) => (m.id === msgId ? updatedMsg : m)));
    } catch (err) {
      console.error('Reaction toggle error:', err);
      // Fallback optimistic update
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId) return m;
          const reactions = m.reactions || [];
          const existing = reactions.find((r: any) => r.emoji === emoji && r.user_id === currentUser?.id);
          const nextReactions = existing
            ? reactions.filter((r: any) => r !== existing)
            : [...reactions, { id: Math.random().toString(), emoji, user_id: currentUser?.id }];
          return { ...m, reactions: nextReactions };
        })
      );
    }
  };

  const handleStartEdit = (msg: any) => {
    setEditingMsgId(msg.id);
    setEditContent(msg.content);
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!editContent.trim()) return;
    try {
      if (conversationId) {
        await apiClient.patch(`/direct-conversations/${conversationId}/messages/${msgId}`, { content: editContent.trim() });
      } else {
        await apiClient.patch(`/direct-messages/${msgId}`, { content: editContent.trim() });
      }
      setEditingMsgId(null);
      fetchDMMessages();
    } catch (err) {
      console.error('Edit DM error, retrying fallback:', err);
      try {
        await apiClient.patch(`/direct-messages/${msgId}`, { content: editContent.trim() });
        setEditingMsgId(null);
        fetchDMMessages();
      } catch (fallbackErr) {
        console.error('Fallback edit error:', fallbackErr);
      }
    }
  };

  const handleDeleteMessage = (msgId: string) => {
    setDeleteTargetMsgId(msgId);
  };

  const confirmDeleteMessage = async (mode: 'me' | 'everyone') => {
    if (!deleteTargetMsgId) return;
    const msgId = deleteTargetMsgId;
    setDeleteTargetMsgId(null);
    try {
      if (conversationId) {
        await apiClient.delete(`/direct-conversations/${conversationId}/messages/${msgId}?mode=${mode}`);
      } else {
        await apiClient.delete(`/direct-messages/${msgId}?mode=${mode}`);
      }
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      console.error('Delete DM error, retrying fallback:', err);
      try {
        await apiClient.delete(`/direct-messages/${msgId}?mode=${mode}`);
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
      } catch (fallbackErr) {
        console.error('Fallback delete error:', fallbackErr);
      }
    }
  };

  const handleCopyText = async (msg: any) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMsgId(msg.id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch (err) {
      console.error('Copy text error:', err);
    }
  };

  const handleKeyDownComposer = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // 1. Enter (without Shift) -> Send message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
      return;
    }

    // 2. Up Arrow (↑) when composer is empty -> Edit / reload user's last message (WhatsApp Web / Slack feature)
    if (e.key === 'ArrowUp' && !content.trim()) {
      e.preventDefault();
      const myLastMsg = [...messages].reverse().find(m => 
        String(m.sender_id || m.sender?.id) === String(currentUser?.id) && m.content
      );
      if (myLastMsg) {
        setContent(myLastMsg.content);
      }
      return;
    }

    // 3. Escape key -> Close emoji picker, clear attachments, or blur composer
    if (e.key === 'Escape') {
      setIsEmojiPickerOpen(false);
      if (attachedFiles.length > 0) setAttachedFiles([]);
      (e.target as HTMLTextAreaElement).blur();
      return;
    }

    // 4. Ctrl+B / Cmd+B -> Bold formatting
    if (isCtrlOrCmd && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const text = content;
      const selected = text.substring(start, end) || 'text';
      setContent(text.substring(0, start) + `**${selected}**` + text.substring(end));
      return;
    }

    // 5. Ctrl+I / Cmd+I -> Italic formatting
    if (isCtrlOrCmd && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const text = content;
      const selected = text.substring(start, end) || 'text';
      setContent(text.substring(0, start) + `*${selected}*` + text.substring(end));
      return;
    }
  };

  const handleStartCall = async (type: 'audio' | 'video') => {
    let otherMember = conversation?.members?.find((m: any) => String(m.id || m.user_id) !== String(currentUser?.id));
    
    if (!otherMember && conversationId) {
      try {
        const convsRes = await apiClient.get('/direct-conversations');
        const convList = convsRes.data.data || convsRes.data || [];
        const currentConv = convList.find((c: any) => String(c.id) === String(conversationId));
        if (currentConv?.members) {
          otherMember = currentConv.members.find((m: any) => String(m.id || m.user_id) !== String(currentUser?.id));
        }
      } catch (err) {
        console.error('Failed to resolve DM member for call:', err);
      }
    }

    const targetName = conversation?.title || otherMember?.display_name || 'Teammate';
    const targetUserId = otherMember?.id || (otherMember as any)?.user_id;

    if (!targetUserId) {
      console.warn('Cannot initiate call: recipient user ID is missing.');
      return;
    }

    initiateCall(
      {
        id: String(targetUserId),
        name: targetName,
        avatar: otherMember?.avatar_url
      },
      type,
      conversationId || undefined
    );

    if (conversationId) {
      const callNotice = `📞 Started a ${type === 'video' ? 'video' : 'audio'} call with ${targetName}.`;
      await apiClient.post(`/direct-conversations/${conversationId}/messages`, {
        content: callNotice
      });
      fetchDMMessages();
    }
  };

  if (!conversationId) {
    return (
      <div className="flex-1 bg-[#0B0D12] flex items-center justify-center text-mc-muted">
        <div className="text-center p-8 bg-[#11131A] border border-white/10 rounded-2xl max-w-md shadow-2xl">
          <div className="w-14 h-14 bg-indigo-600/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
            <MessageSquare className="w-7 h-7" />
          </div>
          <h3 className="text-white font-bold text-base mb-1.5 font-display">Direct & Group Messages</h3>
          <p className="text-xs text-mc-secondary leading-relaxed">
            Select a conversation from the sidebar or click <strong className="text-white">+</strong> to start a private discussion.
          </p>
        </div>
      </div>
    );
  }

  const otherMember = conversation?.members?.find((m: any) => m.id !== currentUser?.id) || conversation?.members?.[0];
  const chatTitle = conversation?.title || otherMember?.display_name || 'Direct Message';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0D12] relative">
      {/* Direct Message Header */}
      <div className="h-12 bg-[#11131A] border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <UserAvatar
            user={otherMember}
            avatarUrl={otherMember?.avatar_url}
            name={chatTitle}
            size="sm"
            showStatus={true}
            status={otherMember?.presence}
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-xs text-white font-display">{chatTitle}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300 font-medium">
                {conversation?.is_group ? 'Group Chat' : 'Direct Message'}
              </span>
            </div>
            <p className="text-[10px] text-mc-muted flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                otherMember?.presence === 'busy' || otherMember?.presence === 'dnd' ? 'bg-rose-500' :
                otherMember?.presence === 'away' ? 'bg-amber-500' :
                otherMember?.presence === 'available' || otherMember?.presence === 'online' ? 'bg-emerald-500' : 'bg-gray-400'
              }`} />
              <span>{otherMember?.status_message || (otherMember?.presence ? `Status: ${otherMember.presence}` : 'Offline')}</span>
            </p>
          </div>
        </div>

        {/* Action Header Icons */}
        <div className="flex items-center gap-2">
          {(callState === 'active' || canRejoin) && (
            <button
              onClick={() => {
                if (callState === 'active') {
                  setIsCallMinimized(false);
                } else if (canRejoin) {
                  rejoinLastCall();
                }
              }}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-full transition-all flex items-center gap-1.5 text-xs shadow-lg shadow-emerald-600/30 animate-pulse active:scale-95"
              title="Rejoin Active Meeting"
            >
              <PhoneCall className="w-4 h-4 text-white" />
              <span>Rejoin</span>
            </button>
          )}

          <button
            onClick={() => handleStartCall('video')}
            className="p-1.5 text-mc-secondary hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center gap-1.5 text-xs"
            title="Start Video Call"
          >
            <Video className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline font-medium">Video</span>
          </button>
          <button
            onClick={() => handleStartCall('audio')}
            className="p-1.5 text-mc-secondary hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center gap-1.5 text-xs"
            title="Start Audio Call"
          >
            <Phone className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline font-medium">Call</span>
          </button>

          <button
            onClick={() => {
              if (conversationId) {
                useUIStore.getState().setPoppedOutChatId(conversationId);
              }
            }}
            className="p-1.5 text-mc-secondary hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center gap-1.5 text-xs border border-white/5 hover:border-indigo-500/30"
            title="Pop-out Chat in Floating Window"
          >
            <ExternalLink className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline font-medium">Pop-out</span>
          </button>
        </div>
      </div>

      {/* Messages Timeline */}
      <div className="chat-messages-container flex-1 overflow-y-auto p-6 space-y-3 select-text">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-white/10" />
                <div className="flex-1 space-y-2">
                  <div className="w-32 h-3 bg-white/10 rounded" />
                  <div className="w-3/4 h-4 bg-white/10 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-mc-muted text-center p-8">
            <UserAvatar
              user={otherMember}
              avatarUrl={otherMember?.avatar_url}
              name={chatTitle}
              size="xl"
              className="mb-3"
            />
            <h3 className="font-bold text-base text-white mb-1 font-display">Chat with {chatTitle}</h3>
            <p className="text-xs text-mc-secondary max-w-sm">This is the start of your message history.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === currentUser?.id || msg.sender?.id === currentUser?.id;
            const senderName = msg.sender?.display_name || msg.sender_name || (isMe ? currentUser?.display_name : chatTitle);
            const timeStr = formatISTTime(msg.created_at);
            const isEditing = editingMsgId === msg.id;

            const isAdmin = currentUser?.is_admin || currentUser?.is_superuser || currentUser?.role === 'ADMIN' || currentUser?.role === 'ORG_ADMIN';
            const canEditOrDelete = isMe || isAdmin;

            // Extract effective attachments and clean text with robust deduplication
            const effectiveAttachments: any[] = [];
            const seenKeys = new Set<string>();

            const addAttachment = (name: string, rawUrl: string, type?: string) => {
              if (!rawUrl) return;
              const formattedUrl = getMediaUrl(rawUrl);
              const key = formattedUrl.includes('/uploads/') ? formattedUrl.split('/uploads/')[1] : formattedUrl;
              if (seenKeys.has(key)) return;
              seenKeys.add(key);

              const isImg = type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name || formattedUrl) || formattedUrl.startsWith('data:image/') || formattedUrl.startsWith('blob:');
              effectiveAttachments.push({
                name: name || key,
                url: formattedUrl,
                type: isImg ? 'image/png' : (type || 'application/octet-stream')
              });
            };

            // 1. Process attachments from DB/optimistic array
            if (msg.attachments && Array.isArray(msg.attachments)) {
              for (const att of msg.attachments) {
                if (att.url) {
                  addAttachment(att.name, att.url, att.type);
                }
              }
            }

            // 2. Parse [Attachment: name](url) tags from message content
            let rawContent = msg.content || '';
            const attRegex = /\[Attachment:\s*([^\]]+)\]\(([^)]+)\)/gi;
            let match;
            while ((match = attRegex.exec(rawContent)) !== null) {
              addAttachment(match[1], match[2]);
            }

            // Strip [Attachment: ...](...) from display text
            const displayContent = rawContent.replace(/\[Attachment:\s*[^\]]+\]\([^)]+\)/gi, '').trim();

            return (
              <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''} group relative px-2 py-1.5 hover:bg-white/[0.02] rounded-xl transition-colors`}>
                <UserAvatar
                  user={msg.sender}
                  avatarUrl={msg.sender_avatar || msg.sender?.avatar_url || (isMe ? currentUser?.avatar_url : otherMember?.avatar_url)}
                  name={senderName}
                  size="sm"
                />

                <div className={`max-w-md flex flex-col ${isMe ? 'items-end text-right' : 'items-start'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-white font-display">{senderName}</span>
                    <span className="text-[10px] text-mc-muted">{timeStr}</span>
                    {msg.is_edited && (
                      <span className="text-[9px] text-mc-muted italic">(edited)</span>
                    )}
                    {isMe && (
                      <span
                        className="flex items-center ml-0.5"
                        title={
                          localStorage.getItem('mc_read_receipts') !== 'false'
                            ? msg.is_read
                              ? `Read ${msg.read_at ? formatISTTime(msg.read_at) : ''}`
                              : 'Delivered'
                            : 'Sent'
                        }
                      >
                        {localStorage.getItem('mc_read_receipts') !== 'false' && msg.is_read ? (
                          <CheckCheck className="w-3.5 h-3.5 text-cyan-400" />
                        ) : (
                          <CheckCheck className="w-3.5 h-3.5 text-mc-muted" />
                        )}
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flex flex-col gap-2.5 bg-[#171923] p-3 rounded-2xl border border-indigo-500/50 w-full min-w-[300px] shadow-2xl my-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full bg-[#11131A] text-xs text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500 resize-none min-h-[65px] leading-relaxed select-text"
                      />
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => setEditingMsgId(null)}
                          className="px-3 py-1 text-xs text-mc-muted hover:text-white bg-white/5 border border-white/10 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(msg.id)}
                          className="px-4 py-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md"
                        >
                          <Check className="w-3.5 h-3.5" /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative group/msg my-0.5 max-w-full">
                      {/* Attached Files rendering inside Message Bubble */}
                      {effectiveAttachments.length > 0 && (
                        <div className="flex flex-col gap-2 mb-2">
                          {effectiveAttachments.map((att: any, idx: number) => (
                            <AttachmentCard
                              key={idx}
                              name={att.name}
                              url={att.url}
                              size={att.size}
                              type={att.type}
                            />
                          ))}
                        </div>
                      )}

                      {displayContent.length > 0 ? (
                        <p
                          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                          className={`selectable-text p-3 rounded-2xl text-xs leading-relaxed break-words whitespace-pre-wrap shadow-md select-text cursor-text selection:bg-indigo-500 selection:text-white ${
                            isMe
                              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-tr-none'
                              : 'bg-[#171923] text-mc-text border border-white/10 rounded-tl-none'
                          }`}
                        >
                          {displayContent}
                        </p>
                      ) : effectiveAttachments.length === 0 ? (
                        <p className="p-2.5 rounded-xl text-xs italic text-mc-muted bg-[#171923]/40 border border-white/5 inline-block">
                          (Empty message)
                        </p>
                      ) : null}

                      {/* Emoji Reactions Pills */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {Object.entries(
                            msg.reactions.reduce((acc: any, r: any) => {
                              acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                              return acc;
                            }, {})
                          ).map(([emoji, count]: any) => {
                            const userReacted = msg.reactions.some((r: any) => r.emoji === emoji && r.user_id === currentUser?.id);
                            return (
                              <button
                                key={emoji}
                                onClick={() => handleToggleReaction(msg.id, emoji)}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all border ${
                                  userReacted
                                    ? 'bg-indigo-600/30 border-indigo-500 text-white'
                                    : 'bg-[#171923] border-white/10 text-mc-secondary hover:border-white/20'
                                }`}
                              >
                                <span>{emoji}</span>
                                <span className="text-[10px] font-bold">{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Message Hover Floating Action Toolbar */}
                      <div className={`opacity-0 group-hover:opacity-100 group-hover/msg:opacity-100 transition-opacity absolute top-0 ${isMe ? '-left-36' : '-right-36'} bg-[#171923] border border-white/10 rounded-xl shadow-xl flex items-center p-1 gap-0.5 z-30 pointer-events-auto mc-glass`}>
                        <button
                          onClick={() => handleCopyText(msg)}
                          className="p-1.5 text-mc-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center gap-1 text-[10px]"
                          title="Copy Message"
                        >
                          {copiedMsgId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-indigo-400" />
                          )}
                        </button>

                        <div className="relative">
                          <button
                            onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                            className="p-1.5 text-mc-muted hover:text-amber-400 hover:bg-white/5 rounded-lg transition-colors"
                            title="Add Reaction"
                          >
                            <Smile className="w-3.5 h-3.5 text-amber-400" />
                          </button>
                          {activeReactionMsgId === msg.id && (
                            <div className="absolute right-0 bottom-8 bg-[#171923] border border-white/10 rounded-xl shadow-2xl p-1.5 flex gap-1 z-40 mc-glass animate-in zoom-in-95">
                              {QUICK_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleToggleReaction(msg.id, emoji)}
                                  className="p-1 hover:bg-white/10 rounded-lg text-sm transition-transform hover:scale-125"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {canEditOrDelete && (
                          <>
                            <button
                              onClick={() => handleStartEdit(msg)}
                              className="p-1.5 text-mc-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                              title="Edit Message"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                            </button>

                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="p-1.5 text-mc-muted hover:text-rose-400 hover:bg-white/5 rounded-lg transition-colors"
                              title="Delete Message"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
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

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        multiple
        className="hidden"
      />

      {/* Message Composer Bar */}
      <div className="p-4 bg-[#0B0D12] border-t border-white/5 shrink-0 relative">
        {/* Attachment Previews Bar */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2.5 p-2 bg-[#171923] border border-white/10 rounded-xl">
            {attachedFiles.map((att) => {
              const isImg = att.type.startsWith('image/');
              return (
                <div key={att.id} className="relative group/att bg-[#11131A] border border-white/10 rounded-lg p-1.5 flex items-center gap-2 max-w-[180px]">
                  {isImg ? (
                    <img src={att.url} alt={att.name} className="w-8 h-8 rounded object-cover shrink-0" />
                  ) : (
                    <FileText className="w-6 h-6 text-indigo-400 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-white truncate">{att.name}</p>
                    <p className="text-[9px] text-mc-muted">{(att.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="p-0.5 hover:bg-rose-500/20 text-mc-muted hover:text-rose-400 rounded transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Emoji Picker Popover */}
        {isEmojiPickerOpen && (
          <div className="absolute bottom-16 right-12 bg-[#171923] border border-white/10 rounded-2xl p-2.5 shadow-2xl z-40 grid grid-cols-4 gap-1.5 mc-glass animate-in zoom-in-95">
            {EXTRA_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setContent((prev) => prev + emoji);
                  setIsEmojiPickerOpen(false);
                }}
                className="p-2 hover:bg-white/10 rounded-xl text-lg hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex items-end gap-2 bg-[#171923] border border-white/10 rounded-2xl px-3 py-2 focus-within:border-indigo-500/50 transition-all shadow-inner">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 text-mc-muted hover:text-white rounded-lg hover:bg-white/5 mb-0.5 transition-colors"
            title="Attach file or image"
          >
            <Paperclip className="w-4 h-4 text-indigo-400" />
          </button>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDownComposer}
            placeholder={`Message ${chatTitle}... (Enter to send | Paste images/files directly)`}
            rows={2}
            className="flex-1 bg-transparent text-xs text-white placeholder-mc-muted focus:outline-none resize-none max-h-32 min-h-[38px] py-1.5 leading-relaxed selection:bg-indigo-500 selection:text-white"
          />
          <button
            type="button"
            onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
            className="p-1.5 text-mc-muted hover:text-amber-400 rounded-lg hover:bg-white/5 mb-0.5 transition-colors"
            title="Insert emoji"
          >
            <Smile className="w-4 h-4 text-amber-400" />
          </button>
          <button
            type="submit"
            disabled={(!content.trim() && attachedFiles.length === 0) || isSending}
            className="p-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 text-white rounded-xl transition-all shadow-md mb-0.5 flex items-center gap-1.5 text-xs font-semibold active:scale-95"
            title="Send Message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
        <p className="text-[10px] text-mc-muted mt-1.5 px-1 flex items-center gap-1.5 select-none">
          <CornerDownLeft className="w-3 h-3 text-indigo-400" />
          <span>Press <strong>Enter</strong> to send | <strong>Shift + Enter</strong> for new line | Paste files directly via <strong>Ctrl+V</strong></span>
        </p>
      </div>

      <DeleteMessageModal
        isOpen={!!deleteTargetMsgId}
        onClose={() => setDeleteTargetMsgId(null)}
        onConfirm={confirmDeleteMessage}
        isAdmin={isAdmin}
        itemType="message"
      />
    </div>
  );
};
