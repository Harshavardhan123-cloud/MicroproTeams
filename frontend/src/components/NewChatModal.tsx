"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Search, X, Check, User as UserIcon, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";
import type { User } from "@/lib/types";

interface NewChatModalProps {
  onClose: () => void;
}

export default function NewChatModal({ onClose }: NewChatModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUser = useAppStore((s) => s.user);
  const createDMChat = useAppStore((s) => s.createDMChat);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-focus search input
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Debounced user search
  const searchUsers = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const users = await api.users.search(q);
          setResults(users);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      }, 250);
    },
    [],
  );

  useEffect(() => {
    searchUsers(query);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchUsers]);

  const toggleUser = (user: User) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((u) => u.id === user.id);
      if (exists) return prev.filter((u) => u.id !== user.id);
      return [...prev, user];
    });
  };

  const isSelected = (userId: string) => selectedUsers.some((u) => u.id === userId);

  const handleStartChat = async () => {
    if (selectedUsers.length === 0 || busy) return;
    setBusy(true);
    try {
      const memberIds = selectedUsers.map((u) => u.id);
      await createDMChat(memberIds);
      onClose();
    } catch {
      setBusy(false);
    }
  };

  // Determine chat type label
  const getChatTypeLabel = () => {
    if (selectedUsers.length === 0) return "Select members";
    if (selectedUsers.length === 1 && selectedUsers[0].id === currentUser?.id) {
      return "Personal chat (just you)";
    }
    if (selectedUsers.length === 1) return "Direct message";
    return `Group chat (${selectedUsers.length + 1} members)`;  // +1 for current user
  };

  // Filtered results: show all users (including current user for self-chat)
  const filteredResults = results.filter(
    (u) => !selectedUsers.some((s) => s.id === u.id),
  );

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New chat"
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, width: "100%" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>New Chat</h2>
          <button
            className="action-btn"
            onClick={onClose}
            aria-label="Close"
            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Input */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "hsl(var(--text-muted))",
              pointerEvents: "none",
            }}
          />
          <input
            ref={searchRef}
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or username…"
            style={{ paddingLeft: 36 }}
          />
        </div>

        {/* Selected Users Tags */}
        {selectedUsers.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 12,
              padding: "8px 0",
            }}
          >
            {selectedUsers.map((user) => (
              <span
                key={user.id}
                className="chip active"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  paddingRight: 6,
                  cursor: "pointer",
                }}
                onClick={() => toggleUser(user)}
              >
                {user.display_name}
                <X size={12} />
              </span>
            ))}
          </div>
        )}

        {/* Chat type indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "hsl(var(--text-muted))",
            marginBottom: 8,
            padding: "4px 0",
          }}
        >
          {selectedUsers.length > 1 ? <Users size={14} /> : <UserIcon size={14} />}
          <span>{getChatTypeLabel()}</span>
        </div>

        {/* User List */}
        <div
          style={{
            maxHeight: 280,
            overflowY: "auto",
            margin: "0 -20px",
            padding: "0 20px",
          }}
        >
          {searching && results.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "24px 0",
                color: "hsl(var(--text-muted))",
                fontSize: 13,
              }}
            >
              Searching…
            </div>
          )}

          {!searching && results.length === 0 && query.length > 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "24px 0",
                color: "hsl(var(--text-muted))",
                fontSize: 13,
              }}
            >
              No users found for &ldquo;{query}&rdquo;
            </div>
          )}

          {filteredResults.map((user) => {
            const isSelf = user.id === currentUser?.id;
            const initials = (user.display_name || "??").slice(0, 2).toUpperCase();

            return (
              <div
                key={user.id}
                onClick={() => toggleUser(user)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 8px",
                  borderRadius: 8,
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                className="new-chat-user-row"
                role="option"
                aria-selected={isSelected(user.id)}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: isSelf
                      ? "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-primary) / 0.7))"
                      : "linear-gradient(135deg, hsl(280 60% 55%), hsl(200 80% 55%))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                    {user.display_name}
                    {isSelf && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "hsl(var(--text-muted))",
                          fontWeight: 400,
                          marginLeft: 6,
                        }}
                      >
                        (You)
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "hsl(var(--text-muted))",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user.email}
                  </div>
                </div>

                {/* Selection indicator */}
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: isSelected(user.id)
                      ? "2px solid hsl(var(--color-primary))"
                      : "2px solid hsl(var(--border))",
                    background: isSelected(user.id) ? "hsl(var(--color-primary))" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s",
                    flexShrink: 0,
                  }}
                >
                  {isSelected(user.id) && <Check size={14} color="#fff" />}
                </div>
              </div>
            );
          })}

          {/* Show selected users that were filtered out */}
          {selectedUsers.length > 0 && filteredResults.length > 0 && (
            <div style={{ height: 1, background: "hsl(var(--border))", margin: "8px 0" }} />
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={selectedUsers.length === 0 || busy}
            onClick={handleStartChat}
          >
            {busy
              ? "Creating…"
              : selectedUsers.length > 1
                ? "Start Group Chat"
                : "Start Chat"}
          </button>
        </div>
      </div>
    </div>
  );
}
