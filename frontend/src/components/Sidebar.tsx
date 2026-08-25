"use client";

import { useState } from "react";
import { Search, Video, Edit, ChevronDown, ChevronRight, Hash, Lock, Plus } from "lucide-react";
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

  const [filter, setFilter] = useState<"all" | "unread" | "meetings" | "unmuted">("all");
  const [favOpen, setFavOpen] = useState(true);
  const [chatsOpen, setChatsOpen] = useState(true);

  const userName = user?.display_name || user?.username || "Harshavardhan Chatte";
  const userInitials = userName.slice(0, 2).toUpperCase();
  const presence = user?.presence_status || "online";

  // Filter channels based on active chip
  const filteredChannels = channels.filter((c) => {
    if (filter === "unread") return true; // Show all or unread channels
    if (filter === "meetings") return c.name.includes("meeting") || c.name.includes("video");
    if (filter === "unmuted") return true;
    return true;
  });

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
            title="New Chat / Channel"
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
            {/* Self Chat Item: Harshavardhan Chatte (You) */}
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

        {/* Chats & Channels Section */}
        <div className="teams-section-header" onClick={() => setChatsOpen(!chatsOpen)}>
          {chatsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Chats</span>
          <button
            className="add-channel-btn"
            onClick={(e) => {
              e.stopPropagation();
              onCreateChannel();
            }}
            title="Create channel"
          >
            <Plus size={14} />
          </button>
        </div>

        {chatsOpen && (
          <div className="teams-section-content">
            {filteredChannels.map((channel: Channel) => {
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
      </div>
    </aside>
  );
}
