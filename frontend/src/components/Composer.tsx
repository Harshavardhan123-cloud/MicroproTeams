"use client";

import { useRef, useState, useCallback } from "react";
import { Paperclip, Send, Smile, Bold, Italic, Link2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

const COMMON_EMOJIS = ["👍", "❤️", "😊", "🔥", "🚀", "🎉", "👏", "✅", "🙌", "💡", "😃", "⭐", "😂", "🤔", "😎", "🙏"];

export default function Composer() {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFormatBar, setShowFormatBar] = useState(false);

  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const channels = useAppStore((s) => s.channels);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const userId = useAppStore((s) => s.user?.id);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const channel = channels.find((c) => c.id === activeChannelId);

  // Auto-resize textarea as content grows
  const handleResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, []);

  // Emit typing events to socket
  const emitTypingStart = useCallback(() => {
    if (!activeChannelId || !userId) return;
    const socket = getSocket();
    if (!socket) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit("typing:start", { channel_id: activeChannelId });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit("typing:stop", { channel_id: activeChannelId });
    }, 2500);
  }, [activeChannelId, userId]);

  const emitTypingStop = useCallback(() => {
    if (!activeChannelId) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      const socket = getSocket();
      socket?.emit("typing:stop", { channel_id: activeChannelId });
    }
  }, [activeChannelId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    handleResize();
    if (e.target.value.trim()) {
      emitTypingStart();
    } else {
      emitTypingStop();
    }
  };

  const handleSend = async () => {
    if (!value.trim() || sending) return;
    setSending(true);
    emitTypingStop();
    await sendMessage(value.trim());
    setValue("");
    setSending(false);
    setShowEmojiPicker(false);
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setValue((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
    setTimeout(handleResize, 0);
  };

  const insertFormat = (prefix: string, suffix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const newVal = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    setValue(newVal);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSending(true);
      const res = await api.files.upload(file);
      const fileUrl = res.url || file.name;
      await sendMessage(`📎 [${file.name}](${fileUrl})`);
    } catch {
      await sendMessage(`📎 File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    } finally {
      setSending(false);
      e.target.value = "";
    }
  };

  if (!activeChannelId) return null;

  return (
    <div className="composer-wrapper">
      <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileUpload} />

      <div className="composer">
        {/* Emoji Picker Popover */}
        {showEmojiPicker && (
          <div className="emoji-picker-popover">
            <div className="emoji-grid" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
              {COMMON_EMOJIS.map((emoji) => (
                <button key={emoji} className="emoji-btn" onClick={() => handleEmojiSelect(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Format bar (optional, shown when toolbar btn clicked) */}
        {showFormatBar && (
          <div style={{ display: "flex", gap: 4, padding: "4px 0", borderBottom: "1px solid #3d3d3d", marginBottom: 6 }}>
            <button className="teams-tool-btn" title="Bold (Ctrl+B)" onClick={() => insertFormat("**", "**")}>
              <Bold size={14} />
            </button>
            <button className="teams-tool-btn" title="Italic (Ctrl+I)" onClick={() => insertFormat("_", "_")}>
              <Italic size={14} />
            </button>
            <button className="teams-tool-btn" title="Link" onClick={() => insertFormat("[", "](url)")}>
              <Link2 size={14} />
            </button>
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="composer-input"
          placeholder={`Message ${channel ? `#${channel.name}` : "..."}`}
          value={value}
          rows={1}
          style={{ minHeight: 36, maxHeight: 180, overflowY: "auto" }}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label="Message input"
        />

        {/* Footer toolbar */}
        <div className="composer-footer">
          <div className="teams-composer-tools">
            <button className="teams-tool-btn" aria-label="Add emoji" title="Emoji" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
              <Smile size={17} />
            </button>
            <button className="teams-tool-btn" aria-label="Attach file" title="Attach file" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={17} />
            </button>
            <button
              className={`teams-tool-btn ${showFormatBar ? "active-tool" : ""}`}
              aria-label="Format"
              title="Format text"
              onClick={() => setShowFormatBar(!showFormatBar)}
            >
              <Bold size={17} />
            </button>
          </div>

          <button
            className="teams-send-btn"
            onClick={handleSend}
            disabled={!value.trim() || sending}
            aria-label="Send message"
            title="Send (Enter)"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
