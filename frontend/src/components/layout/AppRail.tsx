import React from 'react';
import { 
  Bell, 
  MessageSquare, 
  Users, 
  Calendar, 
  PhoneCall, 
  Folder, 
  ShieldCheck, 
  Settings
} from 'lucide-react';
import { useUIStore, AppRailTab } from '../../stores/uiStore';
import { useNotificationStore } from '../../stores/notificationStore';

export const AppRail: React.FC = () => {
  const { activeTab, setActiveTab, setUserSettingsOpen } = useUIStore();
  const { unreadChatCount } = useNotificationStore();

  const navItems: { id: AppRailTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'activity', label: 'Activity', icon: Bell },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'teams', label: 'Teams', icon: Users },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'calls', label: 'Calls', icon: PhoneCall },
    { id: 'files', label: 'Files', icon: Folder },
    { id: 'admin', label: 'Admin', icon: ShieldCheck },
  ];

  return (
    <aside className="w-16 bg-[#201F1F] border-r border-teams-border flex flex-col justify-between items-center py-3 select-none z-20 shrink-0">
      <div className="flex flex-col items-center gap-1 w-full">
        {/* Teams Branding Logo */}
        <div className="w-10 h-10 rounded-lg bg-teams-purple flex items-center justify-center font-bold text-white mb-3 shadow-md">
          T
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isChatTab = item.id === 'chat';

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full py-2.5 flex flex-col items-center gap-1 relative group transition-colors ${
                isActive ? 'text-teams-purple font-semibold' : 'text-teams-muted hover:text-white'
              }`}
            >
              {/* Active Bar Indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-teams-purple rounded-r-md" />
              )}
              
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? 'text-teams-purple' : ''}`} />
                {/* Chat Unread Badge Notification */}
                {isChatTab && unreadChatCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-rose-600 border border-[#201F1F] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                    {unreadChatCount > 9 ? '9+' : unreadChatCount}
                  </span>
                )}
              </div>

              <span className="text-[10px] tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2">
        <button 
          onClick={() => setUserSettingsOpen(true)} 
          className="p-2 text-teams-muted hover:text-white transition-colors"
          title="User Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};
