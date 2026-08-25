"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Search, X, Check, Users, Lock, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";
import type { User } from "@/lib/types";

interface NewChatModalProps {
  onClose: () => void;
}

export default function NewChatModal({ onClose }: NewChatModalProps) {
  const [channelName, setChannelName] = useState("");
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

  // Load initial user list on open & focus
  useEffect(() => {
    async function loadInitialUsers() {
      setSearching(true);
      try {
        const users = await api.users.search("");
        setResults(users);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }
    loadInitialUsers();
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

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (selectedUsers.length === 0 || busy) return;
    setBusy(true);
    try {
      const memberIds = selectedUsers.map((u) => u.id);
      await createDMChat(memberIds, channelName.trim() || undefined);
      onClose();
    } catch {
      setBusy(false);
    }
  };

  // Determine chat type label
  const getChatTypeLabel = () => {
    if (selectedUsers.length === 0) return "Select members to include";
    if (selectedUsers.length === 1 && selectedUsers[0].id === currentUser?.id) {
      return "Personal chat (only visible to you)";
    }
    if (selectedUsers.length === 1) {
      return `Direct message with ${selectedUsers[0].display_name} (private)`;
    }
    return `Group chat / private channel (${selectedUsers.length + 1} members)`;
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
      aria-label="Create Chat or Channel"
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 500, width: "100%", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "hsl(var(--color-primary) / 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "hsl(var(--color-primary))",
              }}
            >
              <Users size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Create a Channel / Chat</h2>
              <span style={{ fontSize: 12, color: "hsl(var(--text-muted))" }}>
                Select member(s) to create a private chat visible only to them
              </span>
            </div>
          </div>
          <button
            className="action-btn"
            onClick={onClose}
            aria-label="Close"
            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 14 }}>
          {/* Optional Channel / Chat Name */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="chat-name-input" style={{ fontSize: 12, fontWeight: 600 }}>
              Chat / Channel Name (Optional)
            </label>
            <input
              id="chat-name-input"
              className="input"
              value={channelName}
              placeholder="e.g. project-alpha, team-sync (defaults to member names)"
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          {/* Member Search & Selection Header */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>
                Select Members <span style={{ color: "hsl(var(--color-danger))" }}>*</span>
              </label>
              <span style={{ fontSize: 11, color: "hsl(var(--text-muted))" }}>
                {selectedUsers.length} selected
              </span>
            </div>

            {/* Search Input */}
            <div style={{ position: "relative" }}>
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
                placeholder="Search member by name, username, or email…"
                style={{ paddingLeft: 36 }}
              />
            </div>
          </div>

          {/* Selected Member Chips */}
          {selectedUsers.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                maxHeight: 70,
                overflowY: "auto",
                padding: "2px 0",
              }}
            >
              {selectedUsers.map((user) => (
                <span
                  key={user.id}
                  className="chip active"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 16,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                  onClick={() => toggleUser(user)}
                >
                  {user.display_name} {user.id === currentUser?.id ? "(You)" : ""}
                  <X size={12} />
                </span>
              ))}
            </div>
          )}

          {/* Privacy Notice Banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 6,
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              fontSize: 12,
              color: "#a5b4fc",
            }}
          >
            <Lock size={13} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, lineHeight: 1.3 }}>{getChatTypeLabel()}</span>
          </div>

          {/* User List Scroll Area */}
          <div
            style={{
              flex: 1,
              maxHeight: 220,
              minHeight: 120,
              overflowY: "auto",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              padding: 4,
              background: "rgba(0, 0, 0, 0.15)",
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
                Loading members…
              </div>
            )}

            {!searching && filteredResults.length === 0 && query.length > 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "24px 0",
                  color: "hsl(var(--text-muted))",
                  fontSize: 13,
                }}
              >
                No members found for &ldquo;{query}&rdquo;
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
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 6,
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
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: isSelf
                        ? "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-primary) / 0.7))"
                        : "linear-gradient(135deg, hsl(280 60% 55%), hsl(200 80% 55%))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {initials}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                      {user.display_name}
                      {isSelf && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "hsl(var(--color-primary))",
                            fontWeight: 600,
                            marginLeft: 6,
                          }}
                        >
                          (You)
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "hsl(var(--text-muted))",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {user.email}
                    </div>
                  </div>

                  {/* Checkbox button */}
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
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
                    {isSelected(user.id) && <Check size={13} color="#fff" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={selectedUsers.length === 0 || busy}
            >
              {busy
                ? "Creating…"
                : selectedUsers.length > 1
                  ? "Create Group Chat"
                  : selectedUsers.length === 1 && selectedUsers[0].id === currentUser?.id
                    ? "Create Personal Chat"
                    : "Create Chat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
