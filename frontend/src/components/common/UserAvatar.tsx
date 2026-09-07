import React, { useState, useEffect } from 'react';

interface UserAvatarProps {
  user?: {
    display_name?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
    email?: string;
    avatar_url?: string;
    presence?: string;
    is_online?: boolean;
  } | null;
  name?: string;
  avatarUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'custom';
  className?: string;
  showStatus?: boolean;
  status?: string;
}

const SIZE_CLASSES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
  '2xl': 'w-20 h-20 text-2xl',
  custom: ''
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  name,
  avatarUrl,
  size = 'md',
  className = '',
  showStatus,
  status
}) => {
  const [imgError, setImgError] = useState(false);

  const effectiveAvatar = avatarUrl || user?.avatar_url;
  const displayName = name || user?.display_name || user?.username || user?.email || 'User';
  const initial = displayName.charAt(0).toUpperCase() || 'U';

  const presenceStatus = status || user?.presence || 'offline';

  useEffect(() => {
    setImgError(false);
  }, [effectiveAvatar]);

  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  const isOnline = presenceStatus === 'available' || presenceStatus === 'online';
  const isBusy = presenceStatus === 'busy' || presenceStatus === 'dnd';
  const isAway = presenceStatus === 'away';

  const statusDotClass = isOnline
    ? 'bg-emerald-500'
    : isBusy
    ? 'bg-rose-500'
    : isAway
    ? 'bg-amber-500'
    : 'hidden'; // Hide status dot when offline

  return (
    <div className={`relative shrink-0 ${sizeClass} ${className}`}>
      {effectiveAvatar && !imgError ? (
        <img
          src={effectiveAvatar}
          alt={displayName}
          onError={() => setImgError(true)}
          className="w-full h-full rounded-full object-cover shadow-md ring-1 ring-white/10"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-gradient-to-tr from-indigo-600 via-violet-600 to-purple-700 flex items-center justify-center font-bold text-white uppercase shadow-md ring-1 ring-white/10">
          <span>{initial}</span>
        </div>
      )}

      {showStatus && statusDotClass !== 'hidden' && (
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#0B0D12] ${statusDotClass}`}
        />
      )}
    </div>
  );
};
