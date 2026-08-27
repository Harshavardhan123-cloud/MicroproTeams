import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, HelpCircle, LogOut, User as UserIcon, Settings, Moon, Sun, MessageSquare, Hash, Users as UsersIcon, Edit3, Check, BookOpen, Command, LifeBuoy, Info, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { PresenceStatus } from '../../types';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';

const STATUS_CONFIG: Record<string, { label: string; dotClass: string; textClass: string }> = {
  available: { label: 'Available', dotClass: 'bg-emerald-500 shadow-emerald-500/50', textClass: 'text-emerald-400' },
  busy: { label: 'Busy', dotClass: 'bg-rose-500 shadow-rose-500/50', textClass: 'text-rose-400' },
  dnd: { label: 'Do Not Disturb', dotClass: 'bg-red-600 shadow-red-600/50', textClass: 'text-red-500' },
  away: { label: 'Away', dotClass: 'bg-amber-500 shadow-amber-500/50', textClass: 'text-amber-400' },
};

export const TopHeader: React.FC = () => {
  const { user, logout, setPresence } = useAuthStore();
  const { setUserSettingsOpen } = useUIStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('teams_theme') as 'dark' | 'light') || 'dark';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isEditingStatusMsg, setIsEditingStatusMsg] = useState(false);

  const [notifications, setNotifications] = useState([
    { id: '1', title: 'Ethan Hunt sent you a direct message', time: '2m ago', unread: true, type: 'message' },
    { id: '2', title: 'Upcoming Standup Meeting in Engineering channel', time: '15m ago', unread: true, type: 'meeting' },
    { id: '3', title: 'Admin Alex Vance updated workspace policies', time: '1h ago', unread: true, type: 'system' }
  ]);

  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();

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
    localStorage.setItem('teams_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
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

  const handlePresenceChange = (status: PresenceStatus) => {
    setPresence(status);
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const markAllNotifsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const unreadCount = notifications.filter((n) => n.unread).length;
  const currentStatus = STATUS_CONFIG[user?.presence || 'available'] || STATUS_CONFIG.available;

  return (
    <header className="h-12 bg-[#1B1B1C] border-b border-[#2B2B2C] flex items-center justify-between px-4 select-none shrink-0 z-20">
      {/* Search Input Bar */}
      <div className="flex-1 max-w-xl mx-auto relative" ref={searchRef}>
        <div className="relative flex items-center">
          <Search className="w-4 h-4 absolute left-3 text-teams-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages, files, and users (Ctrl + E)"
            className="w-full bg-[#252526] text-xs text-teams-text placeholder-teams-muted pl-9 pr-4 py-1.5 rounded-md border border-transparent focus:border-teams-purple focus:outline-none transition-all shadow-inner"
          />
        </div>

        {/* Search Results Dropdown Popup */}
        {searchQuery.trim().length > 0 && (
          <div className="absolute top-10 left-0 right-0 bg-[#252525] border border-teams-border rounded-lg shadow-2xl p-3 z-50 max-h-96 overflow-y-auto space-y-3">
            {isSearching ? (
              <p className="text-xs text-teams-muted text-center py-2 animate-pulse">Searching enterprise workspace...</p>
            ) : searchResults ? (
              <>
                {searchResults.users?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-teams-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <UsersIcon className="w-3 h-3 text-teams-purple" /> Users
                    </p>
                    <div className="space-y-1">
                      {searchResults.users.map((u: any) => (
                        <div key={u.id} className="flex items-center gap-2 p-2 hover:bg-teams-hover rounded-md cursor-pointer">
                          <div className="w-6 h-6 rounded-full bg-teams-purple flex items-center justify-center font-bold text-[10px] text-white uppercase">
                            {u.display_name?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">{u.display_name}</p>
                            <p className="text-[10px] text-teams-muted">{u.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.messages?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-teams-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-teams-purple" /> Messages
                    </p>
                    <div className="space-y-1">
                      {searchResults.messages.map((m: any) => (
                        <div key={m.id} className="p-2 hover:bg-teams-hover rounded-md cursor-pointer">
                          <p className="text-xs text-white truncate">{m.content}</p>
                          <p className="text-[10px] text-teams-muted">{m.sender_name || 'User'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!searchResults.users?.length && !searchResults.messages?.length && (
                  <p className="text-xs text-teams-muted text-center py-2">No matching results found.</p>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Right Controls Bar */}
      <div className="flex items-center gap-2">
        {/* Theme Switcher */}
        <button
          onClick={toggleTheme}
          className="p-2 text-teams-muted hover:text-white rounded-lg hover:bg-teams-hover transition-all relative"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="w-4 h-4 text-teams-purple hover:-rotate-12 transition-transform" />
          )}
        </button>

        {/* Notifications Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-2 text-teams-muted hover:text-white rounded-lg hover:bg-teams-hover transition-all relative"
            title="Activity Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#1B1B1C] animate-pulse" />
            )}
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-[#202021] border border-[#333335] rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="p-3 border-b border-[#2C2C2E] bg-[#242426] flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-white">
                  <Bell className="w-3.5 h-3.5 text-teams-purple" />
                  <span>Activity & Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-teams-purple text-[10px] text-white">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllNotifsRead}
                    className="text-[10px] text-teams-purple hover:underline font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="divide-y divide-[#2C2C2E] max-h-72 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 transition-colors ${
                      n.unread ? 'bg-teams-purple/10' : 'hover:bg-[#252528]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-white font-medium leading-snug">{n.title}</p>
                      {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-teams-purple shrink-0 mt-1" />}
                    </div>
                    <span className="text-[10px] text-teams-muted mt-1 block">{n.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Help & Support */}
        <div className="relative" ref={helpRef}>
          <button
            onClick={() => setIsHelpOpen(!isHelpOpen)}
            className="p-2 text-teams-muted hover:text-white rounded-lg hover:bg-teams-hover transition-all"
            title="Help & Platform Support"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {isHelpOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-[#202021] border border-[#333335] rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="p-3 border-b border-[#2C2C2E] bg-[#242426] font-bold text-xs text-white flex items-center gap-2">
                <LifeBuoy className="w-3.5 h-3.5 text-teams-purple" />
                <span>Help & Enterprise Support</span>
              </div>

              <div className="p-2 space-y-1">
                <div className="p-2 hover:bg-[#28282B] rounded-lg cursor-pointer flex items-center gap-2.5 transition-colors">
                  <Command className="w-4 h-4 text-teams-accent shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white">Keyboard Shortcuts</p>
                    <p className="text-[10px] text-teams-muted">Ctrl+E (Search), Ctrl+N (New Chat)</p>
                  </div>
                </div>

                <div className="p-2 hover:bg-[#28282B] rounded-lg cursor-pointer flex items-center gap-2.5 transition-colors">
                  <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white">Documentation & Manuals</p>
                    <p className="text-[10px] text-teams-muted">View platform architectural guides</p>
                  </div>
                </div>

                <div className="p-2 hover:bg-[#28282B] rounded-lg cursor-pointer flex items-center gap-2.5 transition-colors">
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-white">About MicroproTeams</p>
                    <p className="text-[10px] text-teams-muted">Version v2.4.0 (Enterprise Build)</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-teams-border mx-1" />

        {/* User Profile Avatar Popover */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-2 p-1 rounded-md hover:bg-teams-hover transition-colors focus:outline-none"
          >
            <div className="relative">
              <div className="w-7 h-7 rounded-full bg-teams-purple flex items-center justify-center font-bold text-xs text-white uppercase shadow-md ring-1 ring-white/10">
                {user?.display_name?.charAt(0) || 'U'}
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#1B1B1C] ${currentStatus.dotClass}`}
              />
            </div>
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-[#202021] border border-[#333335] rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="p-4 border-b border-[#2C2C2E] bg-[#242426] flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-teams-purple flex items-center justify-center font-bold text-base text-white uppercase shadow-lg ring-2 ring-white/10">
                    {user?.display_name?.charAt(0) || 'U'}
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-[#242426] ${currentStatus.dotClass}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm text-white truncate leading-snug">
                    {user?.display_name || 'Enterprise User'}
                  </h3>
                  <p className="text-[11px] text-teams-muted truncate leading-tight">
                    {user?.email || 'user@organization.com'}
                  </p>
                  <p className="text-[10px] text-teams-purple font-medium mt-0.5">
                    {user?.job_title || 'Enterprise Team Member'}
                  </p>
                </div>
              </div>

              {/* Status Message */}
              <div className="px-4 py-2.5 border-b border-[#2C2C2E]">
                {isEditingStatusMsg ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={statusMessage}
                      onChange={(e) => setStatusMessage(e.target.value)}
                      placeholder="What's your status today?"
                      className="w-full bg-[#181819] border border-teams-purple text-xs text-white px-2 py-1 rounded focus:outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setIsEditingStatusMsg(false);
                      }}
                    />
                    <button
                      onClick={() => setIsEditingStatusMsg(false)}
                      className="p-1 text-emerald-400 hover:text-emerald-300"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingStatusMsg(true)}
                    className="w-full flex items-center justify-between text-[11px] text-teams-muted hover:text-white py-0.5 transition-colors group"
                  >
                    <span className="truncate italic">
                      {statusMessage ? `"${statusMessage}"` : 'Set status message'}
                    </span>
                    <Edit3 className="w-3 h-3 text-teams-muted group-hover:text-white shrink-0 ml-1" />
                  </button>
                )}
              </div>

              {/* Presence Selector */}
              <div className="p-3 border-b border-[#2C2C2E]">
                <p className="text-[10px] font-bold text-teams-muted uppercase tracking-wider mb-2 px-1">
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
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-[#2E2E32] text-white ring-1 ring-teams-purple/60 shadow-sm'
                            : 'text-[#C8C8CC] hover:bg-[#28282B] hover:text-white'
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
                  className="w-full px-3 py-2 text-xs text-[#E1E1E3] hover:bg-[#28282B] hover:text-white rounded-lg flex items-center gap-2.5 transition-colors font-semibold"
                >
                  <Settings className="w-4 h-4 text-teams-muted" />
                  <span>Profile & User Settings</span>
                </button>

                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    logout();
                    navigate('/login');
                  }}
                  className="w-full px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded-lg flex items-center gap-2.5 transition-colors font-semibold"
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
