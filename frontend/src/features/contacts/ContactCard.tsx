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
    <div className={`bg-white dark:bg-[#11131A] border rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-all hover:border-indigo-500/40 group ${
      isBlocked ? 'opacity-60 border-rose-500/20' : 'border-slate-200 dark:border-white/5'
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
              <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display flex items-center gap-1.5">
                <span>{contact.display_name || contact.username}</span>
                {isFavorite && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />}
              </h3>
              {(contact.job_title || contact.organization_unit_name || contact.department) && (
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                  {contact.job_title && <span>{contact.job_title}</span>}
                  {contact.job_title && (contact.organization_unit_name || contact.department) && <span>•</span>}
                  {(contact.organization_unit_name || contact.department) && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 text-[9px] font-semibold">
                      {contact.organization_unit_name || contact.department}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => onToggleFavorite(contact.id)}
            className={`p-1.5 rounded-lg transition-colors ${
              isFavorite ? 'text-amber-500 bg-amber-500/10' : 'text-slate-400 dark:text-mc-muted hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
            title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
          >
            <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400' : ''}`} />
          </button>
        </div>

        {contact.status_message && (
          <p className="text-[11px] text-slate-600 dark:text-mc-secondary bg-slate-50 dark:bg-white/[0.03] p-2 rounded-xl mb-3 border border-slate-200 dark:border-white/5 italic">
            "{contact.status_message}"
          </p>
        )}
      </div>

      <div className="pt-3 border-t border-slate-200 dark:border-white/5 flex items-center justify-between gap-1.5">
        <button
          onClick={() => onStartChat(contact)}
          className="flex-1 py-1.5 px-2 bg-indigo-50 dark:bg-indigo-600/20 hover:bg-indigo-600 text-indigo-600 dark:text-indigo-300 hover:text-white border border-indigo-200 dark:border-indigo-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
          title="Direct Message"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat</span>
        </button>

        <button
          onClick={() => onStartCall(contact, 'audio')}
          className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-emerald-500/20 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-white/5 rounded-xl transition-all"
          title="Audio Call"
        >
          <Phone className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onStartCall(contact, 'video')}
          className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-indigo-500/20 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-white/5 rounded-xl transition-all"
          title="Video Call"
        >
          <Video className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onScheduleMeeting(contact)}
          className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-violet-500/20 text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 border border-slate-200 dark:border-white/5 rounded-xl transition-all"
          title="Schedule Meeting"
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onToggleBlock(contact.id)}
          className={`p-2 rounded-xl transition-all ${
            isBlocked ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30' : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-400 hover:text-rose-500 border border-slate-200 dark:border-white/5'
          }`}
          title={isBlocked ? 'Unblock Contact' : 'Block Contact'}
        >
          <ShieldOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
