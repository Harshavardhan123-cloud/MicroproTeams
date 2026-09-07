import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Plus, Maximize2, Search, Star, Archive, VolumeX, Pin, MoreVertical, CheckCheck, PanelLeftClose, PanelLeft } from 'lucide-react';
import { apiClient } from '../../api/client';
import { NewChatModal } from '../modals/NewChatModal';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useCallStore } from '../../stores/callStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useUIStore } from '../../stores/uiStore';
import { UserAvatar } from '../common/UserAvatar';

interface DirectMessageSidebarProps {
  selectedConvId: string | null;
  onSelectConversation: (convId: string) => void;
}

export const DirectMessageSidebar: React.FC<DirectMessageSidebarProps> = ({
  selectedConvId,
  onSelectConversation
}) => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'favorites' | 'archived'>('all');
  const [contextMenuConv, setContextMenuConv] = useState<any | null>(null);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });

  const { callState, canRejoin, setIsCallMinimized, rejoinLastCall } = useCallStore();
  const { unreadByConversation, incrementUnread, clearUnread } = useNotificationStore();
  const { isSidebarCollapsed, toggleSidebar } = useUIStore();

  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mc_fav_convs') || '[]'); } catch { return []; }
  });
  const [archived, setArchived] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mc_arch_convs') || '[]'); } catch { return []; }
  });
  const [muted, setMuted] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mc_muted_convs') || '[]'); } catch { return []; }
  });
  const [pinned, setPinned] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mc_pinned_convs') || '[]'); } catch { return []; }
  });

  const fetchConversations = async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get('/direct-conversations');
      setConversations(res.data.data || res.data);
    } catch (err) {
      console.error('Fetch DM conversations error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  const handleWSEvent = useCallback((event: any) => {
    if (event.type === 'direct_message.new' || event.type === 'message.new' || event.type === 'presence_update') {
      fetchConversations();
    }
  }, []);

  useWebSocket(undefined, handleWSEvent);

  if (isSidebarCollapsed) {
    return (
      <aside className="w-14 bg-[#11131A] border-r border-white/5 flex flex-col items-center py-3 select-none shrink-0 transition-all duration-300">
        <button
          onClick={toggleSidebar}
          className="p-2 text-indigo-400 hover:text-white hover:bg-white/10 rounded-xl transition-all mb-4 shadow-sm group"
          title="Expand Messages Sidebar"
        >
          <PanelLeft className="w-4 h-4 group-hover:scale-110 transition-transform" />
        </button>

        <button
          onClick={() => setIsModalOpen(true)}
          className="p-2 text-mc-secondary hover:text-white hover:bg-white/5 rounded-xl transition-colors mb-3"
          title="New Direct Message"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="w-8 h-px bg-white/10 mb-3" />

        <div className="flex-1 overflow-y-auto space-y-2 w-full px-1">
          {conversations.map((conv) => {
            const isSelected = selectedConvId === conv.id;
            const otherMember = conv.members?.find((m: any) => m.avatar_url) || conv.members?.[0];
            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all mx-auto relative ${
                  isSelected
                    ? 'ring-2 ring-indigo-500 bg-indigo-600/20'
                    : 'hover:bg-white/5'
                }`}
                title={conv.title}
              >
                <UserAvatar
                  user={otherMember}
                  avatarUrl={conv.avatar_url || otherMember?.avatar_url}
                  name={conv.title}
                  size="sm"
                  showStatus={true}
                  status={otherMember?.presence}
                />
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  const toggleFavorite = (convId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(convId) ? prev.filter((id) => id !== convId) : [...prev, convId];
      localStorage.setItem('mc_fav_convs', JSON.stringify(next));
      return next;
    });
  };

  const toggleArchive = (convId: string) => {
    setArchived((prev) => {
      const next = prev.includes(convId) ? prev.filter((id) => id !== convId) : [...prev, convId];
      localStorage.setItem('mc_arch_convs', JSON.stringify(next));
      return next;
    });
  };

  const toggleMute = (convId: string) => {
    setMuted((prev) => {
      const next = prev.includes(convId) ? prev.filter((id) => id !== convId) : [...prev, convId];
      localStorage.setItem('mc_muted_convs', JSON.stringify(next));
      return next;
    });
  };

  const togglePin = (convId: string) => {
    setPinned((prev) => {
      const next = prev.includes(convId) ? prev.filter((id) => id !== convId) : [...prev, convId];
      localStorage.setItem('mc_pinned_convs', JSON.stringify(next));
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, conv: any) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuConv(conv);
    setContextPos({ x: Math.min(e.clientX, window.innerWidth - 180), y: Math.min(e.clientY, window.innerHeight - 200) });
  };

  const filteredConversations = conversations
    .filter((conv) => {
      if (filter === 'archived') return archived.includes(conv.id);
      return !archived.includes(conv.id);
    })
    .filter((conv) => {
      if (filter === 'favorites') return favorites.includes(conv.id);
      if (filter === 'unread') return (unreadByConversation[conv.id] || 0) > 0;
      return true;
    })
    .filter((conv) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return conv.title?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aPinned = pinned.includes(a.id) ? 1 : 0;
      const bPinned = pinned.includes(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });

  return (
    <aside
      className="w-64 bg-[#11131A] border-r border-white/5 flex flex-col h-full select-none shrink-0"
      onClick={() => setContextMenuConv(null)}
    >
      {/* Header */}
      <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 font-bold text-xs text-white uppercase tracking-wide font-display">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          <span>Messages</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsModalOpen(true)}
            className="p-1 hover:bg-white/5 text-mc-secondary hover:text-white rounded-lg transition-colors"
            title="New Direct Message"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={toggleSidebar}
            className="p-1 hover:bg-white/5 text-mc-secondary hover:text-white rounded-lg transition-colors"
            title="Collapse Sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="p-2 border-b border-white/5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-mc-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full bg-[#171923] border border-white/10 rounded-lg pl-8 pr-2 py-1 text-[11px] text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Filter Category Pills */}
        <div className="flex items-center justify-between gap-1 mt-2">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition-all ${
              filter === 'all' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'text-mc-muted hover:text-white hover:bg-white/5'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition-all ${
              filter === 'unread' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'text-mc-muted hover:text-white hover:bg-white/5'
            }`}
          >
            Unread
          </button>
          <button
            onClick={() => setFilter('favorites')}
            className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition-all ${
              filter === 'favorites' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'text-mc-muted hover:text-white hover:bg-white/5'
            }`}
          >
            Favs
          </button>
          <button
            onClick={() => setFilter('archived')}
            className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition-all ${
              filter === 'archived' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'text-mc-muted hover:text-white hover:bg-white/5'
            }`}
          >
            Archive
          </button>
        </div>
      </div>

      {/* Ongoing Meeting Rejoin Banner */}
      {(callState === 'active' || canRejoin) && (
        <div className="mx-2 mt-2 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2 shadow-lg animate-in fade-in duration-300">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-[11px] text-emerald-400 truncate">Live Call</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (callState === 'active') {
                setIsCallMinimized(false);
              } else if (canRejoin) {
                rejoinLastCall();
              }
            }}
            className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shadow-md flex items-center gap-1 transition-all shrink-0"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Rejoin</span>
          </button>
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="p-4 text-xs text-mc-muted animate-pulse text-center">Loading chats...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-6 text-center text-mc-muted">
            <p className="text-xs mb-2">No chats found.</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-xs text-indigo-400 hover:underline font-semibold"
            >
              + Start a chat
            </button>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = selectedConvId === conv.id;
            const otherMember = conv.members?.find((m: any) => m.avatar_url) || conv.members?.[0];
            const unreadCount = unreadByConversation[conv.id] || 0;
            const isFav = favorites.includes(conv.id);
            const isPin = pinned.includes(conv.id);
            const isMut = muted.includes(conv.id);

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                onContextMenu={(e) => handleContextMenu(e, conv)}
                className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition-all relative group ${
                  isSelected 
                    ? 'bg-indigo-600/15 border border-indigo-500/30 text-white font-medium' 
                    : 'text-mc-secondary hover:bg-white/5 hover:text-white'
                }`}
              >
                <UserAvatar
                  user={otherMember}
                  avatarUrl={conv.avatar_url || otherMember?.avatar_url}
                  name={conv.title}
                  size="sm"
                  showStatus={true}
                  status={otherMember?.presence}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-xs text-white truncate font-display flex items-center gap-1">
                      {isPin && <Pin className="w-3 h-3 text-indigo-400 shrink-0" />}
                      <span className="truncate">{conv.title}</span>
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      {isFav && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                      {isMut && <VolumeX className="w-3 h-3 text-mc-muted" />}
                      {unreadCount > 0 && (
                        <span className="bg-indigo-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-sm">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-mc-muted truncate mt-0.5">
                    {conv.is_group ? 'Group Chat' : 'Direct Message'}
                  </p>
                </div>

                <button
                  onClick={(e) => handleContextMenu(e, conv)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-mc-muted hover:text-white rounded transition-opacity"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Context Menu */}
      {contextMenuConv && (
        <div
          style={{ top: contextPos.y, left: contextPos.x }}
          className="fixed z-[9999] w-48 bg-[#171923] border border-white/10 rounded-xl shadow-2xl p-1 text-xs text-white space-y-0.5 animate-in fade-in duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              if ((unreadByConversation[contextMenuConv.id] || 0) > 0) {
                clearUnread(contextMenuConv.id);
              } else {
                incrementUnread(contextMenuConv.id);
              }
              setContextMenuConv(null);
            }}
            className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2"
          >
            <CheckCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>{(unreadByConversation[contextMenuConv.id] || 0) > 0 ? 'Mark as Read' : 'Mark as Unread'}</span>
          </button>

          <button
            onClick={() => {
              toggleFavorite(contextMenuConv.id);
              setContextMenuConv(null);
            }}
            className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2"
          >
            <Star className="w-3.5 h-3.5 text-amber-400" />
            <span>{favorites.includes(contextMenuConv.id) ? 'Remove Favorite' : 'Add to Favorites'}</span>
          </button>

          <button
            onClick={() => {
              togglePin(contextMenuConv.id);
              setContextMenuConv(null);
            }}
            className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2"
          >
            <Pin className="w-3.5 h-3.5 text-indigo-400" />
            <span>{pinned.includes(contextMenuConv.id) ? 'Unpin Chat' : 'Pin Chat to Top'}</span>
          </button>

          <button
            onClick={() => {
              toggleMute(contextMenuConv.id);
              setContextMenuConv(null);
            }}
            className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2"
          >
            <VolumeX className="w-3.5 h-3.5 text-mc-muted" />
            <span>{muted.includes(contextMenuConv.id) ? 'Unmute Notifications' : 'Mute Notifications'}</span>
          </button>

          <button
            onClick={() => {
              toggleArchive(contextMenuConv.id);
              setContextMenuConv(null);
            }}
            className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2 text-rose-400 hover:text-rose-300"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>{archived.includes(contextMenuConv.id) ? 'Unarchive Chat' : 'Archive Chat'}</span>
          </button>
        </div>
      )}

      <NewChatModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectConversation={(convId) => {
          fetchConversations();
          onSelectConversation(convId);
        }}
      />
    </aside>
  );
};

