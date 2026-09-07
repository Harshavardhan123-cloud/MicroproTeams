import React, { useState, useEffect } from 'react';
import { Bell, MessageSquare, Phone, Filter, Smile, CheckCheck, Search, Video, ArrowRight, Trash2, Sparkles } from 'lucide-react';
import { useNotificationStore, ActivityNotificationItem } from '../../stores/notificationStore';
import { notificationService } from '../../services/notificationService';
import { useUIStore } from '../../stores/uiStore';

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Just now';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export const ActivityFeedWorkspace: React.FC = () => {
  const { notifications, setNotifications, markAllNotifsRead, clearAllNotifications, removeNotification } = useNotificationStore();
  const { setActiveTab } = useUIStore();

  const [filter, setFilter] = useState<'all' | 'unread' | 'chat' | 'call' | 'reaction'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchActivity = async () => {
    try {
      setIsLoading(true);
      const res = await notificationService.getNotifications();
      if (res.notifications && res.notifications.length > 0) {
        const formatted: ActivityNotificationItem[] = res.notifications.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          time: formatRelativeTime(n.created_at),
          unread: !n.is_read,
          type: n.type || 'system',
          created_at: n.created_at
        }));
        setNotifications(formatted);
      } else if (notifications.length === 0) {
        setNotifications([
          {
            id: 'demo-1',
            title: 'Ethan Hunt sent you a direct message',
            body: "Hey, let's review the security policy updates before the afternoon release.",
            time: '2m ago',
            unread: true,
            type: 'direct_message',
            created_at: new Date(Date.now() - 120000).toISOString()
          },
          {
            id: 'demo-2',
            title: 'Upcoming Standup Meeting in Engineering channel',
            body: 'Daily Engineering & Architecture Standup begins in 15 minutes.',
            time: '15m ago',
            unread: true,
            type: 'meeting',
            created_at: new Date(Date.now() - 900000).toISOString()
          },
          {
            id: 'demo-3',
            title: 'Admin Alex Vance updated workspace policies',
            body: 'Data governance & retention policies updated for Acme Corp organization.',
            time: '1h ago',
            unread: true,
            type: 'system',
            created_at: new Date(Date.now() - 3600000).toISOString()
          }
        ]);
      }
    } catch (err) {
      console.error('Fetch activity feed error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
  }, []);

  const handleMarkAllRead = async () => {
    markAllNotifsRead();
    try {
      await notificationService.markAsRead(true);
    } catch (err) {
      console.error('Error marking all read:', err);
    }
  };

  const filteredNotifications = notifications.filter((item) => {
    if (filter === 'unread' && !item.unread) return false;
    if (filter === 'chat' && item.type !== 'direct_message' && item.type !== 'chat') return false;
    if (filter === 'call' && item.type !== 'call' && item.type !== 'incoming_call' && item.type !== 'meeting') return false;
    if (filter === 'reaction' && item.type !== 'reaction') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = item.title.toLowerCase().includes(q);
      const bodyMatch = item.body?.toLowerCase().includes(q);
      return titleMatch || bodyMatch;
    }
    return true;
  });

  const getIconForType = (type: string) => {
    switch (type) {
      case 'direct_message':
      case 'chat':
        return <MessageSquare className="w-4 h-4 text-indigo-400" />;
      case 'incoming_call':
      case 'call':
        return <Phone className="w-4 h-4 text-emerald-400" />;
      case 'meeting':
        return <Video className="w-4 h-4 text-amber-400" />;
      case 'reaction':
        return <Smile className="w-4 h-4 text-rose-400" />;
      default:
        return <Bell className="w-4 h-4 text-violet-400" />;
    }
  };

  return (
    <div className="flex-1 bg-[#0B0D12] text-mc-text flex flex-col h-full overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-14 border-b border-white/5 bg-[#11131A] px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-mc-text font-display flex items-center gap-2">
              <span className="mc-header-title-gradient font-bold">
                Activity Stream & Notifications
              </span>
              <span className="badge-gradient text-[10px] px-2.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold uppercase shadow-sm flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-white" /> Real-Time
              </span>
            </h1>
            <p className="text-[11px] text-mc-muted">Direct Messages, Calls, Mentions & Workspace Events</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleMarkAllRead}
            className="px-3.5 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-300 text-xs font-semibold rounded-xl border border-indigo-500/20 flex items-center gap-2 transition-all active:scale-95"
          >
            <CheckCheck className="w-3.5 h-3.5 text-indigo-500" />
            <span>Mark All Read</span>
          </button>
          <button
            onClick={clearAllNotifications}
            className="px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded-xl border border-rose-500/20 flex items-center gap-2 transition-all active:scale-95"
            title="Clear all notifications"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            <span>Clear All</span>
          </button>
        </div>
      </div>

      {/* Sub Filter & Search Bar */}
      <div className="px-8 border-b border-white/5 bg-[#11131A] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          {[
            { id: 'all', label: 'All Activity', icon: Bell },
            { id: 'unread', label: 'Unread Only', icon: Filter },
            { id: 'chat', label: 'Chats & DMs', icon: MessageSquare },
            { id: 'call', label: 'Calls & Meetings', icon: Phone },
            { id: 'reaction', label: 'Reactions', icon: Smile }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                  isActive
                    ? 'border-indigo-500 text-indigo-500 font-bold'
                    : 'border-transparent text-mc-muted hover:text-mc-text'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-64 my-2">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-mc-muted" />
          <input
            type="text"
            placeholder="Search activity feed..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#171923] border border-white/10 text-mc-text text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* Activity Feed List */}
      <div className="flex-1 p-8 overflow-y-auto bg-[#0B0D12]">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600/20 to-violet-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <Bell className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-mc-text font-display">No Activity Found</h3>
            <p className="text-xs text-mc-secondary max-w-sm">
              Incoming direct messages, call invites, reactions, and workspace updates will appear here.
            </p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-3">
            {filteredNotifications.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-2xl transition-all flex items-start justify-between gap-4 shadow-lg ${
                  item.unread ? 'activity-card-unread' : 'activity-card-read'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600/20 to-violet-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                    {getIconForType(item.type)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-mc-text font-display truncate">{item.title}</h4>
                      {item.unread && (
                        <span className="badge-gradient px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 text-[9px] font-bold text-white uppercase shadow-md shadow-indigo-600/30">
                          New
                        </span>
                      )}
                    </div>
                    {item.body && (
                      <p className="text-xs text-mc-secondary mt-1 leading-relaxed line-clamp-2">
                        {item.body}
                      </p>
                    )}
                    <span className="text-[10px] text-mc-muted mt-1.5 block font-mono">
                      {formatRelativeTime(item.created_at || new Date().toISOString())}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.type === 'direct_message' || item.type === 'chat' ? (
                    <button
                      onClick={() => setActiveTab('chat')}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <span>Open Chat</span>
                      <ArrowRight className="w-3 h-3 text-white" />
                    </button>
                  ) : item.type === 'incoming_call' || item.type === 'meeting' || item.type === 'call' ? (
                    <button
                      onClick={() => setActiveTab('calls')}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <Phone className="w-3 h-3 text-white" />
                      <span>Join Call</span>
                    </button>
                  ) : null}

                  <button
                    onClick={() => removeNotification(item.id)}
                    className="p-1.5 text-mc-muted hover:text-rose-500 hover:bg-rose-500/10 rounded-xl border border-transparent hover:border-rose-500/20 transition-all"
                    title="Clear notification"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
