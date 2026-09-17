import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MessageSquare, Send, X, Minus, Maximize2, Video, Phone, GripHorizontal, Paperclip, Smile, Copy, Check, FileText, Download, Trash2, Image, Edit2 } from 'lucide-react';
import { apiClient, getMediaUrl } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { useUIStore } from '../../stores/uiStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { UserAvatar } from '../common/UserAvatar';
import { DeleteMessageModal } from '../modals/DeleteMessageModal';
import { formatISTTime } from '../../utils/dateUtils';
import { AttachmentCard } from './AttachmentCard';
import { copyToClipboard } from '../../utils/clipboard';
import { MediaAnnotationModal, MediaAnnotationResult } from './MediaAnnotationModal';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '🚀', '🙏', '👏'];

interface ChatAttachment {
  id: string;
  file?: File;
  name: string;
  size: number;
  type: string;
  url: string;
}

export const PopoutChatWindow: React.FC = () => {
  const { poppedOutChatId, setPoppedOutChatId } = useUIStore();
  const { user: currentUser } = useAuthStore();
  const { initiateCall } = useCallStore();

  const [conversation, setConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Attachments & Clipboard Paste
  const [attachedFiles, setAttachedFiles] = useState<ChatAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Media Annotation Modal State
  const [isAnnotationOpen, setIsAnnotationOpen] = useState(false);
  const [annotationMedia, setAnnotationMedia] = useState<File | string | null>(null);
  const [annotationInitialCaption, setAnnotationInitialCaption] = useState('');

  // Emoji & Reaction state
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Position state for draggable window & pill
  const [windowPos, setWindowPos] = useState<{ x: number; y: number } | null>(null);
  const [pillPos, setPillPos] = useState<{ x: number; y: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const [deleteTargetMsgId, setDeleteTargetMsgId] = useState<string | null>(null);
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'ORG_ADMIN' || (currentUser as any)?.is_admin || (currentUser as any)?.is_superuser;
  const targetDeleteMsg = messages.find((m) => m.id === deleteTargetMsgId);
  const canDeleteForEveryone = !!(isAdmin || (targetDeleteMsg && (targetDeleteMsg.sender_id === currentUser?.id || (targetDeleteMsg as any).sender?.id === currentUser?.id)));

  const confirmDeleteMessage = async (mode: 'me' | 'everyone') => {
    if (!deleteTargetMsgId) return;
    const msgId = deleteTargetMsgId;
    setDeleteTargetMsgId(null);
    try {
      if (poppedOutChatId) {
        await apiClient.delete(`/direct-conversations/${poppedOutChatId}/messages/${msgId}?mode=${mode}`);
      } else {
        await apiClient.delete(`/direct-messages/${msgId}?mode=${mode}`);
      }
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      console.error('Delete popout DM error:', err);
    }
  };

  const fetchMessages = async () => {
    if (!poppedOutChatId) return;
    try {
      const convsRes = await apiClient.get('/direct-conversations');
      const convList = convsRes.data.data || convsRes.data || [];
      const currentConv = convList.find((c: any) => c.id === poppedOutChatId);
      setConversation(currentConv || null);

      const msgRes = await apiClient.get(`/direct-conversations/${poppedOutChatId}/messages`);
      const msgData = msgRes.data.data || msgRes.data || [];
      setMessages(msgData);
      setTimeout(() => scrollToBottom('auto'), 50);
    } catch (err) {
      console.error('Fetch popout chat error:', err);
    }
  };

  useEffect(() => {
    if (poppedOutChatId) {
      fetchMessages();
      setIsMinimized(false);
    }
  }, [poppedOutChatId]);

  const handleWSEvent = useCallback(
    (event: any) => {
      if (!poppedOutChatId) return;
      if (event.type === 'direct_message.new' || event.type === 'message.new') {
        const targetConvId = event.conversation_id || event.message?.conversation_id;
        if (targetConvId === poppedOutChatId) {
          const newMsg = event.message || event;
          setMessages((prev) => {
            if (!newMsg.id || prev.some((m) => String(m.id) === String(newMsg.id))) {
              return prev.map((m) => String(m.id) === String(newMsg.id) ? { ...m, ...newMsg } : m);
            }
            return [...prev, newMsg];
          });
          setTimeout(scrollToBottom, 100);
        }
      } else if (event.type === 'reaction.toggle') {
        if (event.message && (event.conversation_id === poppedOutChatId || event.message.conversation_id === poppedOutChatId)) {
          const updatedMsg = event.message;
          setMessages((prev) => prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)));
        }
      }
    },
    [poppedOutChatId]
  );

  useWebSocket(undefined, handleWSEvent);

  // Helper to add files
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
      const files = Array.from(e.target.files);
      addFilesToAttachments(files);
      if (files.length === 1 && files[0].type.startsWith('image/')) {
        setAnnotationMedia(files[0]);
        setAnnotationInitialCaption(content);
        setIsAnnotationOpen(true);
      }
      e.target.value = '';
    }
  };

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      addFilesToAttachments(files);
      setAnnotationMedia(files[0]);
      setAnnotationInitialCaption(content);
      setIsAnnotationOpen(true);
      e.target.value = '';
    }
  };

  // Clipboard Paste Handler (Ctrl+V / Cmd+V)
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const filesToAttach: File[] = [];
    let firstImage: File | null = null;
    if (clipboardData.items) {
      Array.from(clipboardData.items).forEach((item) => {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            if (file.type.startsWith('image/') && !firstImage) {
              firstImage = file;
            } else {
              filesToAttach.push(file);
            }
          }
        }
      });
    }

    if (firstImage) {
      e.preventDefault();
      addFilesToAttachments([firstImage, ...filesToAttach]);
      setAnnotationMedia(firstImage);
      setAnnotationInitialCaption(content);
      setIsAnnotationOpen(true);
      return;
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

  const handleToggleReaction = async (msgId: string, emoji: string) => {
    try {
      setActiveReactionMsgId(null);
      const res = await apiClient.post(`/messages/${msgId}/reactions`, { emoji });
      const updatedMsg = res.data.data || res.data;
      setMessages((prev) => prev.map((m) => (m.id === msgId ? updatedMsg : m)));
    } catch (err) {
      console.error('Popout reaction error:', err);
    }
  };

  const handleCopyText = async (msg: any, cleanText?: string) => {
    const textToCopy = (cleanText !== undefined ? cleanText : msg.content) || '';
    if (!textToCopy) return;
    try {
      const success = await copyToClipboard(textToCopy);
      if (success) {
        setCopiedMsgId(msg.id);
        useNotificationStore.getState().addToast({
          title: 'Copied',
          body: 'Message copied to clipboard',
          type: 'info'
        });
        setTimeout(() => setCopiedMsgId(null), 2000);
      }
    } catch (err) {
      console.error('Copy text error:', err);
    }
  };

  // Draggable Header Handler for Pop-out Window
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    
    const initialX = windowPos ? windowPos.x : Math.max(20, window.innerWidth - 410);
    const initialY = windowPos ? windowPos.y : Math.max(20, window.innerHeight - 520);
    const dragOffset = { x: e.clientX - initialX, y: e.clientY - initialY };

    const handleMouseMove = (ev: MouseEvent) => {
      const newX = Math.max(10, Math.min(window.innerWidth - 390, ev.clientX - dragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 510, ev.clientY - dragOffset.y));
      setWindowPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Draggable Handler for Minimized Pill
  const handlePillMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;

    const initialX = pillPos ? pillPos.x : Math.max(20, window.innerWidth - 220);
    const initialY = pillPos ? pillPos.y : Math.max(20, window.innerHeight - 70);
    let isDragging = false;
    const startX = e.clientX;
    const startY = e.clientY;
    const dragOffset = { x: e.clientX - initialX, y: e.clientY - initialY };

    const handleMouseMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) {
        isDragging = true;
      }
      const newX = Math.max(10, Math.min(window.innerWidth - 200, ev.clientX - dragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 60, ev.clientY - dragOffset.y));
      setPillPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (!isDragging) {
        setIsMinimized(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if ((!trimmed && attachedFiles.length === 0) || !poppedOutChatId || isSending) return;

    try {
      setIsSending(true);

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
            console.error('Popout chat file upload error:', uploadErr);
          }
        } else if (att.url && !att.url.startsWith('blob:')) {
          uploadedAttachments.push({ name: att.name, size: att.size, type: att.type, url: att.url });
        }
      }

      let finalContent = trimmed;
      if (uploadedAttachments.length > 0) {
        const attText = uploadedAttachments.map(a => `[Attachment: ${a.name}](${getMediaUrl(a.url)})`).join('\n');
        finalContent = finalContent ? `${finalContent}\n\n${attText}` : attText;
      }

      // Optimistically clear composer input & attachments immediately
      setContent('');
      setAttachedFiles([]);
      setIsEmojiPickerOpen(false);

      const res = await apiClient.post(`/direct-conversations/${poppedOutChatId}/messages`, {
        content: finalContent,
        attachments: uploadedAttachments
      });

      const newMsg = res.data.data || res.data;
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
      console.error('Send popout DM error:', err);
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

  const handleSendAnnotatedMedia = async (result: MediaAnnotationResult) => {
    if (!poppedOutChatId) return;
    try {
      setIsSending(true);
      const formData = new FormData();
      formData.append('file', result.file);
      const uploadRes = await apiClient.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const fileData = uploadRes.data.data || uploadRes.data;
      const fileName = fileData.name || fileData.original_name || fileData.file_name || result.file.name;
      const fileUrl = fileData.file_url || fileData.url || fileData.download_url || result.previewUrl;

      const attachmentPayload = {
        file_id: fileData.id,
        name: fileName,
        size: fileData.size || result.file.size,
        type: fileData.mime_type || result.file.type,
        url: fileUrl
      };

      let finalContent = result.caption || content.trim();
      if (result.isViewOnce) {
        finalContent = `🔒 [View Once Media]\n${finalContent}`.trim();
      }
      const attText = `[Attachment: ${fileName}](${getMediaUrl(fileUrl)})`;
      finalContent = finalContent ? `${finalContent}\n\n${attText}` : attText;

      setContent('');
      setAttachedFiles([]);
      setIsEmojiPickerOpen(false);

      const res = await apiClient.post(`/direct-conversations/${poppedOutChatId}/messages`, {
        content: finalContent,
        attachments: [attachmentPayload]
      });

      const newMsg = res.data.data || res.data;
      if (!newMsg.attachments) {
        newMsg.attachments = [attachmentPayload];
      }

      setMessages((prev) => {
        if (prev.some((m) => String(m.id) === String(newMsg.id))) {
          return prev.map((m) => (String(m.id) === String(newMsg.id) ? { ...m, ...newMsg } : m));
        }
        return [...prev, newMsg];
      });
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      console.error('Send annotated popout DM error:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Used when annotating an EXISTING message image — replaces in place
  const handleUpdateAnnotatedMedia = (existingMsg: any) => async (result: MediaAnnotationResult) => {
    try {
      const formData = new FormData();
      formData.append('file', result.file);
      const uploadRes = await apiClient.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const fileData = uploadRes.data.data || uploadRes.data;
      const fileName = fileData.name || fileData.original_name || fileData.file_name || result.file.name;
      const fileUrl = fileData.file_url || fileData.url || fileData.download_url || result.previewUrl;

      const attachmentPayload = {
        file_id: fileData.id,
        name: fileName,
        size: fileData.size || result.file.size,
        type: fileData.mime_type || result.file.type,
        url: fileUrl
      };

      const baseContent = (existingMsg.content || '')
        .replace(/\[Attachment:\s*[^\]]+\]\([^)]+\)/gi, '')
        .replace(/📁\s*Attachment:\s*\[[^\]]+\]\([^)]+\)/gi, '')
        .trim();

      const captionPart = result.caption ? result.caption.trim() : '';
      const attText = `[Attachment: ${fileName}](${getMediaUrl(fileUrl)})`;
      const finalContent = captionPart
        ? `${captionPart}\n\n${attText}`
        : (baseContent ? `${baseContent}\n\n${attText}` : attText);

      const res = await apiClient.patch(`/messages/${existingMsg.id}`, {
        content: finalContent,
        attachments: [attachmentPayload]
      });

      const updatedMsg = res.data.data || res.data;
      setMessages((prev) =>
        prev.map((m) => String(m.id) === String(existingMsg.id) ? { ...m, ...updatedMsg } : m)
      );
    } catch (err) {
      console.error('Failed to update annotated media in popout DM:', err);
    }
  };

  if (!poppedOutChatId) return null;

  const otherMember = conversation?.members?.find((m: any) => String(m.id || m.user_id) !== String(currentUser?.id));
  const chatTitle = conversation?.title || otherMember?.display_name || 'Direct Message';
  const targetUserId = otherMember?.id || (otherMember as any)?.user_id;

  if (isMinimized) {
    return (
      <div
        onMouseDown={handlePillMouseDown}
        style={pillPos ? { left: `${pillPos.x}px`, top: `${pillPos.y}px`, bottom: 'auto', right: 'auto' } : undefined}
        className="fixed bottom-4 right-4 z-[9999] bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-2.5 rounded-full shadow-2xl border border-white/20 flex items-center gap-3 cursor-grab active:cursor-grabbing hover:scale-105 transition-transform animate-in fade-in select-none"
      >
        <div className="relative">
          <UserAvatar user={otherMember} avatarUrl={otherMember?.avatar_url} name={chatTitle} size="sm" showStatus={true} />
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-indigo-600" />
        </div>
        <span className="font-bold text-xs font-display">{chatTitle}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(false);
          }}
          className="p-1 hover:bg-white/20 rounded-full transition-colors"
          title="Expand Chat Window"
        >
          <Maximize2 className="w-3.5 h-3.5 text-white" />
        </button>
      </div>
    );
  }

  return (
    <div
      style={windowPos ? { left: `${windowPos.x}px`, top: `${windowPos.y}px`, bottom: 'auto', right: 'auto' } : undefined}
      data-chat-viewport="true"
      className="fixed bottom-4 right-4 z-[9999] w-96 h-[520px] bg-[#11131A] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden relative animate-in slide-in-from-bottom-5 duration-200 mc-glass"
    >
      {/* Draggable Header */}
      <div
        onMouseDown={handleHeaderMouseDown}
        className="h-12 bg-[#171923] border-b border-white/5 px-3 flex items-center justify-between shrink-0 select-none cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="w-4 h-4 text-mc-muted shrink-0" />
          <UserAvatar user={otherMember} avatarUrl={otherMember?.avatar_url} name={chatTitle} size="sm" showStatus={true} />
          <div className="min-w-0">
            <h4 className="font-bold text-xs text-white truncate font-display">{chatTitle}</h4>
            <p className="text-[10px] text-mc-muted truncate">Pop-out Chat</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (targetUserId) {
                initiateCall({ id: String(targetUserId), name: chatTitle, avatar: otherMember?.avatar_url }, 'video', poppedOutChatId);
              }
            }}
            className="p-1 text-emerald-400 hover:bg-white/5 rounded-lg transition-colors"
            title="Video Call"
          >
            <Video className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (targetUserId) {
                initiateCall({ id: String(targetUserId), name: chatTitle, avatar: otherMember?.avatar_url }, 'audio', poppedOutChatId);
              }
            }}
            className="p-1 text-indigo-400 hover:bg-white/5 rounded-lg transition-colors"
            title="Audio Call"
          >
            <Phone className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 text-mc-secondary hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            title="Minimize Window"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setPoppedOutChatId(null)}
            className="p-1 text-mc-secondary hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
            title="Close Pop-out Window"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 select-text">
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUser?.id || msg.sender?.id === currentUser?.id;

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

          const isMsgViewOnce = rawContent.includes('[View Once Media]') || !!(msg as any).is_view_once;
          const displayContent = rawContent.replace(/\[Attachment:\s*[^\]]+\]\([^)]+\)/gi, '').trim();
          const cleanDisplayContent = displayContent.replace(/🔒\s*\[View Once Media\]/gi, '').trim();

          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative`}>
              <div
                className={`max-w-[88%] p-2.5 rounded-2xl text-xs relative ${
                  isMe
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-br-none'
                    : 'bg-[#171923] border border-white/5 text-white rounded-bl-none'
                }`}
              >
                {/* Attached Files */}
                {effectiveAttachments.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-1.5">
                    {effectiveAttachments.map((att: any, idx: number) => (
                      <AttachmentCard
                        key={idx}
                        name={att.name}
                        url={att.url}
                        size={att.size}
                        type={att.type}
                        messageId={msg.id}
                        isViewOnce={isMsgViewOnce}
                        caption={cleanDisplayContent}
                        onAnnotateSend={handleUpdateAnnotatedMedia(msg)}
                      />
                    ))}
                  </div>
                )}

                {cleanDisplayContent.length > 0 && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{cleanDisplayContent}</p>
                )}

                {/* Reactions Pills */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(
                      msg.reactions.reduce((acc: any, r: any) => {
                        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                        return acc;
                      }, {})
                    ).map(([emoji, count]: any) => (
                      <button
                        key={emoji}
                        onClick={() => handleToggleReaction(msg.id, emoji)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-[#11131A] border border-white/10 rounded-full text-[10px]"
                      >
                        <span>{emoji}</span>
                        <span className="font-bold text-white">{count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Hover Quick Actions */}
                <div className={`opacity-0 group-hover:opacity-100 transition-opacity absolute -top-3 ${isMe ? 'left-2' : 'right-2'} bg-[#171923] border border-white/10 rounded-lg p-0.5 flex items-center gap-1 shadow-lg z-20`}>
                  <button
                    onClick={() => handleCopyText(msg, displayContent)}
                    className="p-1 text-mc-muted hover:text-white"
                    title="Copy Text"
                  >
                    {copiedMsgId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                    className="p-1 text-amber-400 hover:text-amber-300"
                    title="React"
                  >
                    <Smile className="w-3 h-3" />
                  </button>
                  {(isMe || isAdmin) && (
                    <button
                      onClick={() => setDeleteTargetMsgId(msg.id)}
                      className="p-1 text-rose-400 hover:text-rose-300"
                      title="Delete Message"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {activeReactionMsgId === msg.id && (
                  <div className="absolute top-6 right-0 bg-[#171923] border border-white/10 rounded-xl p-1 flex gap-1 shadow-xl z-30">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleToggleReaction(msg.id, emoji)}
                        className="p-1 hover:bg-white/10 rounded text-xs hover:scale-125 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <span className="text-[9px] text-mc-muted mt-0.5 px-1 font-medium">
                {formatISTTime(msg.created_at)}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Hidden File Input */}
      <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple className="hidden" />
      {/* Hidden Image Input for Annotation */}
      <input type="file" ref={imageInputRef} onChange={handleImageFileSelect} accept="image/*" className="hidden" />

      {/* Footer / Input */}
      <div className="p-2 border-t border-white/5 bg-[#171923] relative shrink-0">
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5 p-1.5 bg-[#11131A] rounded-lg">
            {attachedFiles.map((att) => {
              const isImg = att.type.startsWith('image/');
              return (
                <div key={att.id} className="flex items-center gap-1.5 bg-[#171923] border border-white/5 px-2 py-1 rounded text-[10px] text-white">
                  {isImg && (
                    <img src={att.url} alt={att.name} className="w-5 h-5 object-cover rounded" />
                  )}
                  <span className="truncate max-w-[90px]">{att.name}</span>
                  {isImg && (
                    <button
                      type="button"
                      onClick={() => {
                        setAnnotationMedia(att.file || att.url);
                        setAnnotationInitialCaption(content);
                        setIsAnnotationOpen(true);
                      }}
                      className="text-amber-400 hover:text-amber-300 ml-0.5"
                      title="Markup / Annotate"
                    >
                      <Edit2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => handleRemoveAttachment(att.id)} className="text-rose-400 hover:text-rose-300 ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {isEmojiPickerOpen && (
          <div className="absolute bottom-12 right-2 bg-[#171923] border border-white/10 rounded-xl p-1.5 shadow-xl grid grid-cols-4 gap-1 z-30">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setContent((prev) => prev + emoji);
                  setIsEmojiPickerOpen(false);
                }}
                className="p-1.5 hover:bg-white/10 rounded text-base hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="p-1 text-mc-muted hover:text-emerald-400 rounded transition-colors"
            title="Annotate & Send Photo (Draw, Text, Shapes, Blur, Stickers)"
          >
            <Image className="w-3.5 h-3.5 text-emerald-400" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1 text-mc-muted hover:text-white rounded transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
          </button>
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={handlePaste}
            placeholder="Message... (Paste image)"
            className="flex-1 bg-[#11131A] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500 min-w-0"
          />
          <button
            type="button"
            onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
            className="p-1 text-mc-muted hover:text-amber-400 rounded transition-colors"
            title="Insert emoji"
          >
            <Smile className="w-3.5 h-3.5 text-amber-400" />
          </button>
          <button
            type="submit"
            disabled={(!content.trim() && attachedFiles.length === 0) || isSending}
            className="p-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition-all shadow-md shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      <MediaAnnotationModal
        isOpen={isAnnotationOpen}
        imageSource={annotationMedia}
        initialCaption={annotationInitialCaption}
        onClose={() => {
          setIsAnnotationOpen(false);
          setAnnotationMedia(null);
        }}
        onSend={handleSendAnnotatedMedia}
      />

      <DeleteMessageModal
        isOpen={!!deleteTargetMsgId}
        onClose={() => setDeleteTargetMsgId(null)}
        onConfirm={confirmDeleteMessage}
        isAdmin={isAdmin}
        canDeleteForEveryone={canDeleteForEveryone}
        itemType="message"
      />
    </div>
  );
};
