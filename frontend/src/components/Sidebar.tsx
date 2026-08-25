"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Video,
  ChevronDown,
  ChevronRight,
  Hash,
  Lock,
  Users,
  Bookmark,
  CheckCheck,
  Circle,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import type { Channel, User } from "@/lib/types";

interface SidebarProps {
  onCreateChannel?: () => void;
}

export default function Sidebar({ onCreateChannel }: SidebarProps) {
  const router = useRouter();
  const channels = useAppStore((s) => s.channels);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const selectChannel = useAppStore((s) => s.selectChannel);
  const selectSelfChat = useAppStore((s) => s.selectSelfChat);
  const startChatWithUser = useAppStore((s) => s.startChatWithUser);
  const user = useAppStore((s) => s.user);
  const usersById = useAppStore((s) => s.usersById);
  const workspaceUsers = useAppStore((s) => s.workspaceUsers);
  const messagesByChannel = useAppStore((s) => s.messagesByChannel);
  const presenceMap = useAppStore((s) => s.presence);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "members" | "groups">("all");
  const [groupsOpen, setGroupsOpen] = useState(true);

  const userName = user?.display_name || user?.username || "You";
  const userInitials = userName.slice(0, 2).toUpperCase();
  const myPresence = user?.presence_status || "online";

  // Identify self channel
  const selfChannel = channels.find(
    (c) =>
      c.name === "personal-space" ||
      c.name === "notes-to-self" ||
      (c.type === "dm" && c.member_ids?.length === 1 && c.member_ids[0] === user?.id)
  );
  const isSelfSelected = activeChannelId && selfChannel && activeChannelId === selfChannel.id;

  // Filter other workspace members (excluding logged in user for main list)
  const otherUsers = useMemo(() => {
    return workspaceUsers.filter((u) => u.id !== user?.id);
  }, [workspaceUsers, user?.id]);

  // Map each member to their 1:1 DM channel (if one exists)
  const memberChannelMap = useMemo(() => {
    const map = new Map<string, Channel>();
    if (!user) return map;
    channels.forEach((c) => {
      if (c.type === "dm" && c.member_ids && c.member_ids.length === 2) {
        const otherId = c.member_ids.find((id) => id !== user.id);
        if (otherId) {
          map.set(otherId, c);
        }
      }
    });
    return map;
  }, [channels, user]);

  // Group DM and public/private channels
  const groupChannels = useMemo(() => {
    return channels.filter((c) => c.type === "group_dm" || c.type === "public" || c.type === "private");
  }, [channels]);

  // Filtered members by search
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return otherUsers;
    const q = searchQuery.toLowerCase();
    return otherUsers.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.username && u.username.toLowerCase().includes(q))
    );
  }, [otherUsers, searchQuery]);

  // Filtered group channels by search
  const filteredGroupChannels = useMemo(() => {
    if (!searchQuery.trim()) return groupChannels;
    const q = searchQuery.toLowerCase();
    return groupChannels.filter((c) => c.name.toLowerCase().includes(q));
  }, [groupChannels, searchQuery]);

  /** Helper to get last message snippet for a channel */
  const getLastMessageSnippet = (channelId?: string) => {
    if (!channelId) return null;
    const msgs = messagesByChannel[channelId];
    if (!msgs || msgs.length === 0) return null;
    const lastMsg = msgs[msgs.length - 1];
    return lastMsg.content;
  };

  /** Helper to format time */
  const getLastMessageTime = (channelId?: string) => {
    if (!channelId) return null;
    const msgs = messagesByChannel[channelId];
    if (!msgs || msgs.length === 0) return null;
    const lastMsg = msgs[msgs.length - 1];
    const d = new Date(lastMsg.created_at);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <aside
      className="teams-sidebar"
      style={{
        width: 320,
        backgroundColor: "#111b21",
        borderRight: "1px solid #222e35",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        userSelect: "none",
      }}
    >
      {/* ── WhatsApp-Style Sidebar Header ────────────────────────── */}
      <div
        style={{
          height: 60,
          backgroundColor: "#202c33",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #222e35",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #00a884, #008069)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {userInitials}
            </div>
            <span
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: myPresence === "online" ? "#25d366" : "#8696a0",
                border: "2px solid #202c33",
              }}
            />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e9edef", margin: 0 }}>Chats</h2>
            <span style={{ fontSize: 11, color: "#8696a0" }}>{userName}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            className="sidebar-action-btn"
            title="Start video meeting"
            onClick={() => router.push(`/meeting/${Date.now()}`)}
            style={{ color: "#aebac1" }}
          >
            <Video size={18} />
          </button>
        </div>
      </div>

      {/* ── Search Bar (WhatsApp Web style) ──────────────────────── */}
      <div style={{ padding: "8px 12px", backgroundColor: "#111b21", borderBottom: "1px solid #222e35" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "#202c33",
            borderRadius: 8,
            padding: "6px 12px",
            gap: 10,
          }}
        >
          <Search size={15} color="#8696a0" />
          <input
            type="text"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#d1d7db",
              fontSize: 13,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{ background: "transparent", border: "none", color: "#8696a0", cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter Tabs / Pills ──────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 12px 6px",
          backgroundColor: "#111b21",
          overflowX: "auto",
        }}
      >
        <button
          onClick={() => setActiveTab("all")}
          style={{
            padding: "4px 12px",
            borderRadius: 16,
            fontSize: 12,
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            backgroundColor: activeTab === "all" ? "#00a884" : "#202c33",
            color: activeTab === "all" ? "#111b21" : "#8696a0",
            transition: "all 0.15s",
          }}
        >
          All
        </button>
        <button
          onClick={() => setActiveTab("members")}
          style={{
            padding: "4px 12px",
            borderRadius: 16,
            fontSize: 12,
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            backgroundColor: activeTab === "members" ? "#00a884" : "#202c33",
            color: activeTab === "members" ? "#111b21" : "#8696a0",
            transition: "all 0.15s",
          }}
        >
          Direct ({otherUsers.length})
        </button>
        {groupChannels.length > 0 && (
          <button
            onClick={() => setActiveTab("groups")}
            style={{
              padding: "4px 12px",
              borderRadius: 16,
              fontSize: 12,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              backgroundColor: activeTab === "groups" ? "#00a884" : "#202c33",
              color: activeTab === "groups" ? "#111b21" : "#8696a0",
              transition: "all 0.15s",
            }}
          >
            Groups ({groupChannels.length})
          </button>
        )}
      </div>

      {/* ── Chat & Member List Container ─────────────────────────── */}
      <div
        className="teams-chat-list"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 0,
          backgroundColor: "#111b21",
        }}
      >
        {/* 1. Personal Space (Message Yourself) ────────────────── */}
        {(activeTab === "all" || activeTab === "members") && (
          <div
            onClick={() => selectSelfChat()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              cursor: "pointer",
              backgroundColor: isSelfSelected ? "#2a3942" : "transparent",
              borderBottom: "1px solid #1f2c34",
              transition: "background 0.15s",
            }}
            className="whatsapp-chat-row"
          >
            <div style={{ position: "relative" }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #25d366, #128c7e)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 15,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                }}
              >
                <Bookmark size={20} />
              </div>
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  backgroundColor: "#25d366",
                  border: "2px solid #111b21",
                }}
              />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: "#e9edef" }}>
                  {userName} <span style={{ fontSize: 11.5, color: "#00a884", fontWeight: 500 }}>(You)</span>
                </span>
                {selfChannel && (
                  <span style={{ fontSize: 11, color: "#8696a0" }}>
                    {getLastMessageTime(selfChannel.id)}
                  </span>
                )}
              </div>
              <p
                style={{
                  fontSize: 12.5,
                  color: isSelfSelected ? "#d1d7db" : "#8696a0",
                  margin: "2px 0 0",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {selfChannel ? (getLastMessageSnippet(selfChannel.id) || "Message yourself / Personal notes") : "Message yourself / Personal notes"}
              </p>
            </div>
          </div>
        )}

        {/* 2. Direct Member Contacts (Click to Chat) ───────────── */}
        {(activeTab === "all" || activeTab === "members") && (
          <div>
            {filteredUsers.map((member: User) => {
              const memberChannel = memberChannelMap.get(member.id);
              const isSelected = memberChannel && activeChannelId === memberChannel.id;
              const presence = presenceMap[member.id] || member.presence_status || "offline";
              const isOnline = presence === "online";
              const lastMsg = getLastMessageSnippet(memberChannel?.id);
              const lastTime = getLastMessageTime(memberChannel?.id);
              const initials = (member.display_name || member.username || "??").slice(0, 2).toUpperCase();

              return (
                <div
                  key={member.id}
                  onClick={() => startChatWithUser(member)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    cursor: "pointer",
                    backgroundColor: isSelected ? "#2a3942" : "transparent",
                    borderBottom: "1px solid #1f2c34",
                    transition: "background 0.15s",
                  }}
                  className="whatsapp-chat-row"
                >
                  {/* User Avatar with Presence indicator */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                        fontSize: 15,
                        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                      }}
                    >
                      {initials}
                    </div>
                    <span
                      style={{
                        position: "absolute",
                        bottom: 0,
                        right: 0,
                        width: 11,
                        height: 11,
                        borderRadius: "50%",
                        backgroundColor: isOnline ? "#25d366" : "#8696a0",
                        border: "2px solid #111b21",
                      }}
                    />
                  </div>

                  {/* Name and Last Message / Status */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14.5, fontWeight: 500, color: "#e9edef", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {member.display_name}
                      </span>
                      {lastTime && (
                        <span style={{ fontSize: 11, color: isOnline ? "#00a884" : "#8696a0", flexShrink: 0, marginLeft: 6 }}>
                          {lastTime}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      {lastMsg && <CheckCheck size={13} color="#53bdeb" style={{ flexShrink: 0 }} />}
                      <p
                        style={{
                          fontSize: 12.5,
                          color: isSelected ? "#d1d7db" : "#8696a0",
                          margin: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          flex: 1,
                        }}
                      >
                        {lastMsg || (isOnline ? "Online" : member.email)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredUsers.length === 0 && (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "#8696a0", fontSize: 13 }}>
                No members found
              </div>
            )}
          </div>
        )}

        {/* 3. Groups & Channels Section ────────────────────────── */}
        {(activeTab === "all" || activeTab === "groups") && filteredGroupChannels.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 14px",
                fontSize: 11.5,
                fontWeight: 600,
                color: "#8696a0",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                cursor: "pointer",
              }}
              onClick={() => setGroupsOpen(!groupsOpen)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {groupsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>Groups & Channels ({filteredGroupChannels.length})</span>
              </div>
            </div>

            {groupsOpen &&
              filteredGroupChannels.map((channel: Channel) => {
                const isSelected = channel.id === activeChannelId;
                const lastMsg = getLastMessageSnippet(channel.id);
                const lastTime = getLastMessageTime(channel.id);

                return (
                  <div
                    key={channel.id}
                    onClick={() => selectChannel(channel.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "#2a3942" : "transparent",
                      borderBottom: "1px solid #1f2c34",
                      transition: "background 0.15s",
                    }}
                    className="whatsapp-chat-row"
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        backgroundColor: "#202c33",
                        color: "#00a884",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        border: "1px solid #2a3942",
                      }}
                    >
                      {channel.type === "private" ? <Lock size={18} /> : <Users size={18} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 14.5, fontWeight: 500, color: "#e9edef", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {channel.name}
                        </span>
                        {lastTime && (
                          <span style={{ fontSize: 11, color: "#8696a0", flexShrink: 0, marginLeft: 6 }}>
                            {lastTime}
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: 12.5,
                          color: isSelected ? "#d1d7db" : "#8696a0",
                          margin: "2px 0 0",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {lastMsg || `${channel.member_ids?.length || 0} participants`}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </aside>
  );
}
