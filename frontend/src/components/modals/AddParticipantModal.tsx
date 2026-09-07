import React, { useState, useEffect } from 'react';
import { UserPlus, Search, X, Check, Mail, Copy, PhoneCall, Sparkles } from 'lucide-react';
import { apiClient } from '../../api/client';
import { wsService } from '../../services/websocketService';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { UserAvatar } from '../common/UserAvatar';

interface UserContact {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  job_title?: string;
  department?: string;
  presence?: string;
}

interface AddParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string | null;
  callType?: 'video' | 'audio';
}

export const AddParticipantModal: React.FC<AddParticipantModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  callType = 'video'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<UserContact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());
  const [copiedLink, setCopiedLink] = useState(false);

  const { user: currentUser } = useAuthStore();

  const fetchContacts = async (query = '') => {
    try {
      setIsLoading(true);
      const url = query ? `/users?q=${encodeURIComponent(query)}` : '/users';
      const res = await apiClient.get(url);
      const data: UserContact[] = res.data.data || res.data || [];
      if (Array.isArray(data)) {
        setContacts(data.filter((u: UserContact) => u.id !== currentUser?.id));
      }
    } catch (err) {
      console.error('Failed to fetch user contacts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchContacts(searchQuery);
    }
  }, [isOpen, searchQuery]);

  if (!isOpen) return null;

  const handleInviteUser = (contact: UserContact) => {
    const currentCallId = useCallStore.getState().callId;
    const targetRoom = conversationId || currentCallId || 'direct-call-room';

    // Dispatch real-time WebSocket invitation signal to target user ID
    wsService.send({
      type: 'call_upgrade_group',
      conversation_id: targetRoom,
      channel_id: targetRoom
    });

    wsService.send({
      type: 'call_invite',
      target_user_id: contact.id,
      caller_name: currentUser?.display_name || currentUser?.username || 'Teammate',
      caller_id: currentUser?.id,
      call_type: callType,
      conversation_id: targetRoom,
      call_id: targetRoom,
      is_group_call: true
    });

    useCallStore.setState({ isGroupCall: true, conversationId: targetRoom });
    setInvitedUserIds(prev => new Set(prev).add(contact.id));

    // 20-second timeout to revert "Ringing..." back to "Request to Join"
    setTimeout(() => {
      setInvitedUserIds(prev => {
        const next = new Set(prev);
        next.delete(contact.id);
        return next;
      });
    }, 20000);
  };

  const handleCopyLink = () => {
    const currentCallId = useCallStore.getState().callId;
    const targetRoom = conversationId || currentCallId || 'direct-call-room';
    const meetingLink = `${window.location.origin}/#/meet/${targetRoom}`;
    navigator.clipboard.writeText(meetingLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999999] p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#1E1E22] border border-teams-purple/40 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-0 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-[#25252A] border-b border-[#323238] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teams-purple/20 border border-teams-purple/40 flex items-center justify-center text-teams-purple">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Add Participants to Meeting</h3>
              <p className="text-xs text-teams-muted">Invite teammates by email address or contact name</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-teams-muted hover:text-white rounded-lg hover:bg-[#323238] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 flex-1 overflow-y-auto min-h-0">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-teams-muted absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email (e.g. alice@micropro.com)..."
              className="w-full bg-[#141416] border border-[#323238] focus:border-teams-purple rounded-xl pl-10 pr-4 py-2.5 text-xs text-white outline-none transition-colors"
            />
          </div>

          {/* Copy Meeting Link Action Card */}
          <div className="bg-[#141416] p-3.5 rounded-xl border border-teams-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-white">Meeting Invite Link</div>
                <div className="text-[10px] text-teams-muted">Share direct link with external participants</div>
              </div>
            </div>
            <button
              onClick={handleCopyLink}
              className="px-3 py-1.5 rounded-lg bg-teams-purple/20 hover:bg-teams-purple/30 border border-teams-purple/40 text-teams-accent text-xs font-bold transition-all flex items-center gap-1.5"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>

          {/* Contact List Header */}
          <div className="text-[11px] font-bold text-teams-purple uppercase tracking-wider px-1 pt-2">
            Teammates & Contacts ({contacts.length})
          </div>

          {/* Contact List */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-teams-muted animate-pulse">
                Searching organization directory...
              </div>
            ) : contacts.length === 0 ? (
              <div className="py-8 text-center text-xs text-teams-muted space-y-1">
                <Mail className="w-8 h-8 opacity-40 mx-auto mb-2" />
                <p className="font-bold text-white">No matching users found</p>
                <p className="text-[11px]">Try typing a different email address or display name</p>
              </div>
            ) : (
              contacts.map(contact => {
                const isInvited = invitedUserIds.has(contact.id);
                return (
                  <div
                    key={contact.id}
                    className="bg-[#151518] hover:bg-[#1A1A1E] p-3 rounded-xl border border-[#2D2D33] flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        user={contact}
                        avatarUrl={contact.avatar_url}
                        name={contact.display_name || contact.email}
                        size="md"
                      />
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>{contact.display_name || contact.email}</span>
                          {contact.presence === 'online' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400" title="Online" />
                          )}
                        </div>
                        <div className="text-[11px] text-teams-muted flex items-center gap-2 mt-0.5">
                          <span>{contact.email}</span>
                          {contact.job_title && (
                            <>
                              <span>•</span>
                              <span>{contact.job_title}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleInviteUser(contact)}
                      disabled={isInvited}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md ${
                        isInvited
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default'
                          : 'bg-teams-purple hover:bg-teams-purple-hover text-white active:scale-95'
                      }`}
                    >
                      {isInvited ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Ringing...</span>
                        </>
                      ) : (
                        <>
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>Request to Join</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#18181A] border-t border-[#2A2A2E] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-teams-muted">
            Invited users will receive an instant ring notification to join
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-[#2A2A30] hover:bg-[#32323A] rounded-xl transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
