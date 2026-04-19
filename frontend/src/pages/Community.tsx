import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Spinner, Input } from '../components/ui';
import { UserAvatar } from '../components/UserAvatar';

// ── Constants ─────────────────────────────────────────────────────────────────
const POST_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  activity:    { label: 'Activity',    color: '#60A5FA', bg: 'rgba(96,165,250,0.12)' },
  race_result: { label: 'Race Result', color: '#FCD34D', bg: 'rgba(252,211,77,0.12)' },
  milestone:   { label: 'Milestone',   color: '#C084FC', bg: 'rgba(192,132,252,0.12)' },
  manual:      { label: 'Post',        color: '#9CA3AF', bg: 'rgba(156,163,175,0.10)' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function uploadCommunityImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `community/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('community-images').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  const { data } = supabase.storage.from('community-images').getPublicUrl(path);
  return data.publicUrl;
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function CommentIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
function DotsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  );
}


// ── ActionBtn ─────────────────────────────────────────────────────────────────
function ActionBtn({ children, onClick, active, disabled, title }: {
  children: React.ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean; title?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150"
      style={{
        color: active ? '#00E5A0' : hov ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
        background: active ? 'rgba(0,229,160,0.10)' : hov ? 'var(--color-bg-hover)' : 'transparent',
        border: 'none', cursor: disabled ? 'default' : 'pointer',
      }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
    >
      {children}
    </button>
  );
}

// ── Post Menu (three-dot) ─────────────────────────────────────────────────────
function PostMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <ActionBtn onClick={() => setOpen(o => !o)} active={open}><DotsIcon /></ActionBtn>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 py-1 rounded-xl overflow-hidden"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-light)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: 130 }}>
          <button type="button" className="w-full text-left px-4 py-2.5 text-sm transition-colors"
            style={{ color: 'var(--color-text-primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            onClick={() => { setOpen(false); onEdit(); }}>
            Edit
          </button>
          <button type="button" className="w-full text-left px-4 py-2.5 text-sm transition-colors"
            style={{ color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.10)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            onClick={() => { setOpen(false); onDelete(); }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Comment Thread ────────────────────────────────────────────────────────────
function CommentThread({ postId, onCommentAdded }: { postId: string; onCommentAdded?: () => void }) {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch(`/api/community/posts/${postId}/comments`)
      .then(setComments).catch(() => {}).finally(() => { setLoading(false); inputRef.current?.focus(); });
  }, [postId]);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const c = await apiFetch(`/api/community/posts/${postId}/comments`, {
        method: 'POST', body: JSON.stringify({ content: trimmed }),
      });
      setComments(prev => [...prev, c]);
      onCommentAdded?.();
      setText('');
    } catch {}
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)' }}>
      <div className="px-5 pt-3 pb-4">
        {loading ? (
          <div className="flex justify-center py-3"><Spinner /></div>
        ) : comments.length === 0 ? (
          <p className="text-xs py-2 text-center" style={{ color: 'var(--color-text-tertiary)' }}>No comments yet. Be the first.</p>
        ) : (
          <div className="space-y-3 mb-3">
            {comments.map(c => (
              <div key={c.id} className="flex gap-2.5 items-start">
                <UserAvatar name={c.author_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{c.author_name}</span>
                    {c.author_type === 'coach' && (
                      <span className="text-[9px] font-bold px-1.5 rounded-full"
                        style={{ background: 'rgba(0,229,160,0.12)', color: '#00E5A0', border: '1px solid rgba(0,229,160,0.25)' }}>
                        Coach
                      </span>
                    )}
                    <span className="text-[10px] ml-auto" style={{ color: 'var(--color-text-tertiary)' }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-xs leading-relaxed mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Comment input */}
        <div className="flex gap-2 items-center mt-2">
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Add a comment…"
            maxLength={500}
            className="flex-1 text-xs outline-none transition-all"
            style={{
              background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
              borderRadius: 20, padding: '7px 14px', color: 'var(--color-text-primary)',
            }}
            onFocus={e => { (e.target as HTMLElement).style.borderColor = '#00E5A0'; }}
            onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--color-border)'; }}
          />
          <button type="button" onClick={submit} disabled={submitting || !text.trim()}
            className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
            style={{
              background: text.trim() ? '#00E5A0' : 'var(--color-bg-hover)',
              color: text.trim() ? '#000' : 'var(--color-text-tertiary)',
              border: 'none', cursor: text.trim() ? 'pointer' : 'default',
            }}>
            {submitting ? '…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Post Card ─────────────────────────────────────────────────────────────────
function PostCard({
  post, currentProfileId, currentRole, onKudo, onDelete, onEdit, onOpen, alwaysShowComments,
}: {
  post: any;
  currentProfileId: string | undefined;
  currentRole: string | undefined;
  onKudo: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, newBody: string) => void;
  onOpen?: () => void;
  alwaysShowComments?: boolean;
}) {
  const isCoachPost   = !!post.coach_profiles;
  const name: string  = isCoachPost ? (post.coach_profiles?.name ?? 'Coach') : (post.athlete_profiles?.name ?? 'Athlete');
  const postProfileId = isCoachPost ? post.coach_profiles?.id : post.athlete_profiles?.id;
  const isAuthor      = currentProfileId != null && postProfileId === currentProfileId
    && ((isCoachPost && currentRole === 'coach') || (!isCoachPost && currentRole === 'athlete'));
  const cfg = POST_TYPE_CONFIG[post.feed_type] ?? POST_TYPE_CONFIG.manual;

  const [showComments, setShowComments] = useState(alwaysShowComments ?? false);
  const [commentCount, setCommentCount] = useState<number>(post.comment_count ?? 0);
  const [editMode, setEditMode]         = useState(false);
  const [editBody, setEditBody]         = useState(post.body);
  const [saving, setSaving]             = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [hovered, setHovered]           = useState(false);
  const [shared, setShared]             = useState(false);

  const handleShare = async () => {
    const text = `${name}: "${post.body}"`;
    if (navigator.share) {
      try { await navigator.share({ text, url: window.location.href }); } catch {}
    } else {
      await navigator.clipboard.writeText(text).catch(() => {});
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    }
  };

  const saveEdit = async () => {
    if (!editBody.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/community/posts/${post.id}`, { method: 'PATCH', body: JSON.stringify({ body: editBody.trim() }) });
      onEdit(post.id, editBody.trim());
      setEditMode(false);
    } catch {}
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/api/community/posts/${post.id}`, { method: 'DELETE' });
      onDelete(post.id);
    } catch {}
  };

  return (
    <article
      style={{
        background: hovered ? 'var(--color-bg-secondary)' : 'var(--color-bg-secondary)',
        border: '1px solid #2a2a2a',
        borderRadius: 16, overflow: 'hidden',
        transition: 'background 0.15s, border-color 0.15s',
        ...(hovered ? { borderColor: '#333333' } : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="p-5"
        onClick={onOpen && !editMode && !deleteConfirm ? onOpen : undefined}
        style={onOpen && !editMode && !deleteConfirm ? { cursor: 'pointer' } : undefined}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <UserAvatar
            url={isCoachPost ? post.coach_profiles?.avatar_url : post.athlete_profiles?.avatar_url}
            name={name}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>{name}</span>
              {isCoachPost && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(0,229,160,0.15)', color: '#00E5A0', border: '1px solid rgba(0,229,160,0.30)' }}>
                  Coach
                </span>
              )}
              {post.feed_type !== 'manual' && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: cfg.bg, color: cfg.color }}>
                  {cfg.label}
                </span>
              )}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{timeAgo(post.created_at)}</div>
          </div>
          {isAuthor && !editMode && (
            <div onClick={e => e.stopPropagation()}>
              <PostMenu
                onEdit={() => { setEditBody(post.body); setEditMode(true); }}
                onDelete={() => setDeleteConfirm(true)}
              />
            </div>
          )}
        </div>

        {/* Delete confirmation */}
        {deleteConfirm && (
          <div className="mb-3 flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.20)' }}>
            <span className="text-sm flex-1" style={{ color: 'var(--color-text-primary)' }}>Delete this post?</span>
            <button type="button" onClick={handleDelete}
              className="text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ background: '#f87171', color: '#000', border: 'none', cursor: 'pointer' }}>
              Delete
            </button>
            <button type="button" onClick={() => setDeleteConfirm(false)}
              className="text-xs font-medium px-3 py-1.5 rounded-full"
              style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}

        {/* Body or edit mode */}
        {editMode ? (
          <div className="mb-3">
            <textarea
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              rows={4}
              maxLength={500}
              autoFocus
              className="w-full text-sm resize-none outline-none transition-all"
              style={{
                background: 'var(--color-bg-tertiary)', border: '1px solid #00E5A0',
                borderRadius: 10, padding: '10px 12px', color: 'var(--color-text-primary)', lineHeight: 1.6,
              }}
            />
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={saveEdit} disabled={saving || !editBody.trim()}
                className="text-xs font-bold px-4 py-1.5 rounded-full"
                style={{ background: '#00E5A0', color: '#000', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditMode(false)}
                className="text-xs font-medium px-4 py-1.5 rounded-full"
                style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="leading-relaxed mb-3 whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)', fontSize: 15 }}>
            {post.body}
          </p>
        )}

        {/* Image */}
        {post.image_url && (
          <div className="mb-2 overflow-hidden" style={{ borderRadius: 12, maxHeight: 500 }}>
            <img src={post.image_url} alt="Post" className="w-full object-cover" style={{ maxHeight: 500 }} loading="lazy" />
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="px-4 pb-1 flex items-center gap-0.5" style={{ borderTop: '1px solid var(--color-border)' }}>
        <ActionBtn active={post.i_kudoed} onClick={() => onKudo(post.id)}>
          <HeartIcon filled={post.i_kudoed} />
          <span>{post.kudo_count > 0 ? post.kudo_count : ''}</span>
        </ActionBtn>

        <ActionBtn onClick={() => { setShowComments(s => !s); }} active={showComments}>
          <CommentIcon />
          <span>{commentCount > 0 ? commentCount : ''}</span>
        </ActionBtn>

        <div className="ml-auto">
          <ActionBtn onClick={handleShare} title={shared ? 'Copied!' : 'Share'}>
            <ShareIcon />
            {shared && <span style={{ color: '#00E5A0' }}>Copied</span>}
          </ActionBtn>
        </div>
      </div>

      {/* Comment thread */}
      {(showComments || alwaysShowComments) && (
        <CommentThread
          postId={post.id}
          key={post.id}
          onCommentAdded={() => setCommentCount(c => c + 1)}
        />
      )}
    </article>
  );
}

// ── Composer Bar ──────────────────────────────────────────────────────────────
function ComposerBar({ name, onClick }: { name: string; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div className="flex items-center gap-3 px-4 py-3 mb-4 cursor-pointer transition-all duration-150"
      style={{ background: 'var(--color-bg-secondary)', border: `1px solid ${hov ? 'rgba(0,229,160,0.30)' : 'var(--color-border)'}`, borderRadius: 16 }}
      onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <UserAvatar name={name || 'A'} size="md" />
      <span className="text-sm flex-1 truncate min-w-0" style={{ color: 'var(--color-text-tertiary)' }}>
        Share your training, race results, or a win…
      </span>
      <span className="text-xs font-semibold px-3 py-1.5 rounded-full shrink-0"
        style={{ background: 'rgba(0,229,160,0.12)', color: '#00E5A0', border: '1px solid rgba(0,229,160,0.22)' }}>
        Post
      </span>
    </div>
  );
}

// ── Topics ────────────────────────────────────────────────────────────────────
const TOPICS: { value: string; label: string }[] = [
  { value: 'general',  label: 'General' },
  { value: 'running',  label: 'Running & PRs' },
  { value: 'apparel',  label: 'Apparel' },
  { value: 'races',    label: 'Races' },
  { value: 'fun',      label: 'Fun' },
];

// ── Create Post Modal ─────────────────────────────────────────────────────────
function CreatePostModal({ onClose, onPost, initialTopic = 'general' }: { onClose: () => void; onPost: (post: any) => void; initialTopic?: string }) {
  const [body, setBody]   = useState('');
  const [topic, setTopic] = useState(initialTopic);
  const [imageFile, setImageFile]     = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [posting, setPosting]         = useState(false);
  const [error, setError]             = useState('');
  const [captions, setCaptions]       = useState<{ short: string; hype: string; reflective: string } | null>(null);
  const [generatingCaptions, setGeneratingCaptions] = useState(false);
  const [captionError, setCaptionError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB'); return; }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null); setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const generateCaptions = async () => {
    setGeneratingCaptions(true); setCaptionError('');
    try {
      const result = await apiFetch('/api/ai/generate-caption', { method: 'POST', body: JSON.stringify({ milestone_label: body || undefined }) });
      setCaptions(result.captions);
    } catch (e: any) { setCaptionError(e.message || 'Failed to generate captions'); }
    finally { setGeneratingCaptions(false); }
  };

  const submit = async () => {
    if (!body.trim()) return;
    setPosting(true); setError('');
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        setUploading(true);
        try {
          imageUrl = await uploadCommunityImage(imageFile);
        } finally {
          setUploading(false);
        }
      }
      const post = await apiFetch('/api/community/posts', {
        method: 'POST',
        body: JSON.stringify({ body: body.trim(), scope: 'public', topic, ...(imageUrl && { image_url: imageUrl }) }),
      });
      onPost(post); onClose();
    } catch (e: any) { setError(e.message || 'Failed to post'); }
    finally { setPosting(false); setUploading(false); }
  };

  const CAPTION_STYLES = ['Short', 'Hype', 'Reflective'] as const;
  const captionValues  = captions ? [captions.short, captions.hype, captions.reflective] : [];

  const pill = (active: boolean): React.CSSProperties => ({
    borderRadius: 9999, fontSize: 12, fontWeight: 500, padding: '4px 14px',
    cursor: 'pointer', transition: 'all 0.15s', border: 'none',
    ...(active ? { background: '#00E5A0', color: '#000' } : { background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg overflow-hidden"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,0.85)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--color-text-primary)' }}>Share with the Community</h2>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center text-lg"
            style={{ borderRadius: '50%', color: 'var(--color-text-secondary)', background: 'var(--color-bg-hover)', border: 'none', cursor: 'pointer' }}>×</button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* AI caption chips */}
          {captions && (
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>AI suggestions — tap to use:</p>
              <div className="flex flex-col gap-1.5">
                {captionValues.map((cap, i) => (
                  <button key={i} type="button" onClick={() => setBody(cap)}
                    className="text-left text-xs px-3 py-2.5 rounded-xl transition-all leading-relaxed"
                    style={{
                      border: body === cap ? '1px solid #00E5A0' : '1px solid var(--color-border)',
                      background: body === cap ? 'rgba(0,229,160,0.08)' : 'transparent',
                      color: body === cap ? '#00E5A0' : 'var(--color-text-secondary)', cursor: 'pointer',
                    }}>
                    <span className="block mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">{CAPTION_STYLES[i]}</span>
                    {cap}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Textarea */}
          <div>
            <textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="Share your training, race results, or a win…"
              rows={5} maxLength={500} autoFocus
              className="w-full text-sm resize-none outline-none transition-all duration-150"
              style={{
                background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
                borderRadius: 12, padding: '12px 14px', color: 'var(--color-text-primary)', lineHeight: 1.65,
              }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#00E5A0'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--color-border)'; }}
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{body.length}/500</span>
              {captionError && <span className="text-xs text-red-400">{captionError}</span>}
            </div>
          </div>

          {/* Image upload */}
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            {imagePreview ? (
              <div className="relative overflow-hidden" style={{ borderRadius: 12, border: '1px solid var(--color-border)' }}>
                <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-cover" />
                <button type="button" onClick={removeImage} className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center text-white text-sm"
                  style={{ background: 'rgba(0,0,0,0.7)', borderRadius: '50%', border: 'none', cursor: 'pointer' }}>×</button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 text-xs flex items-center justify-center gap-2 transition-all duration-150"
                style={{ border: '1px dashed var(--color-border-light)', borderRadius: 12, color: 'var(--color-text-tertiary)', background: 'transparent', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00E5A0'; (e.currentTarget as HTMLButtonElement).style.color = '#00E5A0'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border-light)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-tertiary)'; }}>
                📷 Add photo (optional · max 5 MB)
              </button>
            )}
          </div>

          {/* Topic */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Topic:</span>
            {TOPICS.map(t => (
              <button key={t.value} type="button" onClick={() => setTopic(t.value)} style={pill(topic === t.value)}>
                {t.label}
              </button>
            ))}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button type="button" onClick={generateCaptions} disabled={generatingCaptions}
              className="flex items-center gap-1.5 text-xs transition-colors disabled:opacity-40"
              style={{ color: '#00E5A0', background: 'none', border: 'none', cursor: 'pointer' }}>
              {generatingCaptions
                ? <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" /> Generating…</>
                : '✦ AI Caption'
              }
            </button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" loading={posting || uploading} disabled={!body.trim()} onClick={submit}>
                {uploading ? 'Uploading…' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Top Athletes Sidebar ──────────────────────────────────────────────────────
function TopAthletesSidebar() {
  const [athletes, setAthletes] = useState<any[]>([]);
  useEffect(() => { apiFetch('/api/community/top-athletes').then(setAthletes).catch(() => {}); }, []);
  if (athletes.length === 0) return null;
  return (
    <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 16, padding: 20 }}>
      <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--color-text-primary)' }}>Top Athletes This Week</h3>
      <div className="space-y-3">
        {athletes.slice(0, 5).map((athlete: any, i: number) => (
          <div key={athlete.id} className="flex items-center gap-3">
            <span className="w-5 text-xs font-bold text-center shrink-0"
              style={{ color: i === 0 ? '#FCD34D' : i === 1 ? '#9CA3AF' : i === 2 ? '#D97706' : 'var(--color-text-tertiary)' }}>
              {i + 1}
            </span>
            <UserAvatar name={athlete.name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{athlete.name}</p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{athlete.weekly_miles} mi this week</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Post Detail View ─────────────────────────────────────────────────────────
function PostDetailView({
  post: initialPost, currentProfileId, currentRole, onKudo, onDelete, onEdit, onBack,
}: {
  post: any;
  currentProfileId: string | undefined;
  currentRole: string | undefined;
  onKudo: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, newBody: string) => void;
  onBack: () => void;
}) {
  const [localPost, setLocalPost] = useState(initialPost);

  const handleKudo = (id: string) => {
    setLocalPost((p: any) => ({ ...p, i_kudoed: !p.i_kudoed, kudo_count: p.i_kudoed ? p.kudo_count - 1 : p.kudo_count + 1 }));
    onKudo(id);
  };

  const handleDelete = (id: string) => { onDelete(id); onBack(); };

  const handleEdit = (id: string, newBody: string) => {
    onEdit(id, newBody);
    setLocalPost((p: any) => ({ ...p, body: newBody }));
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 mb-5 text-sm font-medium transition-colors"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-secondary)'; }}
      >
        ← Back to feed
      </button>
      <PostCard
        post={localPost}
        currentProfileId={currentProfileId}
        currentRole={currentRole}
        onKudo={handleKudo}
        onDelete={handleDelete}
        onEdit={handleEdit}
        alwaysShowComments
      />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMiles(m: number) { return (m / 1609.34).toFixed(2); }
function fmtPace(speedMs: number) {
  if (!speedMs || !isFinite(speedMs)) return '--:--';
  const pps = 1609.34 / speedMs;
  const m = Math.floor(pps / 60);
  const s = Math.round(pps % 60);
  return `${m}:${s.toString().padStart(2, '0')} /mi`;
}
function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// ── Run card shown in Friends feed ────────────────────────────────────────────
function FriendRunCard({ activity, nav }: { activity: any; nav: ReturnType<typeof useNavigate> }) {
  const athlete = activity.athlete;
  const miles = fmtMiles(activity.distance_meters ?? 0);
  const pace = fmtPace(activity.average_speed ?? 0);
  const elapsed = fmtTime(activity.moving_time_seconds ?? 0);
  const dateStr = new Date(activity.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '14px 16px' }}>
      {/* Athlete header */}
      <div className="flex items-center gap-3 mb-3">
        <UserAvatar name={athlete?.name ?? '?'} url={athlete?.avatar_url} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{athlete?.name}</div>
          {athlete?.username && (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>@{athlete.username}</div>
          )}
        </div>
        <div className="text-xs shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>{dateStr}</div>
      </div>
      {/* Run name */}
      <div className="text-sm font-medium mb-2 truncate" style={{ color: 'var(--color-text-primary)' }}>{activity.name || 'Run'}</div>
      {/* Stats row */}
      <div className="flex gap-4 text-xs font-mono">
        <div>
          <span style={{ color: 'var(--color-text-tertiary)' }}>dist </span>
          <span style={{ color: '#00E5A0', fontWeight: 700 }}>{miles} mi</span>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-tertiary)' }}>pace </span>
          <span style={{ color: 'var(--color-text-primary)' }}>{pace}</span>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-tertiary)' }}>time </span>
          <span style={{ color: 'var(--color-text-primary)' }}>{elapsed}</span>
        </div>
      </div>
    </div>
  );
}

// ── Friends tab — who you follow ─────────────────────────────────────────────
function FriendsTab({ nav: _nav }: { nav: ReturnType<typeof useNavigate> }) {
  const [following, setFollowing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/social/following')
      .then(setFollowing)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const unfollow = async (athleteId: string) => {
    await apiFetch(`/api/social/follow/${athleteId}`, { method: 'POST' });
    setFollowing(prev => prev.filter(f => f.id !== athleteId));
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  if (following.length === 0) {
    return (
      <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '48px 32px', textAlign: 'center', maxWidth: 680 }}>
        <p className="font-bold text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>No friends yet</p>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
          Search for athletes by username in the <strong>People</strong> tab to start following them.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" style={{ maxWidth: 680 }}>
      <p className="text-xs mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Following {following.length} {following.length === 1 ? 'athlete' : 'athletes'}</p>
      {following.map(athlete => (
        <AthleteRow key={athlete.id} athlete={{ ...athlete, is_following: true }} onToggleFollow={unfollow} />
      ))}
    </div>
  );
}

// ── Friends' Runs tab ─────────────────────────────────────────────────────────
function FriendsRunsTab({ nav }: { nav: ReturnType<typeof useNavigate> }) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/social/friends-feed')
      .then(setActivities)
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  if (activities.length === 0) {
    return (
      <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '48px 32px', textAlign: 'center' }}>
        <p className="font-bold text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>No runs from friends yet</p>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto 20px' }}>
          Find athletes to follow in the <strong>People</strong> tab and their runs will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" style={{ maxWidth: 680 }}>
      {activities.map(act => (
        <FriendRunCard key={act.id} activity={act} nav={nav} />
      ))}
    </div>
  );
}

// ── People / search tab ───────────────────────────────────────────────────────
function PeopleTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingFollowing, setLoadingFollowing] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiFetch('/api/social/following')
      .then(setFollowing)
      .catch(() => {})
      .finally(() => setLoadingFollowing(false));
  }, []);

  const search = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiFetch(`/api/social/search?q=${encodeURIComponent(q.trim())}`);
        setResults(data);
      } catch {}
      finally { setSearching(false); }
    }, 350);
  };

  const toggleFollow = async (athleteId: string) => {
    const res = await apiFetch(`/api/social/follow/${athleteId}`, { method: 'POST' });
    if (res.following) {
      setFollowing(prev => {
        const found = results.find(r => r.id === athleteId);
        if (found && !prev.find(f => f.id === athleteId)) return [found, ...prev];
        return prev;
      });
    } else {
      setFollowing(prev => prev.filter(f => f.id !== athleteId));
    }
    setResults(prev => prev.map(r => r.id === athleteId ? { ...r, is_following: res.following } : r));
  };

  const unfollowFromList = async (athleteId: string) => {
    await apiFetch(`/api/social/follow/${athleteId}`, { method: 'POST' });
    setFollowing(prev => prev.filter(f => f.id !== athleteId));
  };

  const showResults = query.trim().length > 0;

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }}>@</span>
        <input
          type="text"
          value={query}
          onChange={e => search(e.target.value)}
          placeholder="Search by username..."
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 14px 12px 32px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 12, color: 'var(--color-text-primary)',
            fontSize: 14, outline: 'none',
          }}
        />
        {searching && (
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
            <Spinner size="sm" />
          </span>
        )}
      </div>

      {/* Search results */}
      {showResults && (
        <div className="flex flex-col gap-2 mb-6">
          {results.length === 0 && !searching ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-tertiary)' }}>No athletes found for "@{query}"</p>
          ) : results.map(athlete => (
            <AthleteRow key={athlete.id} athlete={athlete} onToggleFollow={toggleFollow} />
          ))}
        </div>
      )}

      {/* Following list */}
      {!showResults && (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
            Following ({following.length})
          </div>
          {loadingFollowing ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : following.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>You're not following anyone yet. Search for athletes above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {following.map(athlete => (
                <AthleteRow key={athlete.id} athlete={{ ...athlete, is_following: true }} onToggleFollow={unfollowFromList} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AthleteRow({ athlete, onToggleFollow }: { athlete: any; onToggleFollow: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = async () => {
    setBusy(true);
    setErr('');
    try {
      await onToggleFollow(athlete.id);
    } catch (e: any) {
      const raw = e?.message ?? '';
      setErr(raw.includes('migration') || raw.includes('schema') || raw.includes('does not exist')
        ? 'Follow feature is temporarily unavailable. Please contact support.'
        : (raw || 'Could not update follow. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: 'var(--color-bg-secondary)', border: `1px solid ${err ? 'rgba(248,113,113,0.35)' : 'var(--color-border)'}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <UserAvatar name={athlete.name ?? '?'} url={athlete.avatar_url} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{athlete.name}</div>
          {athlete.username && (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>@{athlete.username}</div>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          style={{
            padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer', border: 'none',
            background: athlete.is_following ? 'rgba(255,255,255,0.08)' : '#00E5A0',
            color: athlete.is_following ? 'var(--color-text-secondary)' : '#000',
            transition: 'opacity 0.15s',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? '…' : athlete.is_following ? 'Following' : 'Follow'}
        </button>
      </div>
      {err && (
        <p style={{ fontSize: 11, color: '#f87171', marginTop: 6, marginBottom: 0 }}>{err}</p>
      )}
    </div>
  );
}

// ── Suggested / Contacts tab ──────────────────────────────────────────────────
function SuggestedTab() {
  type Step = 'prompt' | 'loading' | 'results' | 'no-api';
  const [step, setStep] = useState<Step>(() =>
    typeof navigator !== 'undefined' && 'contacts' in navigator ? 'prompt' : 'no-api'
  );
  const [matches, setMatches]         = useState<any[]>([]);
  const [nonMatches, setNonMatches]   = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [err, setErr]                 = useState('');

  useEffect(() => {
    if (step === 'no-api') {
      apiFetch('/api/social/suggestions').then(setSuggestions).catch(() => {});
    }
  }, [step]);

  const requestContacts = async () => {
    setStep('loading');
    setErr('');
    try {
      const raw = await (navigator as any).contacts.select(['name', 'email', 'tel'], { multiple: true });
      const formatted = (raw ?? []).map((c: any) => ({
        name:  Array.isArray(c.name)  ? c.name[0]  : c.name,
        email: Array.isArray(c.email) ? c.email[0] : c.email,
        tel:   Array.isArray(c.tel)   ? c.tel[0]   : c.tel,
      }));
      const res = await apiFetch('/api/social/contacts-match', {
        method: 'POST',
        body: JSON.stringify({ contacts: formatted }),
      });
      setMatches(res.matches ?? []);
      setNonMatches(res.nonMatches ?? []);
      setStep('results');
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.toLowerCase().includes('not allowed') || msg.toLowerCase().includes('denied') || e?.name === 'SecurityError') {
        setErr('Contacts access was denied. You can allow it in your browser settings.');
        setStep('prompt');
      } else {
        setStep('no-api');
        apiFetch('/api/social/suggestions').then(setSuggestions).catch(() => {});
      }
    }
  };

  const toggleFollow = async (athleteId: string) => {
    const res = await apiFetch(`/api/social/follow/${athleteId}`, { method: 'POST' });
    const update = (prev: any[]) => prev.map(a => a.id === athleteId ? { ...a, is_following: res.following } : a);
    setMatches(update);
    setSuggestions(update);
  };

  const inviteContact = (c: { name: string; email: string; phone?: string; tel?: string }) => {
    const phone = c.phone ?? c.tel;
    const msg = encodeURIComponent(
      `Hey ${c.name || 'there'}! I'm using Laktic to track my training. Come join me — it's a free AI coaching app for runners. Check it out at ${window.location.origin}`
    );
    if (c.email) {
      window.open(`mailto:${c.email}?subject=${encodeURIComponent('Join me on Laktic!')}&body=${msg}`, '_blank');
    } else if (phone) {
      window.open(`sms:${phone}?body=${msg}`, '_blank');
    }
  };

  if (step === 'no-api') {
    return (
      <div style={{ maxWidth: 680 }}>
        <div style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.18)', borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6 }}>
            Contact suggestions aren't available on this device or browser. Here are some active athletes you can follow.
          </p>
        </div>
        {suggestions.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '32px 0' }}>No suggestions yet — check back soon.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {suggestions.map(a => (
              <AthleteRow key={a.id} athlete={a} onToggleFollow={toggleFollow} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === 'prompt') {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '12px 0' }}>
        <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '36px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>👥</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 10 }}>Find friends on Laktic</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.65, maxWidth: 320, margin: '0 auto 24px' }}>
            Allow access to your contacts and we'll show you which of your friends are already using Laktic. Anyone who isn't yet can get an invite.
          </p>
          {err && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 16 }}>{err}</p>}
          <button
            type="button"
            onClick={requestContacts}
            style={{ padding: '12px 32px', borderRadius: 12, fontWeight: 700, fontSize: 14, background: '#00E5A0', color: '#000', border: 'none', cursor: 'pointer' }}
          >
            Allow Contacts Access
          </button>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 14, opacity: 0.6 }}>
            Your contacts are never stored or shared.
          </p>
        </div>
      </div>
    );
  }

  if (step === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Spinner size="lg" />
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Searching your contacts…</p>
      </div>
    );
  }

  // results
  const hasAny = matches.length > 0 || nonMatches.length > 0;
  return (
    <div style={{ maxWidth: 680 }}>
      {!hasAny ? (
        <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '48px 32px', textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>None of your contacts are on Laktic yet</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.65 }}>Be the first in your circle — share the app with your running friends!</p>
        </div>
      ) : (
        <>
          {matches.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                On Laktic ({matches.length})
              </p>
              <div className="flex flex-col gap-2">
                {matches.map(a => <AthleteRow key={a.id} athlete={a} onToggleFollow={toggleFollow} />)}
              </div>
            </section>
          )}

          {nonMatches.length > 0 && (
            <section>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                Invite to Laktic ({nonMatches.length})
              </p>
              <div className="flex flex-col gap-2">
                {nonMatches.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                      {(c.name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.email}</div>
                      {c.email && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => inviteContact(c)}
                      style={{ padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid rgba(0,229,160,0.4)', background: 'transparent', color: '#00E5A0', cursor: 'pointer', flexShrink: 0 }}
                    >
                      Invite
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Community Page ───────────────────────────────────────────────────────
export function Community() {
  const { profile, clearAuth, role, logout } = useAuthStore();
  const nav = useNavigate();
  const isCoach = role === 'coach';
  const [activeSection, setActiveSection] = useState<'feed' | 'friends' | 'friends-runs' | 'people' | 'suggested'>('friends');

  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [posts, setPosts]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [pendingPosts, setPendingPosts] = useState<any[]>([]);
  const [activeTopic, setActiveTopic] = useState('general');
  const activeTopicRef = useRef('general');
  const knownPostIdsRef = useRef<Set<string>>(new Set());
  const newestPostIdRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const setActiveTopicAndRef = (t: string) => { activeTopicRef.current = t; setActiveTopic(t); };

  const handleLogout = async () => { await logout(); nav('/'); };

  const loadPage = async (pg: number, reset: boolean, topic = activeTopic) => {
    if (reset) { setLoading(true); setPosts([]); } else setLoadingMore(true);
    try {
      const topicParam = `&topic=${topic}`;
      const data = await apiFetch(`/api/community/feed?page=${pg}${topicParam}`);
      if (reset) knownPostIdsRef.current.clear();
      (data.posts ?? []).forEach((p: any) => knownPostIdsRef.current.add(p.id));
      if (reset && data.posts?.length > 0) newestPostIdRef.current = data.posts[0].id;
      setPosts(prev => reset ? data.posts : [...prev, ...data.posts]);
      setHasMore(data.hasMore);
      setPage(pg);
    } catch {}
    finally { setLoading(false); setLoadingMore(false); }
  };

  useEffect(() => {
    // Clear cross-topic state whenever the tab changes
    setPendingPosts([]);
    newestPostIdRef.current = null;
    loadPage(1, true, activeTopic);
  }, [activeTopic]);

  // 15-second poll: detect new posts + silently refresh counts
  // Sends lastSeenId so the backend can short-circuit with { unchanged: true }
  // when nothing new has arrived — keeps Railway logs silent on idle polls.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const lastSeenId = newestPostIdRef.current;
        const topic = activeTopicRef.current;
        const url = lastSeenId
          ? `/api/community/feed?page=1&lastSeenId=${encodeURIComponent(lastSeenId)}&topic=${topic}`
          : `/api/community/feed?page=1&topic=${topic}`;
        const data = await apiFetch(url);

        if (data.unchanged) return;

        const fresh: any[] = data.posts ?? [];

        if (fresh.length > 0) newestPostIdRef.current = fresh[0].id;

        // Find posts not yet shown (and matching the active topic)
        const newOnes = fresh.filter(p => !knownPostIdsRef.current.has(p.id) && p.topic === activeTopicRef.current);
        if (newOnes.length > 0) {
          setPendingPosts(prev => {
            const pendingIds = new Set(prev.map((p: any) => p.id));
            const brandNew = newOnes.filter(p => !pendingIds.has(p.id));
            return brandNew.length > 0 ? [...brandNew, ...prev] : prev;
          });
        }

        // Silently update kudo/comment counts on visible posts
        setPosts(prev => prev.map(existing => {
          const update = fresh.find(fp => fp.id === existing.id);
          if (!update) return existing;
          return { ...existing, kudo_count: update.kudo_count, comment_count: update.comment_count };
        }));
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadPending = () => {
    const sorted = [...pendingPosts].sort(
      (a, b) => (b.kudo_count + b.comment_count) - (a.kudo_count + a.comment_count)
    );
    sorted.forEach(p => knownPostIdsRef.current.add(p.id));
    setPosts(prev => [...sorted, ...prev]);
    setPendingPosts([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) loadPage(page + 1, false);
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, page]);

  const toggleKudo = async (postId: string) => {
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, i_kudoed: !p.i_kudoed, kudo_count: p.i_kudoed ? p.kudo_count - 1 : p.kudo_count + 1 }
      : p
    ));
    try {
      await apiFetch(`/api/community/posts/${postId}/kudos`, { method: 'POST' });
    } catch {
      setPosts(prev => prev.map(p => p.id === postId
        ? { ...p, i_kudoed: !p.i_kudoed, kudo_count: p.i_kudoed ? p.kudo_count - 1 : p.kudo_count + 1 }
        : p
      ));
    }
  };

  const deletePost = (postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    setSelectedPost((s: any) => (s?.id === postId ? null : s));
  };
  const editPost   = (postId: string, newBody: string) => setPosts(prev => prev.map(p => p.id === postId ? { ...p, body: newBody } : p));

  return (
    <AppLayout role={role ?? 'athlete'} name={profile?.name} onLogout={handleLogout}>
      <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)', overflowX: 'hidden' }}>
        {showCreate && (
          <CreatePostModal
            onClose={() => setShowCreate(false)}
            initialTopic={activeTopic}
            onPost={post => { if (post.topic === activeTopic) setPosts(prev => [post, ...prev]); }}
          />
        )}

        <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          {/* Header */}
          <div className="mb-4">
            <h1 className="font-bold text-2xl sm:text-3xl mb-3" style={{ color: 'var(--color-text-primary)' }}>Community</h1>
            {/* Section tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {(['friends', 'friends-runs', 'feed', 'people', 'suggested'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setActiveSection(s); setSelectedPost(null); }}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 shrink-0"
                  style={activeSection === s
                    ? { background: '#00E5A0', color: '#000', border: 'none', cursor: 'pointer' }
                    : { background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }
                  }
                >
                  {s === 'friends' ? 'Friends' : s === 'friends-runs' ? "Friends' Runs" : s === 'feed' ? 'Community' : s === 'people' ? 'People' : 'Suggested'}
                </button>
              ))}
            </div>
          </div>

          {/* Two-column layout */}
          <div className="flex flex-col lg:flex-row gap-8 items-start">

            {/* LEFT — section content */}
            <div className="flex-1 min-w-0">
              {activeSection === 'friends' ? (
                <FriendsTab nav={nav} />
              ) : activeSection === 'friends-runs' ? (
                <FriendsRunsTab nav={nav} />
              ) : activeSection === 'people' ? (
                <PeopleTab />
              ) : activeSection === 'suggested' ? (
                <SuggestedTab />
              ) : selectedPost ? (
                <PostDetailView
                  post={selectedPost}
                  currentProfileId={profile?.id}
                  currentRole={role ?? undefined}
                  onKudo={toggleKudo}
                  onDelete={deletePost}
                  onEdit={editPost}
                  onBack={() => setSelectedPost(null)}
                />
              ) : (
              <div style={{ maxWidth: 680 }}>
                <ComposerBar name={profile?.name ?? 'A'} onClick={() => setShowCreate(true)} />

                {/* Topic tabs */}
                <div className="flex gap-2 overflow-x-auto pb-1 mb-4 mt-3 w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {TOPICS.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setActiveTopicAndRef(t.value)}
                      className="shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-150"
                      style={activeTopic === t.value
                        ? { background: '#00E5A0', color: '#000', border: 'none', cursor: 'pointer' }
                        : { background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* New posts banner */}
                {pendingPosts.length > 0 && (
                  <div className="flex justify-center mb-4">
                    <button
                      type="button"
                      onClick={loadPending}
                      className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold shadow-lg transition-all duration-150 hover:opacity-90 active:scale-95"
                      style={{ background: '#00E5A0', color: '#000', border: 'none', cursor: 'pointer' }}
                    >
                      ↑ {pendingPosts.length} new {pendingPosts.length === 1 ? 'post' : 'posts'}
                    </button>
                  </div>
                )}

                {loading ? (
                  <div className="flex justify-center py-20"><Spinner size="lg" /></div>
                ) : posts.length === 0 ? (
                  <div style={{
                    background: 'var(--color-bg-secondary)',
                    backgroundImage: 'radial-gradient(var(--color-border) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 16, padding: '72px 32px', textAlign: 'center',
                  }}>
                    <p className="font-bold text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>Nothing here yet</p>
                    <p className="text-sm mb-8 mx-auto" style={{ color: 'var(--color-text-tertiary)', maxWidth: 320, lineHeight: 1.65 }}>
                      Be the first to share a win, race result, or training milestone with the community.
                    </p>
                    <button type="button" onClick={() => setShowCreate(true)}
                      className="px-7 py-2.5 text-sm font-bold rounded-full transition-all duration-150"
                      style={{ background: '#00E5A0', color: '#000', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}>
                      Create Post
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {posts.map(post => (
                      <PostCard
                        key={post.id}
                        post={post}
                        currentProfileId={profile?.id}
                        currentRole={role ?? undefined}
                        onKudo={toggleKudo}
                        onDelete={deletePost}
                        onEdit={editPost}
                        onOpen={() => setSelectedPost(post)}
                      />
                    ))}
                    {loadingMore && <div className="flex justify-center py-4"><Spinner /></div>}
                    <div ref={sentinelRef} className="h-4" />
                    {!hasMore && posts.length > 8 && (
                      <p className="text-center text-xs py-4" style={{ color: 'var(--color-text-tertiary)' }}>
                        You're all caught up
                      </p>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>

            {/* RIGHT — Sidebar (desktop only) */}
            <div className="hidden lg:block w-80 shrink-0 sticky top-8">
              <TopAthletesSidebar />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
