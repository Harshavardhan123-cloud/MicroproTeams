"use client";

import { useAppStore } from "@/store/useAppStore";

const EMPTY_ARRAY: string[] = [];

export default function TypingIndicator() {
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const typing = useAppStore((s) =>
    activeChannelId ? (s.typingByChannel[activeChannelId] ?? EMPTY_ARRAY) : EMPTY_ARRAY,
  );
  const usersById = useAppStore((s) => s.usersById);
  const currentUserId = useAppStore((s) => s.user?.id);

  const others = typing.filter((id) => id !== currentUserId);

  // Reserve the row height at all times so the composer never jumps
  if (others.length === 0) return <div className="typing-indicator" />;

  const names = others.map((id) => usersById[id]?.display_name ?? "Someone");
  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names.length} people are typing`;

  return (
    <div className="typing-indicator" aria-live="polite">
      <span className="typing-dots">
        <span />
        <span />
        <span />
      </span>
      {label}
    </div>
  );
}
