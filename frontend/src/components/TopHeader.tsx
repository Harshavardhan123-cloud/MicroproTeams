"use client";

import { useState, useRef, useEffect } from "react";
import {
  Search,
  MoreHorizontal,
  ChevronRight,
  CheckCircle2,
  Edit3,
  LogOut,
  Hash,
  User as UserIcon,
  Circle,
  Slash,
  Moon,
  Save,
  Settings as SettingsIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import type { PresenceStatus } from "@/lib/types";

export default function TopHeader() {
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const channels = useAppStore((s) => s.channels);
  const selectChannel = useAppStore((s) => s.selectChannel);
  const updateUserPresence = useAppStore((s) => s.updateUserPresence);
  const updateCustomStatus = useAppStore((s) => s.updateCustomStatus);
  const reset = useAppStore((s) => s.reset);

  const [profileOpen, setProfileOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [statusMsgOpen, setStatusMsgOpen] = useState(false);
  const [customMsgInput, setCustomMsgInput] = useState(user?.custom_status || "");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const displayName = user?.display_name || user?.username || "Harshavardhan Chatte";
  const email = user?.email || "hchatte@microproindia.com";
  const initials = displayName.slice(0, 2).toUpperCase();
  const presence = user?.presence_status || "online";

  // Filter channels based on search query
  const matchingChannels = searchQuery.trim()
    ? channels.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
        setStatusMenuOpen(false);
        setStatusMsgOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = () => {
    reset();
    window.location.href = "/login";
  };

  const handlePresenceChange = (status: PresenceStatus) => {
    updateUserPresence(status);
    setStatusMenuOpen(false);
  };

  const handleSaveStatusMsg = () => {
    updateCustomStatus(customMsgInput);
    setStatusMsgOpen(false);
  };

  return (
    <header className="teams-top-header">
      {/* Search Input & Live Results Dropdown */}
      <div className="teams-search-container" ref={searchRef}>
        <div className="teams-search-box">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search channels, people, and files"
            className="teams-search-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
          />
        </div>

        {searchOpen && searchQuery.trim() !== "" && (
          <div className="teams-search-dropdown">
            <div className="search-category-label">Channels</div>
            {matchingChannels.length > 0 ? (
              matchingChannels.map((c) => (
                <div
                  key={c.id}
                  className="search-result-item"
                  onClick={() => {
                    selectChannel(c.id);
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                >
                  <Hash size={14} color="#a1a1a1" />
                  <span>{c.name}</span>
                </div>
              ))
            ) : (
              <div className="search-no-results">No channels matching &quot;{searchQuery}&quot;</div>
            )}
          </div>
        )}
      </div>

      {/* Top Right Actions */}
      <div className="teams-header-actions" ref={profileRef}>
        <button
          className="teams-header-icon-btn"
          title="Settings"
          onClick={() => router.push("/settings")}
        >
          <SettingsIcon size={18} />
        </button>

        <button className="teams-header-icon-btn" title="More options">
          <MoreHorizontal size={18} />
        </button>

        {/* User Profile Trigger Button */}
        <button
          className="teams-profile-trigger"
          onClick={() => setProfileOpen(!profileOpen)}
          title="Account manager"
        >
          <div className="profile-avatar-box">
            <span>{initials}</span>
            <span className={`online-badge-dot ${presence}`} />
          </div>
        </button>

        {/* Microsoft Teams Profile Dropdown Card */}
        {profileOpen && (
          <div className="teams-profile-card">
            <div className="profile-card-header">
              <span className="personal-tag">Personal</span>
              <button className="signout-link" onClick={handleSignOut}>
                Sign out
              </button>
            </div>

            <div className="profile-card-body">
              <div className="profile-large-avatar">
                <span>{initials}</span>
              </div>
              <div className="profile-details">
                <div className="profile-name">{displayName}</div>
                <div className="profile-email">{email}</div>
                {user?.custom_status && (
                  <div className="profile-custom-status-text">&quot;{user.custom_status}&quot;</div>
                )}
                <a href="#account" className="microsoft-acc-link">
                  My Microsoft account ↗
                </a>
              </div>
            </div>

            <div className="profile-menu-divider" />

            <div className="profile-status-section">
              {/* Presence Status Selector */}
              <button
                className="profile-menu-item"
                onClick={() => setStatusMenuOpen(!statusMenuOpen)}
              >
                <div className="menu-item-left">
                  {presence === "online" && (
                    <CheckCircle2 size={16} color="#23a55a" fill="#23a55a" stroke="#1f1f1f" />
                  )}
                  {presence === "busy" && (
                    <Circle size={16} color="#e03e2d" fill="#e03e2d" />
                  )}
                  {presence === "dnd" && (
                    <Slash size={16} color="#e03e2d" fill="#e03e2d" />
                  )}
                  {presence === "away" && (
                    <Moon size={16} color="#ff8c00" fill="#ff8c00" />
                  )}
                  <span style={{ textTransform: "capitalize" }}>{presence}</span>
                </div>
                <ChevronRight size={16} color="#a1a1a1" />
              </button>

              {/* Status Picker Sub-Menu */}
              {statusMenuOpen && (
                <div className="status-submenu">
                  <button className="status-option" onClick={() => handlePresenceChange("online")}>
                    <CheckCircle2 size={15} color="#23a55a" fill="#23a55a" stroke="#1f1f1f" />
                    <span>Available</span>
                  </button>
                  <button className="status-option" onClick={() => handlePresenceChange("busy")}>
                    <Circle size={15} color="#e03e2d" fill="#e03e2d" />
                    <span>Busy</span>
                  </button>
                  <button className="status-option" onClick={() => handlePresenceChange("dnd")}>
                    <Slash size={15} color="#e03e2d" fill="#e03e2d" />
                    <span>Do not disturb</span>
                  </button>
                  <button className="status-option" onClick={() => handlePresenceChange("away")}>
                    <Moon size={15} color="#ff8c00" fill="#ff8c00" />
                    <span>Be right back / Away</span>
                  </button>
                </div>
              )}

              {/* Set Status Message */}
              <button
                className="profile-menu-item"
                onClick={() => setStatusMsgOpen(!statusMsgOpen)}
              >
                <div className="menu-item-left">
                  <Edit3 size={16} color="#a1a1a1" />
                  <span>Set status message</span>
                </div>
                <ChevronRight size={16} color="#a1a1a1" />
              </button>

              {statusMsgOpen && (
                <div className="status-msg-box">
                  <input
                    type="text"
                    placeholder="What's on your mind?"
                    className="status-msg-input"
                    value={customMsgInput}
                    onChange={(e) => setCustomMsgInput(e.target.value)}
                  />
                  <button className="status-save-btn" onClick={handleSaveStatusMsg}>
                    <Save size={14} />
                    <span>Save</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
