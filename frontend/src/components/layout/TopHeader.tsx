import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, HelpCircle, LogOut, Settings, Moon, Sun, MessageSquare, Users as UsersIcon, Check, BookOpen, Command, LifeBuoy, Info, PhoneCall, Phone, Video, Calendar, Trash2, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useCallStore } from '../../stores/callStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { notificationService } from '../../services/notificationService';
import { PresenceStatus } from '../../types';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { MicroproLogo } from '../common/MicroproLogo';
import { ThemeSwitcher } from '../common/ThemeSwitcher';

const STATUS_CONFIG: Record<string, { label: string; dotClass: string; textClass: string }> = {
  available: { label: 'Available', dotClass: 'bg-emerald-500 shadow-emerald-500/50', textClass: 'text-emerald-400' },
  busy: { label: 'Busy', dotClass: 'bg-rose-500 shadow-rose-500/50', textClass: 'text-rose-400' },
  dnd: { label: 'Do Not Disturb', dotClass: 'bg-red-600 shadow-red-600/50', textClass: 'text-red-500' },
  away: { label: 'Away', dotClass: 'bg-amber-500 shadow-amber-500/50', textClass: 'text-amber-400' },
};

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Just now';
  const cleanStr = isoString.endsWith('Z') || isoString.includes('+') ? isoString : `${isoString}Z`;
  const timeMs = new Date(cleanStr).getTime();
  if (isNaN(timeMs)) return 'Just now';
  const diffMs = Date.now() - timeMs;
  if (diffMs < 0) return 'Just now';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export const TopHeader: React.FC = () => {
  const { user, logout, setPresence } = useAuthStore();
  const { setUserSettingsOpen, setShortcutsOpen, setDocsOpen, setAboutOpen, setActiveTab, setSelectedConversationId } = useUIStore();
  const { callState, canRejoin, setIsCallMinimized, rejoinLastCall } = useCallStore();
  const { notifications, setNotifications, markAllNotifsRead: markAllStoreRead, markNotifRead, clearAllNotifications, removeNotification } = useNotificationStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('teams_theme') as 'dark' | 'light') || 'dark';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();

  const loadNotifications = async () => {
    try {
      const res = await notificationService.getNotifications();
      const list = res.notifications || [];
      const formatted = list.map((n: any) => ({
        id: n.id || n.notificationId,
        title: n.title,
        body: n.body,
        time: formatRelativeTime(n.created_at),
        unread: n.status ? n.status === 'UNREAD' : (n.is_read !== undefined ? !n.is_read : true),
        type: n.type || 'system',
        created_at: n.created_at,
        conversationId: n.conversation_id || n.conversationId,
        callId: n.call_id || n.callId,
        meetingId: n.meeting_id || n.meetingId
      }));
      setNotifications(formatted);
    } catch (err) {
      console.error('Fetch notifications error:', err);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setIsHelpOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchResults(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem('mc_theme', theme);
    localStorage.setItem('teams_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.remove('light-mode');
      document.documentElement.classList.add('dark');
    }
  }, [theme]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const res = await apiClient.get(`/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(res.data.data || res.data);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { addToast } = useNotificationStore();

  const handlePresenceChange = async (status: PresenceStatus) => {
    setPresence(status);
    try {
      await apiClient.put('/users/me/presence', { presence: status });
    } catch (err) {
      console.error('Update presence error:', err);
    }
    const label = STATUS_CONFIG[status]?.label || status;
    addToast({
      title: 'Status Updated',
      body: `Your availability status is now set to ${label}.`,
      type: 'info'
    });
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleMarkAllRead = async () => {
    markAllStoreRead();
    try {
      await notificationService.markAsRead(true);
    } catch (err) {
      console.error('Mark notifications read error:', err);
    }
  };

  const handleClearAll = async () => {
    clearAllNotifications();
    try {
      await notificationService.clearAllNotifications();
    } catch (err) {
      console.error('Clear all notifications error:', err);
    }
  };

  const handleRemoveNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeNotification(id);
    try {
      await notificationService.deleteNotification(id);
    } catch (err) {
      console.error('Delete notification error:', err);
    }
  };

  const handleNotificationClick = async (n: any) => {
    if (n.unread && n.id) {
      markNotifRead(n.id);
      try {
        await notificationService.markAsRead(false, [n.id]);
      } catch (err) {
        console.error('Mark notification read error:', err);
      }
    }

    setIsNotificationsOpen(false);

    const typeLower = (n.type || '').toLowerCase();
    if (n.conversationId || typeLower.includes('message') || typeLower === 'chat') {
      setActiveTab('chat');
      if (n.conversationId) {
        setSelectedConversationId(n.conversationId);
      }
    } else if (typeLower.includes('call')) {
      setActiveTab('calls');
    } else if (typeLower.includes('meeting') || n.meetingId) {
      setActiveTab('calendar');
    } else {
      setActiveTab('activity');
    }
  };

  const getNotifIcon = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('chat') || t.includes('message') || t === 'direct_message') {
      return <MessageSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />;
    }
    if (t.includes('call')) {
      return <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
    }
    if (t.includes('meeting')) {
      return <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
    }
    return <Bell className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />;
  };

  const unreadCount = notifications.filter((n) => n.unread).length;
  const currentStatus = STATUS_CONFIG[user?.presence || 'available'] || STATUS_CONFIG.available;

  return (
    <header className="h-12 bg-[#0B0D12]/95 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-5 select-none shrink-0 z-20 shadow-sm">
      
      {/* Center Command Palette Search Bar */}
      <div className="flex-1 max-w-lg mx-auto relative" ref={searchRef}>
        <div className="relative flex items-center group">
          <Search className="w-4 h-4 absolute left-3.5 text-mc-muted group-focus-within:text-cyan-400 transition-colors duration-200" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages, people, files... (Ctrl + K / ⌘K)"
            className="w-full bg-[#13151F]/90 text-xs text-white placeholder-mc-muted/80 pl-9 pr-14 py-1.5 rounded-full border border-white/[0.08] focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none transition-all duration-200 shadow-inner"
          />
          <div className="absolute right-3 hidden sm:flex items-center gap-1">
            <kbd className="text-[9px] font-mono font-semibold text-mc-muted bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded shadow-sm">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Search Results Dropdown */}
        {searchQuery.trim().length > 0 && (
          <div className="absolute top-10 left-0 right-0 bg-[#141722]/95 border border-white/10 rounded-2xl shadow-2xl p-3.5 z-50 max-h-96 overflow-y-auto space-y-3 mc-glass backdrop-blur-2xl">
            {isSearching ? (
              <p className="text-xs text-mc-muted text-center py-3 animate-pulse">Searching workspace...</p>
            ) : searchResults ? (
              <>
                {searchResults.users?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <UsersIcon className="w-3 h-3 text-indigo-400" /> People
                    </p>
                    <div className="space-y-1">
                      {searchResults.users.map((u: any) => (
                        <div key={u.id} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded-xl cursor-pointer">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-[10px] text-white uppercase">
                            {u.display_name?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">{u.display_name}</p>
                            <p className="text-[10px] text-mc-muted">{u.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.messages?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-indigo-400" /> Messages
                    </p>
                    <div className="space-y-1">
                      {searchResults.messages.map((m: any) => (
                        <div key={m.id} className="p-2 hover:bg-white/5 rounded-xl cursor-pointer">
                          <p className="text-xs text-white truncate">{m.content}</p>
                          <p className="text-[10px] text-mc-muted">{m.sender_name || 'User'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!searchResults.users?.length && !searchResults.messages?.length && (
                  <p className="text-xs text-mc-muted text-center py-2">No matching workspace results.</p>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Right Action Controls */}
      <div className="flex items-center gap-2">
        {/* Rejoin Call Button */}
        {(callState === 'active' || canRejoin) && (
          <button
            onClick={() => {
              if (callState === 'active') {
                setIsCallMinimized(false);
              } else if (canRejoin) {
                rejoinLastCall();
              }
            }}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-full transition-all flex items-center gap-1.5 text-xs shadow-lg shadow-emerald-600/30 animate-pulse active:scale-95 mr-1"
            title="Rejoin Active Meeting"
          >
            <PhoneCall className="w-3.5 h-3.5 text-white" />
            <span>Rejoin Meeting</span>
          </button>
        )}

        {/* Theme Switcher */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 rounded-full flex items-center justify-center text-mc-secondary hover:text-white hover:bg-white/5 transition-all"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-400 hover:-rotate-12 transition-transform" />
          )}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setIsNotificationsOpen(!isNotificationsOpen);
              if (!isNotificationsOpen) loadNotifications();
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-mc-secondary hover:text-white hover:bg-white/5 transition-all relative"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#0B0D12] animate-pulse" />
            )}
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-80 bg-[#171923] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 mc-glass">
              <div className="p-3 border-b border-white/5 bg-[#11131A] flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-white font-display">
                  <Bell className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Activity Inbox</span>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-[10px] text-white font-bold">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[10px] text-indigo-400 hover:underline font-medium"
                    >
                      Mark all read
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      onClick={handleClearAll}
                      className="text-[10px] text-rose-400 hover:underline font-medium flex items-center gap-1"
                      title="Clear all"
                    >
                      <Trash2 className="w-3 h-3 text-rose-400" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-mc-muted text-xs flex flex-col items-center gap-2">
                    <Bell className="w-6 h-6 text-mc-muted/40" />
                    <span>Inbox zero. No new notifications.</span>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`p-3 transition-all flex items-start justify-between gap-2.5 group cursor-pointer ${
                        n.unread ? 'bg-indigo-600/10 hover:bg-indigo-600/20' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="mt-0.5">
                        {getNotifIcon(n.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-white font-semibold leading-snug truncate">{n.title}</p>
                          {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1" />}
                        </div>
                        {n.body && <p className="text-[11px] text-mc-muted mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>}
                        <span className="text-[10px] text-mc-muted/80 mt-1 block font-mono">
                          {formatRelativeTime(n.created_at || new Date().toISOString())}
                        </span>
                      </div>
                      <button
                        onClick={(e) => handleRemoveNotification(n.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-mc-muted hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all shrink-0 mt-0.5"
                        title="Dismiss notification"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Platform Theme Switcher */}
        <ThemeSwitcher variant="compact" />

        {/* Help & Documentation */}
        <div className="relative" ref={helpRef}>
          <button
            onClick={() => setIsHelpOpen(!isHelpOpen)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-mc-secondary hover:text-white hover:bg-white/5 transition-all"
            title="Help & Support"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {isHelpOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-72 bg-[#171923] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 mc-glass">
              <div className="p-3 border-b border-white/5 bg-[#11131A] font-bold text-xs text-white flex items-center gap-2 font-display">
                <LifeBuoy className="w-3.5 h-3.5 text-indigo-400" />
                <span>Help & Guides</span>
              </div>

              <div className="p-2 space-y-1">
                <button
                  onClick={() => {
                    setIsHelpOpen(false);
                    setShortcutsOpen(true);
                  }}
                  className="w-full p-2 hover:bg-white/5 rounded-xl cursor-pointer flex items-center gap-2.5 transition-colors text-left"
                >
                  <Command className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white">Shortcuts</p>
                    <p className="text-[10px] text-mc-muted">Ctrl+E (Search), Ctrl+N (New Chat)</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsHelpOpen(false);
                    setDocsOpen(true);
                  }}
                  className="w-full p-2 hover:bg-white/5 rounded-xl cursor-pointer flex items-center gap-2.5 transition-colors text-left"
                >
                  <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white">Documentation</p>
                    <p className="text-[10px] text-mc-muted">View platform architectural guides</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsHelpOpen(false);
                    setAboutOpen(true);
                  }}
                  className="w-full p-2 hover:bg-white/5 rounded-xl cursor-pointer flex items-center gap-2.5 transition-colors text-left"
                >
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white">About Micropro_Commute</p>
                    <p className="text-[10px] text-mc-muted">Version v3.0 (Enterprise Build)</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* User Profile Avatar Popover */}
        <div className="relative flex items-center gap-2" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-2.5 h-8 px-2.5 rounded-full hover:bg-white/[0.08] transition-all focus:outline-none border border-white/10 bg-[#13151F] hover:border-cyan-500/40 shadow-sm shrink-0 group"
          >
            <div className="relative flex items-center shrink-0">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name} className="w-6 h-6 rounded-full object-cover shadow-md ring-1 ring-white/10 group-hover:scale-105 transition-transform" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-[10px] text-white uppercase shadow-md ring-1 ring-white/10 group-hover:scale-105 transition-transform">
                  {user?.display_name?.charAt(0) || 'U'}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                {user?.presence === 'available' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ring-2 ring-[#0B0D12] ${currentStatus.dotClass}`}
                />
              </span>
            </div>
            <span className={`text-[11px] font-bold ${currentStatus.textClass} hidden sm:inline capitalize font-display`}>
              {currentStatus.label}
            </span>
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-72 bg-[#171923] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 mc-glass">
              <div className="p-4 border-b border-white/5 bg-[#11131A] flex items-center gap-3">
                <div className="relative shrink-0">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user.display_name} className="w-10 h-10 rounded-full object-cover shadow-lg ring-2 ring-white/10" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-sm text-white uppercase shadow-lg ring-2 ring-white/10">
                      {user?.display_name?.charAt(0) || 'U'}
                    </div>
                  )}
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-[#11131A] ${currentStatus.dotClass}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm text-white truncate leading-snug font-display">
                    {user?.display_name || 'Enterprise User'}
                  </h3>
                  <p className="text-[11px] text-mc-muted truncate leading-tight">
                    {user?.email || 'user@organization.com'}
                  </p>
                  <p className="text-[10px] text-indigo-400 font-medium mt-0.5">
                    {user?.job_title || 'Team Member'}
                  </p>
                </div>
              </div>

              {/* Presence Selector */}
              <div className="p-3 border-b border-white/5">
                <p className="text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-2 px-1">
                  Availability Status
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(STATUS_CONFIG) as PresenceStatus[]).map((statusKey) => {
                    const cfg = STATUS_CONFIG[statusKey];
                    const isSelected = user?.presence === statusKey;
                    return (
                      <button
                        key={statusKey}
                        onClick={() => handlePresenceChange(statusKey)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-white/10 text-white ring-1 ring-indigo-500/50 shadow-sm'
                            : 'text-mc-secondary hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
                        <span className="truncate">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer Links */}
              <div className="p-1.5 space-y-0.5">
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    setUserSettingsOpen(true);
                  }}
                  className="w-full px-3 py-2 text-xs text-mc-secondary hover:bg-white/5 hover:text-white rounded-xl flex items-center gap-2.5 transition-colors font-medium"
                >
                  <Settings className="w-4 h-4 text-mc-muted" />
                  <span>Profile & User Settings</span>
                </button>

                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    logout();
                    navigate('/login');
                  }}
                  className="w-full px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded-xl flex items-center gap-2.5 transition-colors font-medium"
                >
                  <LogOut className="w-4 h-4 text-rose-400" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
