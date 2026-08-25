"use client";

import { useState } from "react";
import { Search, Video, Edit, ChevronDown, ChevronRight, Hash, Lock, Plus, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { User as UserIcon } from "lucide-react";
import type { Channel, User } from "@/lib/types";

export default function Sidebar() {
  const router = useRouter();
  const channels = useAppStore((s) => s.channels);
  const users = useAppStore((s) => s.users);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const selectChannel = useAppStore((s) => s.selectChannel);
  const openDM = useAppStore((s) => s.openDM);
  const selectSelfChat = useAppStore((s) => s.selectSelfChat);
  const user = useAppStore((s) => s.user);

  const [filter, setFilter] = useState<"all" | "unread" | "meetings" | "unmuted">("all");
  const [favOpen, setFavOpen] = useState(true);
  const [chatsOpen, setChatsOpen] = useState(true);

  const userName = user?.display_name || user?.username || "Harshavardhan Chatte";
  const userInitials = userName.slice(0, 2).toUpperCase();
  const presence = user?.presence_status || "online";

  // Filter users based on active chip (mocked for now, can implement real logic later)
  const filteredUsers = users.filter((u) => {
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
          <span>Direct Messages</span>
        </div>

        {chatsOpen && (
          <div className="teams-section-content">
            {filteredUsers.map((u: User) => {
              // A simple heuristic to see if this user's DM is active
              const isSelected = channels.find(c => c.id === activeChannelId)?.name.includes(u.id);
              const initials = (u.display_name || u.username).slice(0, 2).toUpperCase();
              return (
                <div
                  key={u.id}
                  className={`teams-chat-item ${isSelected ? "selected" : ""}`}
                  onClick={() => openDM(u.id)}
                >
                  <div className="chat-avatar-container">
                    <div className="teams-user-avatar">{initials}</div>
                    <span className={`presence-green-dot ${u.presence_status || "offline"}`} />
                  </div>
                  <div className="teams-chat-info">
                    <span className="chat-title">{u.display_name || u.username}</span>
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
