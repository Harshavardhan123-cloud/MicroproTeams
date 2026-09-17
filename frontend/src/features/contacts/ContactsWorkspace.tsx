import React, { useState, useEffect } from 'react';
import { Search, Users, Star, Radio, ShieldOff, RefreshCw, LayoutGrid, List, MessageSquare, Phone, Video, Calendar, Network } from 'lucide-react';
import { User } from '../../types';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useCallStore } from '../../stores/callStore';
import { ContactCard } from './ContactCard';
import { UserAvatar } from '../../components/common/UserAvatar';
import { ScheduleMeetingModal } from '../../components/modals/ScheduleMeetingModal';
import { OrganizationHierarchyView } from '../organization-hierarchy/OrganizationHierarchyView';

interface ContactsWorkspaceProps {
  externalFilter?: 'all' | 'hierarchy' | 'favorites' | 'online' | 'blocked';
  onFilterChange?: (filter: 'all' | 'hierarchy' | 'favorites' | 'online' | 'blocked') => void;
  externalSearch?: string;
  onSearchChange?: (q: string) => void;
  selectedContactId?: string | null;
  onSelectContact?: (id: string | null) => void;
}

export const ContactsWorkspace: React.FC<ContactsWorkspaceProps> = ({
  externalFilter,
  onFilterChange,
  externalSearch,
  onSearchChange,
  selectedContactId,
  onSelectContact
}) => {
  const { user: currentUser } = useAuthStore();
  const { setActiveTab } = useUIStore();
  const { initiateCall } = useCallStore();

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [internalSearch, setInternalSearch] = useState('');
  const [internalFilter, setInternalFilter] = useState<'all' | 'hierarchy' | 'favorites' | 'online' | 'blocked'>('all');
  const [viewLayout, setViewLayout] = useState<'list' | 'grid'>('list');

  const searchQuery = externalSearch !== undefined ? externalSearch : internalSearch;
  const activeFilter = externalFilter !== undefined ? externalFilter : internalFilter;

  const handleFilterClick = (filter: 'all' | 'hierarchy' | 'favorites' | 'online' | 'blocked') => {
    if (onFilterChange) onFilterChange(filter);
    else setInternalFilter(filter);
  };

  const handleSearchTyping = (val: string) => {
    if (onSearchChange) onSearchChange(val);
    else setInternalSearch(val);
  };

  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mc_favorite_contacts') || '[]'); } catch { return []; }
  });

  const [blocked, setBlocked] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mc_blocked_contacts') || '[]'); } catch { return []; }
  });

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedTargetUser, setSelectedTargetUser] = useState<User | null>(null);

  const fetchContacts = async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get('/users');
      const data = Array.isArray(res.data) ? res.data : res.data.data || [];
      setUsers(data);
    } catch (err) {
      console.error('Fetch contacts error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const toggleFavorite = (userId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId];
      localStorage.setItem('mc_favorite_contacts', JSON.stringify(next));
      return next;
    });
  };

  const toggleBlock = (userId: string) => {
    setBlocked((prev) => {
      const next = prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId];
      localStorage.setItem('mc_blocked_contacts', JSON.stringify(next));
      return next;
    });
  };

  const handleStartChat = async (targetUser: User) => {
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

  const handleStartCall = async (targetUser: User, type: 'audio' | 'video') => {
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

  const handleScheduleMeeting = (targetUser: User) => {
    setSelectedTargetUser(targetUser);
    setScheduleModalOpen(true);
  };

  const filteredContacts = users
    .filter((u) => u.id !== currentUser?.id)
    .filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        u.display_name?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.job_title?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    })
    .filter((u) => {
      if (activeFilter === 'favorites') return favorites.includes(u.id);
      if (activeFilter === 'online') return u.presence === 'available';
      if (activeFilter === 'blocked') return blocked.includes(u.id);
      return !blocked.includes(u.id);
    });

  return (
    <div className="flex-1 bg-slate-50 dark:bg-[#0B0D12] text-slate-800 dark:text-mc-text flex flex-col h-full select-none overflow-hidden">
      {/* Top Header Bar */}
      <div className="h-14 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#11131A] px-6 flex items-center justify-between shrink-0 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-slate-900 dark:text-white font-display">Contacts & Organization Directory</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Manage teammates, favorites & direct connectivity</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchTyping(e.target.value)}
              placeholder="Search contacts..."
              className="w-full bg-slate-100 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <button
            onClick={fetchContacts}
            className="p-2 bg-slate-100 dark:bg-[#171923] hover:bg-slate-200 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl transition-colors"
            title="Refresh Contacts List"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Navigation Tabs & Layout Switcher */}
      <div className="contacts-filter-bar px-6 py-2.5 flex items-center justify-between shrink-0 shadow-sm transition-colors">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleFilterClick('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all ${
              activeFilter === 'all'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 font-bold'
                : 'contacts-tab-btn-inactive hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <Users className={`w-3.5 h-3.5 ${activeFilter === 'all' ? 'text-white' : 'text-indigo-500 dark:text-indigo-400'}`} />
            <span>All Directory</span>
          </button>

          <button
            onClick={() => handleFilterClick('hierarchy')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all ${
              activeFilter === 'hierarchy'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 font-bold'
                : 'contacts-tab-btn-inactive hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <Network className={`w-3.5 h-3.5 ${activeFilter === 'hierarchy' ? 'text-white' : 'text-violet-500 dark:text-violet-400'}`} />
            <span>Org Hierarchy</span>
          </button>

          <button
            onClick={() => handleFilterClick('favorites')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all ${
              activeFilter === 'favorites'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 font-bold'
                : 'contacts-tab-btn-inactive hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${activeFilter === 'favorites' ? 'text-white fill-white' : 'text-amber-500 fill-amber-500/20'}`} />
            <span>Favorites ({favorites.length})</span>
          </button>

          <button
            onClick={() => handleFilterClick('online')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all ${
              activeFilter === 'online'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 font-bold'
                : 'contacts-tab-btn-inactive hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${activeFilter === 'online' ? 'text-white' : 'text-emerald-500'}`} />
            <span>Active Now</span>
          </button>

          <button
            onClick={() => handleFilterClick('blocked')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all ${
              activeFilter === 'blocked'
                ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/25 font-bold'
                : 'contacts-tab-btn-inactive hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <ShieldOff className={`w-3.5 h-3.5 ${activeFilter === 'blocked' ? 'text-white' : 'text-rose-500'}`} />
            <span>Blocked ({blocked.length})</span>
          </button>
        </div>

        {/* View Layout Switcher (Vertical List vs. Grid) */}
        {activeFilter !== 'hierarchy' && (
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 dark:bg-[#171923] p-1 border border-slate-200 dark:border-white/10 rounded-xl">
              <button
                onClick={() => setViewLayout('list')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewLayout === 'list'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Vertical List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewLayout('grid')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewLayout === 'grid'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            <span className="text-xs font-medium contacts-counter-text">
              Showing <strong className="font-bold text-indigo-600 dark:text-indigo-400">{filteredContacts.length}</strong> contact{filteredContacts.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {activeFilter === 'hierarchy' ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <OrganizationHierarchyView />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-[#11131A] border border-white/5 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-white/10 rounded-2xl bg-[#11131A]/40 max-w-lg mx-auto my-12">
              <Users className="w-10 h-10 text-mc-muted mb-3 opacity-60" />
              <h3 className="text-white font-bold text-sm mb-1 font-display">No Contacts Found</h3>
              <p className="text-xs text-mc-secondary max-w-sm mb-4">
                {searchQuery ? `No matches for "${searchQuery}" under ${activeFilter} filter.` : 'No contacts available in this category.'}
              </p>
            </div>
          ) : viewLayout === 'list' ? (
            /* Vertical Detailed Contacts Row View */
            <div className="space-y-2.5 max-w-5xl mx-auto">
              {filteredContacts.map((contact) => {
                const isFav = favorites.includes(contact.id);
                const isBlk = blocked.includes(contact.id);
                const isSelected = selectedContactId === contact.id;

                return (
                  <div
                    key={contact.id}
                    onClick={() => onSelectContact && onSelectContact(contact.id)}
                    className={`bg-white dark:bg-[#11131A] border rounded-2xl p-4 flex items-center justify-between transition-all hover:border-indigo-500/40 group shadow-sm ${
                      isSelected ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-600/10 shadow-md' : isBlk ? 'opacity-60 border-rose-500/20' : 'border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <UserAvatar
                        user={contact}
                        avatarUrl={contact.avatar_url}
                        name={contact.display_name || contact.username || contact.email}
                        size="md"
                        status={contact.presence}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display truncate">
                            {contact.display_name || contact.username}
                          </h3>
                          {isFav && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-mc-muted truncate">{contact.email}</p>
                        {(contact.job_title || contact.organization_unit_name || contact.department) && (
                          <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium mt-0.5 truncate flex items-center gap-1.5 flex-wrap">
                            {contact.job_title && <span>{contact.job_title}</span>}
                            {contact.job_title && (contact.organization_unit_name || contact.department) && <span>•</span>}
                            {(contact.organization_unit_name || contact.department) && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 text-[10px] font-semibold">
                                {contact.organization_unit_name || contact.department}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleStartChat(contact)}
                      className="py-1.5 px-3 bg-indigo-50 dark:bg-indigo-600/20 hover:bg-indigo-600 text-indigo-600 dark:text-indigo-300 hover:text-white border border-indigo-200 dark:border-indigo-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
                      title="Direct Message"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat</span>
                    </button>

                    <button
                      onClick={() => handleStartCall(contact, 'audio')}
                      className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-emerald-500/20 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-white/5 rounded-xl transition-all"
                      title="Audio Call"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleStartCall(contact, 'video')}
                      className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-indigo-500/20 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-white/5 rounded-xl transition-all"
                      title="Video Call"
                    >
                      <Video className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleScheduleMeeting(contact)}
                      className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-violet-500/20 text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 border border-slate-200 dark:border-white/5 rounded-xl transition-all"
                      title="Schedule Meeting"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => toggleFavorite(contact.id)}
                      className={`p-2 rounded-xl transition-colors ${
                        isFav ? 'text-amber-500 bg-amber-500/10 border border-amber-500/20' : 'text-slate-400 dark:text-slate-400 hover:text-amber-500 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5'
                      }`}
                      title={isFav ? 'Remove Favorite' : 'Add to Favorites'}
                    >
                      <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400' : ''}`} />
                    </button>

                    <button
                      onClick={() => toggleBlock(contact.id)}
                      className={`p-2 rounded-xl transition-all ${
                        isBlk ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30' : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-400 hover:text-rose-500 border border-slate-200 dark:border-white/5'
                      }`}
                      title={isBlk ? 'Unblock Contact' : 'Block Contact'}
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                isFavorite={favorites.includes(contact.id)}
                isBlocked={blocked.includes(contact.id)}
                onStartChat={handleStartChat}
                onStartCall={handleStartCall}
                onScheduleMeeting={handleScheduleMeeting}
                onToggleFavorite={toggleFavorite}
                onToggleBlock={toggleBlock}
              />
            ))}
          </div>
        )}
      </div>
      )}

      {/* Schedule Meeting Modal */}
      {scheduleModalOpen && (
        <ScheduleMeetingModal
          isOpen={scheduleModalOpen}
          onClose={() => {
            setScheduleModalOpen(false);
            setSelectedTargetUser(null);
          }}
          onSuccess={() => {
            setScheduleModalOpen(false);
            setSelectedTargetUser(null);
          }}
        />
      )}
    </div>
  );
};
