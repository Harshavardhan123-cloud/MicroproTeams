"use client";

import { useState } from "react";
import { Search, Video, Edit, ChevronDown, ChevronRight, Hash, Lock, Plus, MessageCircle, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import type { Channel } from "@/lib/types";

interface SidebarProps {
  onCreateChannel: () => void;
}

export default function Sidebar({ onCreateChannel }: SidebarProps) {
  const router = useRouter();
  const channels = useAppStore((s) => s.channels);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const selectChannel = useAppStore((s) => s.selectChannel);
  const selectSelfChat = useAppStore((s) => s.selectSelfChat);
  const user = useAppStore((s) => s.user);
  const usersById = useAppStore((s) => s.usersById);

  const [filter, setFilter] = useState<"all" | "unread" | "meetings" | "unmuted">("all");
  const [favOpen, setFavOpen] = useState(true);
  const [chatsOpen, setChatsOpen] = useState(true);
  const [channelsOpen, setChannelsOpen] = useState(true);

  const userName = user?.display_name || user?.username || "User";
  const userInitials = userName.slice(0, 2).toUpperCase();
  const presence = user?.presence_status || "online";

  // Separate DM/group chats from public/private channels
  const dmChannels = channels.filter((c) => c.type === "dm" || c.type === "group_dm");
  const regularChannels = channels.filter((c) => c.type !== "dm" && c.type !== "group_dm");

  // Filter channels based on active chip
  const filteredDMChannels = dmChannels.filter((c) => {
    if (filter === "meetings") return false;
    return true;
  });

  const filteredRegularChannels = regularChannels.filter((c) => {
    if (filter === "meetings") return c.name.includes("meeting") || c.name.includes("video");
    return true;
  });

  /** Get a display name for a DM channel based on its members */
  const getDMDisplayName = (channel: Channel): string => {
    if (!channel.member_ids || !user) return channel.name;

    const otherMemberIds = channel.member_ids.filter((id) => id !== user.id);

    // Self-chat: only member is the current user
    if (otherMemberIds.length === 0) {
      return `${userName} (You)`;
    }

    // 1:1 DM: show other person's name
    if (otherMemberIds.length === 1) {
      const other = usersById[otherMemberIds[0]];
      return other?.display_name || channel.name;
    }

    // Group DM: show all other members' names
    const names = otherMemberIds
      .map((id) => usersById[id]?.display_name)
      .filter(Boolean);
    if (names.length === 0) return channel.name;
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
  };

  /** Get initials for a DM channel avatar */
  const getDMInitials = (channel: Channel): string => {
    if (!channel.member_ids || !user) return channel.name.slice(0, 2).toUpperCase();

    const otherMemberIds = channel.member_ids.filter((id) => id !== user.id);

    // Self-chat
    if (otherMemberIds.length === 0) return userInitials;

    // 1:1 DM
    if (otherMemberIds.length === 1) {
      const other = usersById[otherMemberIds[0]];
      return (other?.display_name || "??").slice(0, 2).toUpperCase();
    }

    // Group DM: show count
    return `${channel.member_ids.length}`;
  };

  /** Check if a DM channel is a self-chat */
  const isSelfChat = (channel: Channel): boolean => {
    if (!channel.member_ids || !user) return false;
    return channel.member_ids.length === 1 && channel.member_ids[0] === user.id;
  };

  return (
    <aside className="teams-sidebar">
      {/* Sidebar Header */}
      <div className="teams-sidebar-header">
        <h2 className="teams-sidebar-title">Chat</h2>
        <div className="teams-header-icons">
          <button
            className="sidebar-action-btn"
            title="Start meeting"
            onClick={() => router.push(`/meeting/${Date.now()}`)}
          >
            <Video size={16} />
          </button>
          <button
            className="sidebar-action-btn"
            title="New Chat"
            onClick={onCreateChannel}
          >
            <Edit size={16} />
          </button>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="teams-filter-chips">
        <button
          className={`chip ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={`chip ${filter === "unread" ? "active" : ""}`}
          onClick={() => setFilter(filter === "unread" ? "all" : "unread")}
        >
          Unread
        </button>
        <button
          className={`chip ${filter === "meetings" ? "active" : ""}`}
          onClick={() => setFilter(filter === "meetings" ? "all" : "meetings")}
        >
          Meeting chats
        </button>
        <button
          className={`chip ${filter === "unmuted" ? "active" : ""}`}
          onClick={() => setFilter(filter === "unmuted" ? "all" : "unmuted")}
        >
          Unmuted
        </button>
      </div>

      {/* Chat List Scroll Container */}
      <div className="teams-chat-list">
        {/* Favourites Section */}
        <div className="teams-section-header" onClick={() => setFavOpen(!favOpen)}>
          {favOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Favourites</span>
        </div>

        {favOpen && (
          <div className="teams-section-content">
            {/* Self Chat Item */}
            <div
              className={`teams-chat-item ${
                channels.find((c) => c.id === activeChannelId)?.name === "personal-space"
                  ? "selected"
                  : ""
              }`}
              onClick={() => selectSelfChat()}
            >
              <div className="chat-avatar-container">
                <div className="teams-user-avatar">{userInitials}</div>
                <span className={`presence-green-dot ${presence}`} />
              </div>
              <div className="teams-chat-info">
                <span className="chat-title">{userName} (You)</span>
              </div>
            </div>
          </div>
        )}

        {/* Direct Messages & Group Chats Section */}
        <div className="teams-section-header" onClick={() => setChatsOpen(!chatsOpen)}>
          {chatsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Chats</span>
          <button
            className="add-channel-btn"
            onClick={(e) => {
              e.stopPropagation();
              onCreateChannel();
            }}
            title="New chat"
          >
            <Plus size={14} />
          </button>
        </div>

        {chatsOpen && (
          <div className="teams-section-content">
            {filteredDMChannels.map((channel: Channel) => {
              const isSelected = channel.id === activeChannelId;
              const displayName = getDMDisplayName(channel);
              const initials = getDMInitials(channel);
              const isGroup = channel.type === "group_dm";
              const isSelf = isSelfChat(channel);

              return (
                <div
                  key={channel.id}
                  className={`teams-chat-item ${isSelected ? "selected" : ""}`}
                  onClick={() => selectChannel(channel.id)}
                >
                  <div className="chat-avatar-container">
                    <div
                      className="teams-user-avatar"
                      style={{
                        background: isSelf
                          ? "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-primary) / 0.7))"
                          : isGroup
                            ? "linear-gradient(135deg, hsl(170 70% 45%), hsl(220 70% 55%))"
                            : "linear-gradient(135deg, hsl(280 60% 55%), hsl(200 80% 55%))",
                        fontSize: isGroup ? 11 : 13,
                      }}
                    >
                      {isGroup ? <Users size={15} /> : initials}
                    </div>
                    {!isGroup && <span className="presence-green-dot" />}
                  </div>
                  <div className="teams-chat-info">
                    <span className="chat-title">{displayName}</span>
                    {isGroup && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "hsl(var(--text-muted))",
                          display: "block",
                          marginTop: 1,
                        }}
                      >
                        {channel.member_ids?.length || 0} members
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredDMChannels.length === 0 && (
              <div
                style={{
                  padding: "12px 16px",
                  fontSize: 12,
                  color: "hsl(var(--text-muted))",
                  textAlign: "center",
                }}
              >
                No chats yet. Click + to start one.
              </div>
            )}
          </div>
        )}

        {/* Public / Private Channels Section */}
        {filteredRegularChannels.length > 0 && (
          <>
            <div className="teams-section-header" onClick={() => setChannelsOpen(!channelsOpen)}>
              {channelsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>Channels</span>
            </div>

            {channelsOpen && (
              <div className="teams-section-content">
                {filteredRegularChannels.map((channel: Channel) => {
                  const isSelected = channel.id === activeChannelId;
                  return (
                    <div
                      key={channel.id}
                      className={`teams-chat-item ${isSelected ? "selected" : ""}`}
                      onClick={() => selectChannel(channel.id)}
                    >
                      <div className="chat-avatar-container">
                        <div className="teams-channel-avatar">
                          {channel.type === "private" ? <Lock size={13} /> : <Hash size={14} />}
                        </div>
                      </div>
                      <div className="teams-chat-info">
                        <span className="chat-title">{channel.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
