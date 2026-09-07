import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, 
  MessageSquare,
  Users,
  Hash, 
  Calendar, 
  Video, 
  Folder, 
  ShieldCheck, 
  Settings,
  LogOut
} from 'lucide-react';
import { useUIStore, AppRailTab } from '../../stores/uiStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useAuthStore } from '../../stores/authStore';
import { MicroproLogo } from '../common/MicroproLogo';
import { useNavigate } from 'react-router-dom';

export const AppRail: React.FC = () => {
  const { activeTab, setActiveTab, setUserSettingsOpen, isAppRailExpanded, toggleAppRail } = useUIStore();
  const { unreadChatCount } = useNotificationStore();
  const { user, logout } = useAuthStore();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const isAdmin = user?.is_admin || user?.is_superuser || user?.role === 'ORG_ADMIN' || user?.role === 'ADMIN';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems: { id: AppRailTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'activity', label: 'Activity', icon: Bell },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'teams', label: 'Channels', icon: Hash },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'calls', label: 'Meetings', icon: Video },
    { id: 'files', label: 'Files', icon: Folder },
    ...(isAdmin ? [{ id: 'admin' as AppRailTab, label: 'Admin', icon: ShieldCheck }] : []),
  ];

  return (
    <aside
      className={`bg-[#0B0D12]/95 backdrop-blur-xl border-r border-white/[0.06] flex flex-col justify-between py-3 select-none z-20 shrink-0 transition-all duration-300 shadow-[4px_0_24px_rgba(0,0,0,0.4)] ${
        isAppRailExpanded ? 'w-[210px] px-3' : 'w-[70px] items-center px-1'
      }`}
    >
      <div className="flex flex-col gap-3 w-full">
        {/* Header & Logo - Clicking Logo Toggles Expand / Collapse */}
        <div
          onClick={toggleAppRail}
          className={`flex items-center gap-2.5 cursor-pointer group mb-2 p-1.5 rounded-2xl hover:bg-white/[0.04] transition-all duration-300 ${
            isAppRailExpanded ? 'px-2' : 'justify-center'
          }`}
          title={isAppRailExpanded ? 'Click to collapse navigation (Ctrl+B)' : 'Click to expand navigation (Ctrl+B)'}
        >
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500/20 via-purple-500/15 to-cyan-500/20 border border-indigo-500/40 p-1.5 shadow-lg shadow-indigo-600/25 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:border-indigo-400 transition-all duration-300">
            <MicroproLogo className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(99,102,241,0.5)]" />
            <div className="absolute inset-0 rounded-xl bg-indigo-500/10 blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {isAppRailExpanded && (
            <div className="flex flex-col min-w-0">
              <span className="font-black text-xs text-white tracking-tight font-display whitespace-nowrap bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
                Micropro
              </span>
              <span className="text-[10px] text-indigo-400 font-semibold tracking-wider uppercase -mt-0.5">
                Commute Studio
              </span>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <div className="space-y-1 w-full">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isChatTab = item.id === 'chat';

            if (isAppRailExpanded) {
              /* Expanded Wide Row Button */
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 relative group ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600/25 via-violet-600/20 to-transparent text-white border border-indigo-500/40 shadow-sm shadow-indigo-500/10'
                      : 'text-mc-secondary hover:text-white hover:bg-white/[0.05] border border-transparent'
                  }`}
                  title={`${item.label} (Ctrl+${index + 1})`}
                >
                  {/* Active Indicator Strip */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-gradient-to-b from-cyan-400 via-indigo-500 to-violet-500 rounded-r-full shadow-[0_0_12px_rgba(99,102,241,0.8)]" />
                  )}

                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-cyan-300 filter drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : ''}`} />
                    <span className="truncate font-display leading-none">{item.label}</span>
                  </div>

                  {/* Chat Unread Badge Notification */}
                  {isChatTab && unreadChatCount > 0 && (
                    <span className="bg-gradient-to-r from-rose-500 to-pink-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full shadow-lg shadow-rose-500/30 animate-pulse">
                      {unreadChatCount > 9 ? '9+' : unreadChatCount}
                    </span>
                  )}
                </button>
              );
            }

            /* Collapsed Compact Icon Button */
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center relative group transition-all duration-200 mx-auto ${
                  isActive 
                    ? 'bg-gradient-to-b from-indigo-600/30 via-violet-600/20 to-indigo-900/20 text-white font-semibold shadow-inner ring-1 ring-indigo-500/50 shadow-[0_0_16px_rgba(99,102,241,0.25)]' 
                    : 'text-mc-secondary hover:text-white hover:bg-white/[0.05]'
                }`}
                title={`${item.label} (Ctrl+${index + 1})`}
              >
                {/* Active Indicator Bar */}
                {isActive && (
                  <div className="absolute -left-[6px] top-1/2 -translate-y-1/2 w-1.5 h-6 bg-gradient-to-b from-cyan-400 via-indigo-500 to-violet-500 rounded-r-full shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
                )}
                
                <div className="relative">
                  <Icon className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-cyan-300 filter drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]' : ''}`} />
                  {/* Chat Unread Badge Notification */}
                  {isChatTab && unreadChatCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-gradient-to-r from-rose-500 to-pink-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/40 animate-pulse">
                      {unreadChatCount > 9 ? '9+' : unreadChatCount}
                    </span>
                  )}
                </div>

                <span className="text-[9px] tracking-tight mt-0.5 opacity-80 font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="w-full pt-2 border-t border-white/[0.06]">
        {/* Settings Button */}
        <button 
          onClick={() => setUserSettingsOpen(true)} 
          className={`rounded-xl flex items-center text-mc-secondary hover:text-white hover:bg-white/[0.06] transition-all group ${
            isAppRailExpanded ? 'w-full px-3 py-2 text-xs font-semibold gap-3' : 'w-11 h-11 justify-center mx-auto'
          }`}
          title="Preferences & Studio Settings (Ctrl+,)"
        >
          <Settings className="w-4 h-4 shrink-0 group-hover:rotate-90 transition-transform duration-300 text-mc-secondary group-hover:text-indigo-400" />
          {isAppRailExpanded && <span className="font-display truncate">Studio Settings</span>}
        </button>
      </div>
    </aside>
  );
};
