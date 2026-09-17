import React, { useState } from 'react';
import { Message } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { MessageSquare, Edit2, Trash2, Smile, Copy, Check, CheckCheck } from 'lucide-react';
import { apiClient, getMediaUrl } from '../../api/client';

import { UserAvatar } from '../common/UserAvatar';
import { DeleteMessageModal } from '../modals/DeleteMessageModal';
import { formatISTTime } from '../../utils/dateUtils';
import { AttachmentCard } from './AttachmentCard';
import { MediaAnnotationResult } from './MediaAnnotationModal';
import { copyToClipboard } from '../../utils/clipboard';
import { useNotificationStore } from '../../stores/notificationStore';

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isOwner = user?.id === message.sender_id;
  const isAdmin = user?.is_admin || user?.is_superuser || user?.role === 'ADMIN' || user?.role === 'ORG_ADMIN';
  const canEditOrDelete = isOwner || isAdmin;

  // Extract attachments from message payload or markdown tags
  const effectiveAttachments: any[] = [];
  const seenKeys = new Set<string>();

  const addAttachment = (name: string, rawUrl: string, type?: string, size?: number) => {
    if (!rawUrl) return;
    if (rawUrl.startsWith('blob:')) return;
    const formattedUrl = getMediaUrl(rawUrl);
    const key = formattedUrl.includes('/uploads/') ? formattedUrl.split('/uploads/')[1] : formattedUrl;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const ext = (name || '').split('.').pop()?.toLowerCase() || '';
    const isImgExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);

    effectiveAttachments.push({
      name: name || key,
      url: formattedUrl,
      type: type || (isImgExt ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'application/octet-stream'),
      size
    });
  };

  if ((message as any).attachments && Array.isArray((message as any).attachments)) {
    for (const att of (message as any).attachments) {
      if (att.url) {
        addAttachment(att.name, att.url, att.type, att.size);
      }
    }
  }

  let rawContent = message.content || '';
  const attRegex = /(?:\[Attachment:\s*([^\]]+)\]\(([^)]+)\)|📁\s*Attachment:\s*\[([^\]]+)\]\(([^)]+)\))/gi;
  let match;
  while ((match = attRegex.exec(rawContent)) !== null) {
    const name = match[1] || match[3];
    const url = match[2] || match[4];
    addAttachment(name, url);
  }

  const isViewOnce = rawContent.includes('[View Once Media]') || !!(message as any).is_view_once;
  const displayContent = rawContent
    .replace(/\[Attachment:\s*[^\]]+\]\([^)]+\)/gi, '')
    .replace(/📁\s*Attachment:\s*\[[^\]]+\]\([^)]+\)/gi, '')
    .trim();
  const cleanDisplayContent = displayContent.replace(/🔒\s*\[View Once Media\]/gi, '').trim();

  const handleAnnotateSend = async (result: MediaAnnotationResult) => {
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

      // Build updated content: strip old attachment markdown, keep caption
      let baseContent = (message.content || '')
        .replace(/\[Attachment:\s*[^\]]+\]\([^)]+\)/gi, '')
        .replace(/📁\s*Attachment:\s*\[[^\]]+\]\([^)]+\)/gi, '')
        .trim();

      const captionPart = result.caption ? result.caption.trim() : '';
      const attText = `[Attachment: ${fileName}](${getMediaUrl(fileUrl)})`;
      const finalContent = captionPart
        ? `${captionPart}\n\n${attText}`
        : (baseContent ? `${baseContent}\n\n${attText}` : attText);

      // PATCH the existing message — replace attachment in place
      await apiClient.patch(`/messages/${message.id}`, {
        content: finalContent,
        attachments: [attachmentPayload]
      });

      useNotificationStore.getState().addToast({
        title: 'Image Updated',
        body: 'Your edited image has been updated in place.',
        type: 'info'
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to update annotated image:', err);
      useNotificationStore.getState().addToast({
        title: 'Update Error',
        body: 'Failed to update annotated image.',
        type: 'info'
      });
    }
  };

  const handleCopyText = async () => {
    const textToCopy = cleanDisplayContent || displayContent || message.content || '';
    if (!textToCopy) return;
    try {
      const success = await copyToClipboard(textToCopy);
      if (success) {
        setIsCopied(true);
        useNotificationStore.getState().addToast({
          title: 'Copied',
          body: 'Message copied to clipboard',
          type: 'info'
        });
        setTimeout(() => setIsCopied(false), 2000);
      }
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

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async (mode: 'me' | 'everyone') => {
    try {
      await apiClient.delete(`/messages/${message.id}?mode=${mode}`);
      onRefresh();
    } catch (err) {
      console.error('Delete error:', err);
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
    <div className="group relative flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors rounded-xl select-text">
      {/* Sender Avatar */}
      <UserAvatar
        user={message.sender}
        avatarUrl={message.sender_avatar || message.sender?.avatar_url || (isOwner ? user?.avatar_url : undefined)}
        name={message.sender?.display_name || message.sender_name}
        size="sm"
        className="mt-0.5"
      />

      {/* Message Content Area */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-xs text-white font-display">{message.sender?.display_name || message.sender_name}</span>
          <span className="text-[10px] text-mc-muted">
            {formatISTTime(message.created_at)}
          </span>
          {isOwner && (
            <span
              title={
                localStorage.getItem('mc_read_receipts') !== 'false'
                  ? (message as any).is_read
                    ? 'Read'
                    : 'Delivered'
                  : 'Sent'
              }
            >
              <CheckCheck
                className={`w-3.5 h-3.5 ${
                  localStorage.getItem('mc_read_receipts') !== 'false' && (message as any).is_read
                    ? 'text-cyan-400'
                    : 'text-mc-muted'
                }`}
              />
            </span>
          )}
          {message.is_edited && <span className="text-[9px] text-mc-muted italic">(edited)</span>}
        </div>

        {isEditing ? (
          <div className="flex flex-col gap-2 bg-[#171923] p-3 rounded-2xl border border-indigo-500/50 mt-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-[#11131A] text-xs text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500 resize-none min-h-[60px]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1 text-xs text-mc-muted hover:text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-md shadow-indigo-600/30"
              >
                <Check className="w-3.5 h-3.5" /> Save
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {effectiveAttachments.length > 0 && (
              <div className="flex flex-col gap-2 my-1.5">
                {effectiveAttachments.map((att: any, idx: number) => (
                  <AttachmentCard
                    key={idx}
                    name={att.name}
                    url={att.url}
                    size={att.size}
                    type={att.type}
                    messageId={message.id}
                    isViewOnce={isViewOnce}
                    caption={cleanDisplayContent}
                    onAnnotateSend={handleAnnotateSend}
                  />
                ))}
              </div>
            )}
            {cleanDisplayContent.length > 0 && (
              <p className="text-xs text-mc-text leading-relaxed whitespace-pre-wrap select-text">{cleanDisplayContent}</p>
            )}
          </div>
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
                className="flex items-center gap-1 px-2.5 py-0.5 bg-[#171923] border border-white/10 hover:border-indigo-500 rounded-full text-xs transition-colors shadow-sm"
              >
                <span>{emoji}</span>
                <span className="text-[10px] text-mc-muted font-bold">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread Replies Button */}
        <div className="mt-1.5 flex items-center gap-3">
          <button
            onClick={() => onOpenThread(message)}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-400 hover:underline"
          >
            <MessageSquare className="w-3 h-3" />
            <span>{message.replies_count ? `${message.replies_count} replies` : 'Reply in thread'}</span>
          </button>
        </div>
      </div>

      {/* Floating Action Menu Bar */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-2 bg-[#171923] border border-white/10 rounded-xl shadow-xl flex items-center p-1 gap-1 z-10 mc-glass">
        <button
          onClick={handleCopyText}
          className="p-1.5 text-mc-muted hover:text-white rounded-lg hover:bg-white/5 flex items-center gap-1 text-[10px]"
          title="Copy message text"
        >
          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 text-mc-muted hover:text-white rounded-lg hover:bg-white/5"
            title="Add reaction"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
          {showEmojiPicker && (
            <div className="absolute right-0 top-8 bg-[#171923] border border-white/10 rounded-xl shadow-2xl p-1.5 flex gap-1 z-20 mc-glass">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleToggleReaction(emoji)}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-sm transition-transform hover:scale-125"
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
              onClick={() => {
                setEditContent(message.content);
                setIsEditing(true);
              }}
              className="p-1.5 text-mc-muted hover:text-white rounded-lg hover:bg-white/5"
              title="Edit message"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg"
              title="Delete message"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      <DeleteMessageModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        isAdmin={!!isAdmin}
        canDeleteForEveryone={isOwner || !!isAdmin}
        itemType="message"
      />
    </div>
  );
};
