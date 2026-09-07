import React, { useState, useRef } from 'react';
import { Send, Paperclip, Smile, Bold, Italic, Code, X, FileText, FileSpreadsheet, Archive, Presentation, Image as ImageIcon } from 'lucide-react';
import { apiClient, getMediaUrl } from '../../api/client';
import { wsService } from '../../services/websocketService';
import { getFileTypeInfo, formatFileSize } from './AttachmentCard';

interface MessageComposerProps {
  channelId?: string;
  parentMessageId?: string;
  placeholder?: string;
  onSendSuccess?: () => void;
}

interface ChatAttachment {
  id: string;
  file?: File;
  name: string;
  size: number;
  type: string;
  url: string;
}

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '🎉', '🚀', '💡', '✅', '🙌'];

export const MessageComposer: React.FC<MessageComposerProps> = ({
  channelId,
  parentMessageId,
  placeholder = "Type a message...",
  onSendSuccess
}) => {
  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<ChatAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const filesToAttach: File[] = [];
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

  const handleSend = async () => {
    const trimmed = content.trim();
    if ((!trimmed && attachedFiles.length === 0) || (!channelId && !parentMessageId)) return;

    try {
      setIsUploading(true);

      const uploadedAttachments: { file_id?: string; name: string; url: string; size: number; type: string }[] = [];

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
            const fileUrl = fileData.file_url || fileData.url || fileData.download_url || att.url;
            uploadedAttachments.push({
              file_id: fileData.id,
              name: fileName,
              url: fileUrl,
              size: fileData.size || att.size,
              type: fileData.mime_type || att.type
            });
          } catch (uploadErr) {
            console.error('Attachment upload failed:', uploadErr);
          }
        } else if (att.url && !att.url.startsWith('blob:')) {
          uploadedAttachments.push({
            name: att.name,
            url: att.url,
            size: att.size,
            type: att.type
          });
        }
      }

      let finalContent = trimmed;
      if (uploadedAttachments.length > 0) {
        const attText = uploadedAttachments.map((a) => `[Attachment: ${a.name}](${getMediaUrl(a.url)})`).join('\n');
        finalContent = finalContent ? `${finalContent}\n\n${attText}` : attText;
      }

      // Optimistically clear input & attachments immediately
      setContent('');
      setAttachedFiles([]);
      setShowEmojiPicker(false);
      if (onSendSuccess) onSendSuccess();

      if (channelId) {
        await apiClient.post(`/channels/${channelId}/messages`, {
          content: finalContent,
          parent_message_id: parentMessageId,
          attachments: uploadedAttachments
        });
      }
    } catch (err) {
      console.error('Send error:', err);
      setContent(trimmed);
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    if (e.key === 'Escape') {
      setShowEmojiPicker(false);
      (e.target as HTMLTextAreaElement).blur();
      return;
    }

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

    if (e.key !== 'Enter') {
      wsService.send({ type: 'typing', is_typing: true });
    }
  };

  return (
    <div className="bg-[#171923] border border-white/10 rounded-2xl p-3.5 shadow-xl relative transition-all focus-within:border-indigo-500/50">
      {/* Formatting Bar */}
      <div className="flex items-center gap-1 mb-2 pb-2 border-b border-white/5 text-mc-muted">
        <button
          type="button"
          onClick={() => setContent((prev) => prev + '**bold**')}
          className="p-1.5 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          title="Bold"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setContent((prev) => prev + '*italic*')}
          className="p-1.5 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          title="Italic"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setContent((prev) => prev + '`code`')}
          className="p-1.5 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          title="Inline Code"
        >
          <Code className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-3 bg-white/10 mx-1" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 hover:text-white rounded-lg hover:bg-white/5 flex items-center gap-1 text-xs transition-colors"
          title="Attach Document or Image"
        >
          <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-[11px]">Attach File</span>
          {isUploading && <span className="text-[10px] text-indigo-400 animate-pulse ml-1">Uploading...</span>}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          className="hidden"
          accept="*"
        />
      </div>

      {/* Attachment Preview Pills */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 p-2 bg-[#11131A] rounded-xl border border-white/5">
          {attachedFiles.map((att) => {
            const info = getFileTypeInfo(att.name, att.type);
            const IconComp = info.icon;
            const isImg = att.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.name);

            return (
              <div
                key={att.id}
                className="flex items-center gap-2 px-2.5 py-1 bg-[#171923] border border-white/10 rounded-lg text-xs text-white shadow-sm"
              >
                {isImg ? (
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <IconComp className={`w-3.5 h-3.5 ${info.iconColor} shrink-0`} />
                )}
                <span className="truncate max-w-[140px] font-medium">{att.name}</span>
                {att.size > 0 && <span className="text-[10px] text-mc-muted">({formatFileSize(att.size)})</span>}
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(att.id)}
                  className="p-0.5 text-rose-400 hover:bg-rose-500/20 rounded transition-colors ml-0.5"
                  title="Remove Attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Input Text Area */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        rows={2}
        className="w-full bg-transparent text-xs text-white placeholder-mc-muted focus:outline-none resize-none select-text leading-relaxed"
      />

      {/* Bottom Actions Row */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 text-mc-muted hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            title="Emoji Picker"
          >
            <Smile className="w-4 h-4 text-amber-400" />
          </button>

          {showEmojiPicker && (
            <div className="absolute left-0 bottom-9 bg-[#171923] border border-white/10 rounded-xl shadow-2xl p-2 flex gap-1 z-30 mc-glass">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setContent((prev) => prev + emoji);
                    setShowEmojiPicker(false);
                  }}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-sm transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-mc-muted hidden sm:inline">
            Press <strong className="text-mc-secondary">Enter</strong> to send
          </span>
          <button
            type="button"
            onClick={handleSend}
            disabled={(!content.trim() && attachedFiles.length === 0) || isUploading}
            className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/30 disabled:opacity-40 transition-all flex items-center gap-1.5 active:scale-95"
            title="Send Message"
          >
            <span>Send</span>
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

