import React, { useState, useRef } from 'react';
import { Send, Paperclip, Smile, Bold, Italic, Code, Image as ImageIcon } from 'lucide-react';
import { apiClient } from '../../api/client';
import { wsService } from '../../services/websocketService';

interface MessageComposerProps {
  channelId?: string;
  parentMessageId?: string;
  placeholder?: string;
  onSendSuccess?: () => void;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if (!content.trim() || (!channelId && !parentMessageId)) return;
    try {
      if (channelId) {
        await apiClient.post(`/channels/${channelId}/messages`, {
          content,
          parent_message_id: parentMessageId
        });
      }
      setContent('');
      if (onSendSuccess) onSendSuccess();
    } catch (err) {
      console.error('Send error:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      // Trigger typing indicator over WebSocket
      wsService.send({ type: 'typing', is_typing: true });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const fileData = res.data.data || res.data;
      const fileLink = `\n📁 Attachment: [${fileData.file_name}](${fileData.file_url})`;
      setContent((prev) => prev + fileLink);
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-[#1F1F1F] border border-teams-border rounded-xl p-3 shadow-lg relative">
      {/* Formatting Bar */}
      <div className="flex items-center gap-1 mb-2 pb-2 border-b border-teams-border/40 text-teams-muted">
        <button
          onClick={() => setContent((prev) => prev + '**bold**')}
          className="p-1 hover:text-white rounded hover:bg-teams-hover"
          title="Bold"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setContent((prev) => prev + '*italic*')}
          className="p-1 hover:text-white rounded hover:bg-teams-hover"
          title="Italic"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setContent((prev) => prev + '`code`')}
          className="p-1 hover:text-white rounded hover:bg-teams-hover"
          title="Inline Code"
        >
          <Code className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-3 bg-teams-border mx-1" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1 hover:text-white rounded hover:bg-teams-hover flex items-center gap-1 text-xs"
          title="Attach File"
        >
          <Paperclip className="w-3.5 h-3.5" />
          {isUploading && <span className="text-[10px] animate-pulse">Uploading...</span>}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Input Text Area */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        className="w-full bg-transparent text-xs text-teams-text placeholder-teams-muted focus:outline-none resize-none"
      />

      {/* Bottom Actions Row */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-teams-border/40">
        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 text-teams-muted hover:text-white rounded hover:bg-teams-hover"
            title="Emoji Picker"
          >
            <Smile className="w-4 h-4" />
          </button>

          {showEmojiPicker && (
            <div className="absolute left-0 bottom-8 bg-[#252525] border border-teams-border rounded-lg shadow-xl p-2 flex gap-1 z-30">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    setContent((prev) => prev + emoji);
                    setShowEmojiPicker(false);
                  }}
                  className="p-1 hover:bg-teams-hover rounded text-sm transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={!content.trim()}
          className="px-3 py-1.5 bg-teams-purple hover:bg-teams-purple-hover text-white font-semibold text-xs rounded-lg shadow disabled:opacity-40 transition-all flex items-center gap-1.5"
        >
          <span>Send</span>
          <Send className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
