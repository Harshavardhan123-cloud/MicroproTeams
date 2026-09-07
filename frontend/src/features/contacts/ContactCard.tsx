import React from 'react';
import { MessageSquare, Phone, Video, Calendar, Star, ShieldOff } from 'lucide-react';
import { User } from '../../types';
import { UserAvatar } from '../../components/common/UserAvatar';

interface ContactCardProps {
  contact: User;
  isFavorite: boolean;
  isBlocked: boolean;
  onStartChat: (user: User) => void;
  onStartCall: (user: User, type: 'audio' | 'video') => void;
  onScheduleMeeting: (user: User) => void;
  onToggleFavorite: (userId: string) => void;
  onToggleBlock: (userId: string) => void;
}

export const ContactCard: React.FC<ContactCardProps> = ({
  contact,
  isFavorite,
  isBlocked,
  onStartChat,
  onStartCall,
  onScheduleMeeting,
  onToggleFavorite,
  onToggleBlock
}) => {
  const presenceColor =
    contact.presence === 'available'
      ? 'bg-emerald-500'
      : contact.presence === 'busy'
      ? 'bg-rose-500'
      : contact.presence === 'dnd'
      ? 'bg-rose-600'
      : contact.presence === 'away'
      ? 'bg-amber-500'
      : 'bg-slate-500';

  return (
    <div className={`bg-[#11131A] border rounded-2xl p-4 flex flex-col justify-between shadow-md transition-all hover:border-indigo-500/40 group ${
      isBlocked ? 'opacity-60 border-rose-500/20' : 'border-white/5'
    }`}>
      <div>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <UserAvatar
              user={contact}
              avatarUrl={contact.avatar_url}
              name={contact.display_name || contact.username || contact.email}
              size="lg"
              status={contact.presence}
            />
            <div>
              <h3 className="font-bold text-sm text-white font-display flex items-center gap-1.5">
                <span>{contact.display_name || contact.username}</span>
                {isFavorite && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />}
              </h3>
              <p className="text-[11px] text-mc-muted truncate max-w-[180px]">{contact.email}</p>
              {(contact.job_title || contact.department) && (
                <p className="text-[10px] text-indigo-400 font-medium mt-0.5">
                  {contact.job_title}{contact.job_title && contact.department ? ' • ' : ''}{contact.department}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => onToggleFavorite(contact.id)}
            className={`p-1.5 rounded-lg transition-colors ${
              isFavorite ? 'text-amber-400 bg-amber-400/10' : 'text-mc-muted hover:text-white hover:bg-white/5'
            }`}
            title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
          >
            <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400' : ''}`} />
          </button>
        </div>

        {contact.status_message && (
          <p className="text-[11px] text-mc-secondary bg-white/[0.03] p-2 rounded-xl mb-3 border border-white/5 italic">
            "{contact.status_message}"
          </p>
        )}
      </div>

      <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-1.5">
        <button
          onClick={() => onStartChat(contact)}
          className="flex-1 py-1.5 px-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
          title="Direct Message"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat</span>
        </button>

        <button
          onClick={() => onStartCall(contact, 'audio')}
          className="p-2 bg-white/5 hover:bg-emerald-600/20 text-mc-muted hover:text-emerald-400 border border-white/5 rounded-xl transition-all"
          title="Audio Call"
        >
          <Phone className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onStartCall(contact, 'video')}
          className="p-2 bg-white/5 hover:bg-indigo-600/20 text-mc-muted hover:text-indigo-400 border border-white/5 rounded-xl transition-all"
          title="Video Call"
        >
          <Video className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onScheduleMeeting(contact)}
          className="p-2 bg-white/5 hover:bg-violet-600/20 text-mc-muted hover:text-violet-400 border border-white/5 rounded-xl transition-all"
          title="Schedule Meeting"
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onToggleBlock(contact.id)}
          className={`p-2 rounded-xl transition-all ${
            isBlocked ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-white/5 text-mc-muted hover:text-rose-400 border border-white/5'
          }`}
          title={isBlocked ? 'Unblock Contact' : 'Block Contact'}
        >
          <ShieldOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
