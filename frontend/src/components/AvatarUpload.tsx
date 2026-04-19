import { useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/api';
import { UserAvatar } from './UserAvatar';

interface AvatarUploadProps {
  currentUrl?: string | null;
  name: string;
  role: 'athlete' | 'coach';
  onUpload: (url: string) => void;
}

export function AvatarUpload({ currentUrl, name, role, onUpload }: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const displayUrl = previewUrl ?? currentUrl;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Only JPG, PNG, or WebP images are supported');
      return;
    }

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = ev => setPreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    setSuccess(false);
    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const userId = freshSession?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw new Error(uploadErr.message);

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

      const endpoint = role === 'athlete' ? '/api/athlete/profile' : '/api/coach/profile';
      await apiFetch(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ avatar_url: publicUrl }),
      });

      setPreviewUrl(null);
      onUpload(publicUrl);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setPreviewUrl(null);
      setError(err.message || 'Upload failed — please try again');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Clickable avatar with hover overlay */}
      <div
        className="relative group cursor-pointer"
        onClick={() => !uploading && fileInputRef.current?.click()}
        title="Change profile photo"
      >
        <UserAvatar url={displayUrl} name={name} size="lg" />
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center transition-opacity duration-150 opacity-0 group-hover:opacity-100"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-white text-xs font-semibold">Change</span>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
        disabled={uploading}
      />

      <div className="text-center min-h-[16px]">
        {success && (
          <p className="text-xs font-medium" style={{ color: 'var(--color-accent)' }}>Photo updated!</p>
        )}
        {error && (
          <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>
        )}
        {!success && !error && (
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>JPG, PNG or WebP · max 5 MB</p>
        )}
      </div>
    </div>
  );
}
