import React, { useState, useEffect } from 'react';
import { Users, Star, Radio, ShieldOff, Search, PanelLeftClose, PanelLeft, MessageSquare, Phone, Video } from 'lucide-react';
import { User } from '../../types';
import { apiClient } from '../../api/client';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { UserAvatar } from '../../components/common/UserAvatar';

interface ContactsSidebarProps {
  activeFilter: 'all' | 'favorites' | 'online' | 'blocked';
  onSelectFilter: (filter: 'all' | 'favorites' | 'online' | 'blocked') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedContactId: string | null;
  onSelectContact: (contact: User) => void;
}

export const ContactsSidebar: React.FC<ContactsSidebarProps> = ({
  activeFilter,
  onSelectFilter,
  searchQuery,
  onSearchChange,
  selectedContactId,
  onSelectContact
}) => {
  const { isSidebarCollapsed, toggleSidebar, setActiveTab } = useUIStore();
  const { user: currentUser } = useAuthStore();
  const { initiateCall } = useCallStore();

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [favorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mc_favorite_contacts') || '[]'); } catch { return []; }
  });
  const [blocked] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mc_blocked_contacts') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        const res = await apiClient.get('/users');
        const data = Array.isArray(res.data) ? res.data : res.data.data || [];
        setUsers(data);
      } catch (err) {
        console.error('Fetch sidebar contacts error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const filteredUsers = users
    .filter((u) => u.id !== currentUser?.id)
    .filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        u.display_name?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    })
    .filter((u) => {
      if (activeFilter === 'favorites') return favorites.includes(u.id);
      if (activeFilter === 'online') return u.presence === 'available';
      if (activeFilter === 'blocked') return blocked.includes(u.id);
      return !blocked.includes(u.id);
    });

  const activeOnlineCount = users.filter((u) => u.id !== currentUser?.id && u.presence === 'available').length;

  const handleStartChat = async (targetUser: User, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await apiClient.post('/direct-conversations', { target_user_ids: [targetUser.id] });
      const conv = res.data.data || res.data;
      if (conv?.id) {
        setActiveTab('chat');
      }
    } catch (err) {
      console.error('Start chat error:', err);
      setActiveTab('chat');
    }
  };

  const handleStartCall = async (targetUser: User, type: 'audio' | 'video', e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await apiClient.post('/direct-conversations', { target_user_ids: [targetUser.id] });
      const conv = res.data.data || res.data;
      initiateCall(
        { id: targetUser.id, name: targetUser.display_name || targetUser.username, avatar: targetUser.avatar_url },
        type,
        conv?.id,
        false
      );
    } catch (err) {
      console.error('Start call error:', err);
      // Fallback: initiate call even if conversation fetch fails
      initiateCall(
        { id: targetUser.id, name: targetUser.display_name || targetUser.username, avatar: targetUser.avatar_url },
        type,
        undefined,
        false
      );
    }
  };

  return (
    <aside
      className={`bg-[#11131A] border-r border-white/5 flex flex-col h-full select-none transition-all duration-300 shrink-0 ${
        isSidebarCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Header with Expand/Collapse Toggle & Labeling */}
      <div className="h-12 border-b border-white/5 flex items-center justify-between px-3 shrink-0">
        {!isSidebarCollapsed && (
          <div className="flex items-center gap-2 font-bold text-xs text-white uppercase tracking-wide font-display truncate">
            <Users className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="truncate">Contacts</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className={`p-1.5 rounded-lg text-mc-muted hover:text-white hover:bg-white/5 transition-colors ${
            isSidebarCollapsed ? 'mx-auto' : ''
          }`}
          title={isSidebarCollapsed ? 'Expand Contacts Sidebar' : 'Collapse Sidebar'}
        >
          {isSidebarCollapsed ? <PanelLeft className="w-4 h-4 text-indigo-400" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Search Input Bar (Expanded) or Search Icon (Collapsed) */}
      <div className="p-2 border-b border-white/5 shrink-0">
        {isSidebarCollapsed ? (
          <div className="flex justify-center">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-xl text-mc-muted hover:text-white hover:bg-white/5 transition-colors"
              title="Search Contacts"
            >
              <Search className="w-4 h-4 text-mc-muted" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-mc-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search contacts..."
              className="w-full bg-[#171923] border border-white/10 rounded-lg pl-8 pr-2 py-1 text-[11px] text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Vertical Navigation Categories */}
      <div className="p-2 border-b border-white/5 space-y-1 shrink-0">
        {/* All Directory */}
        <button
          onClick={() => onSelectFilter('all')}
          className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition-all ${
            activeFilter === 'all'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
              : 'text-mc-muted hover:text-white hover:bg-white/5'
          }`}
          title="All Directory"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Users className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate font-display">All Directory</span>}
          </div>
          {!isSidebarCollapsed && (
            <span className="text-[10px] opacity-80 px-1.5 py-0.2 bg-black/20 rounded-full">
              {users.filter((u) => u.id !== currentUser?.id && !blocked.includes(u.id)).length}
            </span>
          )}
        </button>

        {/* Favorites */}
        <button
          onClick={() => onSelectFilter('favorites')}
          className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition-all ${
            activeFilter === 'favorites'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
              : 'text-mc-muted hover:text-white hover:bg-white/5'
          }`}
          title="Favorites"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Star className="w-4 h-4 text-amber-400 shrink-0 fill-amber-400/30" />
            {!isSidebarCollapsed && <span className="truncate font-display">Favorites</span>}
          </div>
          {!isSidebarCollapsed && (
            <span className="text-[10px] opacity-80 px-1.5 py-0.2 bg-black/20 rounded-full">
              {favorites.length}
            </span>
          )}
        </button>

        {/* Active Now */}
        <button
          onClick={() => onSelectFilter('online')}
          className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition-all ${
            activeFilter === 'online'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
              : 'text-mc-muted hover:text-white hover:bg-white/5'
          }`}
          title="Active Now"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate font-display">Active Now</span>}
          </div>
          {!isSidebarCollapsed && (
            <span className="text-[10px] opacity-80 px-1.5 py-0.2 bg-black/20 rounded-full">
              {activeOnlineCount}
            </span>
          )}
        </button>

        {/* Blocked */}
        <button
          onClick={() => onSelectFilter('blocked')}
          className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition-all ${
            activeFilter === 'blocked'
              ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md'
              : 'text-mc-muted hover:text-white hover:bg-white/5'
          }`}
          title="Blocked Contacts"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldOff className="w-4 h-4 text-rose-400 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate font-display">Blocked</span>}
          </div>
          {!isSidebarCollapsed && (
            <span className="text-[10px] opacity-80 px-1.5 py-0.2 bg-black/20 rounded-full">
              {blocked.length}
            </span>
          )}
        </button>
      </div>

      {/* Quick Contacts Vertical List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {!isSidebarCollapsed && (
          <p className="text-[10px] font-bold text-mc-muted uppercase tracking-wider px-2 py-1">
            People ({filteredUsers.length})
          </p>
        )}

        {isLoading ? (
          <div className="p-4 text-xs text-mc-muted animate-pulse text-center">Loading list...</div>
        ) : filteredUsers.length === 0 ? (
          !isSidebarCollapsed && <p className="text-xs text-mc-muted p-3 text-center">No contacts</p>
        ) : (
          filteredUsers.map((u) => {
            const isSelected = selectedContactId === u.id;
            return (
              <div
                key={u.id}
                onClick={() => onSelectContact(u)}
                className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition-all relative group ${
                  isSelected
                    ? 'bg-indigo-600/20 border border-indigo-500/40 text-white'
                    : 'text-mc-secondary hover:bg-white/5 hover:text-white'
                }`}
                title={u.display_name || u.username || u.email}
              >
                <UserAvatar
                  user={u}
                  avatarUrl={u.avatar_url}
                  name={u.display_name || u.username}
                  size="sm"
                  status={u.presence}
                />

                {!isSidebarCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-white truncate font-display">
                      {u.display_name || u.username}
                    </p>
                    <p className="text-[10px] text-mc-muted truncate">
                      {u.email}
                    </p>
                  </div>
                )}

                {!isSidebarCollapsed && (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                    <button
                      onClick={(e) => handleStartChat(u, e)}
                      className="p-1 hover:bg-indigo-600/30 text-indigo-400 rounded transition-colors"
                      title="Send DM"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleStartCall(u, 'audio', e)}
                      className="p-1 hover:bg-emerald-600/30 text-emerald-400 rounded transition-colors"
                      title="Audio Call"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleStartCall(u, 'video', e)}
                      className="p-1 hover:bg-violet-600/30 text-violet-400 rounded transition-colors"
                      title="Video Call"
                    >
                      <Video className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
