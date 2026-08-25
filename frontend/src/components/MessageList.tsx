"use client";

import { useEffect, useRef } from "react";
import { format, isSameDay } from "date-fns";
import { SmilePlus, Trash2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { Message } from "@/lib/types";

/** Messages from the same author within this window render as one group. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function initials(name?: string) {
  if (!name) return "U";
  return name.slice(0, 2).toUpperCase();
}

function DateDivider({ date }: { date: Date }) {
  const safeDate = isNaN(date.getTime()) ? new Date() : date;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 20px 4px",
      }}
    >
      <div style={{ flex: 1, height: 1, background: "hsl(var(--border-subtle))" }} />
      <span style={{ fontSize: 11, color: "hsl(var(--text-muted))", fontWeight: 500 }}>
        {format(safeDate, "EEEE, MMMM d")}
      </span>
      <div style={{ flex: 1, height: 1, background: "hsl(var(--border-subtle))" }} />
    </div>
  );
}

const EMPTY_ARRAY: Message[] = [];

export default function MessageList() {
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const messages = useAppStore((s) =>
    activeChannelId ? (s.messagesByChannel[activeChannelId] ?? EMPTY_ARRAY) : EMPTY_ARRAY,
  );
  const usersById = useAppStore((s) => s.usersById);
  const currentUser = useAppStore((s) => s.user);
  const loading = useAppStore((s) => s.loadingMessages);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Stick to the newest message as the conversation grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeChannelId]);

  if (loading) {
    return (
      <div className="message-list">
        <p style={{ padding: 20, color: "hsl(var(--text-muted))", fontSize: 13 }}>
          Loading messages…
        </p>
      </div>
    );
  }

  if (messages.length === 0) {
    const userInitials = (currentUser?.display_name || currentUser?.username || "HC").slice(0, 2).toUpperCase();
    return (
      <div
        className="message-list"
        style={{ alignItems: "center", justifyContent: "center", height: "100%" }}
      >
        <div style={{ textAlign: "center", maxWidth: 440, padding: 20 }}>
          <div className="teams-hero-avatar">
            <span>{userInitials}</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", marginBottom: 10 }}>
            This is your space
          </h2>
          <p style={{ fontSize: 13.5, color: "#a1a1a1", lineHeight: 1.6 }}>
            This chat is just for you...with you. Use it for drafts, send files to yourself, or get to know chat features a little better.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((message: Message, i: number) => {
        const prev = i > 0 ? messages[i - 1] : null;
        const createdRaw = message?.created_at ? new Date(message.created_at) : new Date();
        const created = isNaN(createdRaw.getTime()) ? new Date() : createdRaw;

        const prevCreatedRaw = prev?.created_at ? new Date(prev.created_at) : null;
        const prevCreated = prevCreatedRaw && !isNaN(prevCreatedRaw.getTime()) ? prevCreatedRaw : null;

        const showDivider = !prevCreated || !isSameDay(created, prevCreated);
        const grouped =
          !showDivider &&
          prev !== null &&
          prev.author_id === message.author_id &&
          prevCreated !== null &&
          created.getTime() - prevCreated.getTime() < GROUP_WINDOW_MS;

        const author = usersById[message.author_id];
        const authorName = author?.display_name ?? "Unknown user";
        const isMine = message.author_id === currentUser?.id;

        return (
          <div key={message.id}>
            {showDivider && <DateDivider date={created} />}
            <div className="message-group">
              {grouped ? (
                <div style={{ width: 36, flexShrink: 0 }} />
              ) : (
                <div className="message-avatar">{initials(authorName)}</div>
              )}

              <div className="message-content-area">
                {!grouped && (
                  <div className="message-meta">
                    <span className="message-author">{authorName}</span>
                    <span className="message-time">{format(created, "h:mm a")}</span>
                    {message.is_edited && (
                      <span className="message-time">(edited)</span>
                    )}
                  </div>
                )}
                <div className="message-text">{message.content}</div>
              </div>

              <div className="message-actions">
                <button className="action-btn" aria-label="Add reaction" title="Add reaction">
                  <SmilePlus size={15} />
                </button>
                {isMine && (
                  <button className="action-btn" aria-label="Delete message" title="Delete message">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
