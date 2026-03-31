import { useState } from 'react';

const SIZE_PX:   Record<string, number> = { sm: 28, md: 40, lg: 80 };
const FONT_SIZE: Record<string, number> = { sm: 10, md: 14, lg: 28 };

interface UserAvatarProps {
  url?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function UserAvatar({ url, name, size = 'md', className = '' }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const px   = SIZE_PX[size];
  const font = FONT_SIZE[size];
  const initial = (name || 'A').charAt(0).toUpperCase();

  if (url && !imgError) {
    return (
      <img
        src={url}
        alt={name}
        onError={() => setImgError(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: px, height: px, border: '1.5px solid rgba(0,229,160,0.30)' }}
      />
    );
  }

  return (
    <div
      className={`shrink-0 flex items-center justify-center font-bold select-none rounded-full ${className}`}
      style={{
        width: px, height: px,
        background: 'rgba(0,229,160,0.15)',
        border: '1.5px solid rgba(0,229,160,0.25)',
        color: '#00E5A0',
        fontSize: font,
      }}
    >
      {initial}
    </div>
  );
}
