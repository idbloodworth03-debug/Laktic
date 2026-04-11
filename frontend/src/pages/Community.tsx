import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Spinner, Input } from '../components/ui';
import { UserAvatar } from '../components/UserAvatar';

// ── Constants ─────────────────────────────────────────────────────────────────
const METRIC_LABELS: Record<string, string> = {
  miles: 'miles', workouts: 'workouts', hours: 'hours', elevation_ft: 'ft elevation',
};

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

async function uploadCommunityImage(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `community/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('community-images').upload(path, file, { contentType: file.type, upsert: false });
  if (error) return null;
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
        color: active ? '#00E5A0' : hov ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.38)',
        background: active ? 'rgba(0,229,160,0.10)' : hov ? 'rgba(255,255,255,0.05)' : 'transparent',
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
          style={{ background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: 130 }}>
          <button type="button" className="w-full text-left px-4 py-2.5 text-sm transition-colors"
            style={{ color: 'rgba(255,255,255,0.75)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
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
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
      <div className="px-5 pt-3 pb-4">
        {loading ? (
          <div className="flex justify-center py-3"><Spinner /></div>
        ) : comments.length === 0 ? (
          <p className="text-xs py-2 text-center" style={{ color: 'rgba(255,255,255,0.28)' }}>No comments yet. Be the first.</p>
        ) : (
          <div className="space-y-3 mb-3">
            {comments.map(c => (
              <div key={c.id} className="flex gap-2.5 items-start">
                <UserAvatar name={c.author_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold" style={{ color: '#FFFFFF' }}>{c.author_name}</span>
                    {c.author_type === 'coach' && (
                      <span className="text-[9px] font-bold px-1.5 rounded-full"
                        style={{ background: 'rgba(0,229,160,0.12)', color: '#00E5A0', border: '1px solid rgba(0,229,160,0.25)' }}>
                        Coach
                      </span>
                    )}
                    <span className="text-[10px] ml-auto" style={{ color: 'rgba(255,255,255,0.28)' }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-xs leading-relaxed mt-0.5" style={{ color: 'rgba(255,255,255,0.72)' }}>{c.content}</p>
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
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 20, padding: '7px 14px', color: '#FFFFFF',
            }}
            onFocus={e => { (e.target as HTMLElement).style.borderColor = '#00E5A0'; }}
            onBlur={e => { (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.10)'; }}
          />
          <button type="button" onClick={submit} disabled={submitting || !text.trim()}
            className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
            style={{
              background: text.trim() ? '#00E5A0' : 'rgba(255,255,255,0.08)',
              color: text.trim() ? '#000' : 'rgba(255,255,255,0.3)',
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
  post, currentProfileId, currentRole, onKudo, onDelete, onEdit,
}: {
  post: any;
  currentProfileId: string | undefined;
  currentRole: string | undefined;
  onKudo: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, newBody: string) => void;
}) {
  const isCoachPost   = !!post.coach_profiles;
  const name: string  = isCoachPost ? (post.coach_profiles?.name ?? 'Coach') : (post.athlete_profiles?.name ?? 'Athlete');
  const postProfileId = isCoachPost ? post.coach_profiles?.id : post.athlete_profiles?.id;
  const isAuthor      = currentProfileId != null && postProfileId === currentProfileId
    && ((isCoachPost && currentRole === 'coach') || (!isCoachPost && currentRole === 'athlete'));
  const cfg = POST_TYPE_CONFIG[post.feed_type] ?? POST_TYPE_CONFIG.manual;

  const [showComments, setShowComments] = useState(false);
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
        background: hovered ? '#161616' : '#111111',
        border: '1px solid #2a2a2a',
        borderRadius: 16, overflow: 'hidden',
        transition: 'background 0.15s, border-color 0.15s',
        ...(hovered ? { borderColor: '#333333' } : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <UserAvatar
            url={isCoachPost ? post.coach_profiles?.avatar_url : post.athlete_profiles?.avatar_url}
            name={name}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm" style={{ color: '#FFFFFF' }}>{name}</span>
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
            <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.32)' }}>{timeAgo(post.created_at)}</div>
          </div>
          {isAuthor && !editMode && (
            <PostMenu
              onEdit={() => { setEditBody(post.body); setEditMode(true); }}
              onDelete={() => setDeleteConfirm(true)}
            />
          )}
        </div>

        {/* Delete confirmation */}
        {deleteConfirm && (
          <div className="mb-3 flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.20)' }}>
            <span className="text-sm flex-1" style={{ color: 'rgba(255,255,255,0.75)' }}>Delete this post?</span>
            <button type="button" onClick={handleDelete}
              className="text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ background: '#f87171', color: '#000', border: 'none', cursor: 'pointer' }}>
              Delete
            </button>
            <button type="button" onClick={() => setDeleteConfirm(false)}
              className="text-xs font-medium px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>
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
                background: 'rgba(255,255,255,0.04)', border: '1px solid #00E5A0',
                borderRadius: 10, padding: '10px 12px', color: '#FFFFFF', lineHeight: 1.6,
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
                style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="leading-relaxed mb-3 whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>
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
      <div className="px-4 pb-1 flex items-center gap-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
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
      {showComments && (
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
      style={{ background: '#111111', border: `1px solid ${hov ? 'rgba(0,229,160,0.30)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 16 }}
      onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <UserAvatar name={name || 'A'} size="md" />
      <span className="text-sm flex-1 truncate min-w-0" style={{ color: 'rgba(255,255,255,0.30)' }}>
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
function CreatePostModal({ onClose, onPost }: { onClose: () => void; onPost: (post: any) => void }) {
  const [body, setBody]   = useState('');
  const [scope, setScope] = useState<'public' | 'team'>('public');
  const [topic, setTopic] = useState('general');
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
        const url = await uploadCommunityImage(imageFile);
        setUploading(false);
        if (url) imageUrl = url;
      }
      const post = await apiFetch('/api/community/posts', {
        method: 'POST',
        body: JSON.stringify({ body: body.trim(), scope, topic, ...(imageUrl && { image_url: imageUrl }) }),
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
    ...(active ? { background: '#00E5A0', color: '#000' } : { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg overflow-hidden"
        style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,0.85)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="font-semibold text-base" style={{ color: '#FFFFFF' }}>Share with the Community</h2>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center text-lg"
            style={{ borderRadius: '50%', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer' }}>×</button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* AI caption chips */}
          {captions && (
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>AI suggestions — tap to use:</p>
              <div className="flex flex-col gap-1.5">
                {captionValues.map((cap, i) => (
                  <button key={i} type="button" onClick={() => setBody(cap)}
                    className="text-left text-xs px-3 py-2.5 rounded-xl transition-all leading-relaxed"
                    style={{
                      border: body === cap ? '1px solid #00E5A0' : '1px solid rgba(255,255,255,0.08)',
                      background: body === cap ? 'rgba(0,229,160,0.08)' : 'transparent',
                      color: body === cap ? '#00E5A0' : 'rgba(255,255,255,0.6)', cursor: 'pointer',
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
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: '12px 14px', color: '#FFFFFF', lineHeight: 1.65,
              }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#00E5A0'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{body.length}/500</span>
              {captionError && <span className="text-xs text-red-400">{captionError}</span>}
            </div>
          </div>

          {/* Image upload */}
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            {imagePreview ? (
              <div className="relative overflow-hidden" style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-cover" />
                <button type="button" onClick={removeImage} className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center text-white text-sm"
                  style={{ background: 'rgba(0,0,0,0.7)', borderRadius: '50%', border: 'none', cursor: 'pointer' }}>×</button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 text-xs flex items-center justify-center gap-2 transition-all duration-150"
                style={{ border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 12, color: 'rgba(255,255,255,0.35)', background: 'transparent', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00E5A0'; (e.currentTarget as HTMLButtonElement).style.color = '#00E5A0'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.35)'; }}>
                📷 Add photo (optional · max 5 MB)
              </button>
            )}
          </div>

          {/* Scope */}
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>Visible to:</span>
            {(['public', 'team'] as const).map(s => (
              <button key={s} type="button" onClick={() => setScope(s)} style={pill(scope === s)}>
                {s === 'public' ? 'Everyone' : 'Team only'}
              </button>
            ))}
          </div>

          {/* Topic */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>Topic:</span>
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

// ── Create Challenge Modal ────────────────────────────────────────────────────
function CreateChallengeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (challenge: any) => void }) {
  const [title, setTitle]       = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [targetUnit, setTargetUnit]   = useState('miles');
  const [metric, setMetric]     = useState<'miles' | 'workouts' | 'hours' | 'elevation_ft'>('miles');
  const [endsAt, setEndsAt]     = useState('');
  const [description, setDescription] = useState('');
  const [posting, setPosting]   = useState(false);
  const [error, setError]       = useState('');

  const submit = async () => {
    if (!title.trim() || !targetValue || !endsAt) { setError('Title, target, and end date are required.'); return; }
    setPosting(true); setError('');
    try {
      const ch = await apiFetch('/api/challenges', { method: 'POST', body: JSON.stringify({
        title: title.trim(), description: description.trim() || undefined,
        target_value: parseFloat(targetValue), target_unit: targetUnit, metric,
        ends_at: new Date(endsAt + 'T23:59:59').toISOString(),
      }) });
      onCreated(ch); onClose();
    } catch (e: any) { setError(e.message || 'Failed to create challenge'); }
    finally { setPosting(false); }
  };

  const handleMetricChange = (m: typeof metric) => { setMetric(m); setTargetUnit(METRIC_LABELS[m]); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg"
        style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,0.85)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="font-semibold text-base" style={{ color: '#FFFFFF' }}>Create a Challenge</h2>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center text-lg"
            style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', borderRadius: '50%', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <Input label="Challenge title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. October Miles Challenge" />
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this challenge about?" rows={2}
              className="w-full text-sm resize-none outline-none transition-all duration-150"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', color: '#FFFFFF' }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#00E5A0'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.08)'; }} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>Track by</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['miles', 'workouts', 'hours', 'elevation_ft'] as const).map(m => (
                <button key={m} type="button" onClick={() => handleMetricChange(m)} className="py-2 px-2 text-xs font-medium text-center capitalize transition-all duration-150"
                  style={metric === m
                    ? { background: '#00E5A0', border: '1px solid #00E5A0', borderRadius: 12, color: '#000', cursor: 'pointer' }
                    : { background: 'transparent', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                  {m.replace('_ft', ' ft')}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={`Target (${METRIC_LABELS[metric]})`} type="number" min="1" value={targetValue} onChange={e => setTargetValue(e.target.value)} placeholder="e.g. 100" />
            <Input label="Ends on" type="date" value={endsAt} onChange={e => setEndsAt(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={posting} disabled={!title.trim() || !targetValue || !endsAt} onClick={submit}>Create Challenge</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Leaderboard Modal ─────────────────────────────────────────────────────────
function LeaderboardModal({ data, onClose }: { data: { challenge: any; leaderboard: any[] }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-md p-6 max-h-[80vh] flex flex-col"
        style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,0.85)' }}
        onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center text-lg"
          style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', borderRadius: '50%', border: 'none', cursor: 'pointer' }}>×</button>
        <div className="mb-4">
          <h3 className="font-semibold text-base" style={{ color: '#FFFFFF' }}>{data.challenge.title}</h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Target: {data.challenge.target_value} {data.challenge.target_unit}</p>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {data.leaderboard.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'rgba(255,255,255,0.4)' }}>No participants yet.</p>
          ) : data.leaderboard.map((entry: any) => (
            <div key={entry.athlete_id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="w-7 h-7 flex items-center justify-center text-sm font-bold shrink-0" style={{
                borderRadius: '50%',
                background: entry.rank === 1 ? 'rgba(245,158,11,0.2)' : entry.rank === 2 ? 'rgba(160,160,160,0.15)' : entry.rank === 3 ? 'rgba(180,83,9,0.2)' : 'rgba(255,255,255,0.06)',
                color: entry.rank === 1 ? '#FCD34D' : entry.rank === 2 ? '#D1D5DB' : entry.rank === 3 ? '#D97706' : 'rgba(255,255,255,0.4)',
              }}>{entry.rank}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate" style={{ color: '#FFFFFF' }}>{entry.name}</span>
                  <span className="text-xs shrink-0 ml-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{Math.round(entry.progress * 10) / 10} {data.challenge.target_unit}</span>
                </div>
                <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, entry.pct_complete)}%`, background: '#00E5A0' }} />
                </div>
              </div>
              <span className="text-xs font-medium shrink-0 w-10 text-right" style={{ color: '#00E5A0' }}>{entry.pct_complete}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Challenges Sidebar ────────────────────────────────────────────────────────
function ChallengesSidebar({ isCoach }: { isCoach: boolean }) {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [joining, setJoining]       = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ challenge: any; leaderboard: any[] } | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => { apiFetch('/api/challenges').then(setChallenges).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const join = async (id: string) => {
    setJoining(id);
    try {
      await apiFetch(`/api/challenges/${id}/join`, { method: 'POST' });
      setChallenges(prev => prev.map(c => c.id === id ? { ...c, joined: true } : c));
    } catch {}
    finally { setJoining(null); }
  };

  const openLeaderboard = async (id: string) => {
    try { const data = await apiFetch(`/api/challenges/${id}/leaderboard`); setLeaderboard(data); } catch {}
  };

  return (
    <>
      {leaderboard && <LeaderboardModal data={leaderboard} onClose={() => setLeaderboard(null)} />}
      {showCreate && <CreateChallengeModal onClose={() => setShowCreate(false)} onCreated={ch => { setChallenges(prev => [ch, ...prev]); setShowCreate(false); }} />}
      <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm" style={{ color: '#FFFFFF' }}>Active Challenges</h3>
          {isCoach && (
            <button type="button" className="text-xs font-medium transition-all"
              style={{ color: '#00E5A0', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setShowCreate(true)}>+ Create</button>
          )}
        </div>
        {loading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : challenges.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.30)' }}>No active challenges yet.</p>
            {isCoach && (
              <button type="button" onClick={() => setShowCreate(true)}
                className="text-xs font-semibold px-4 py-1.5 rounded-full transition-all"
                style={{ background: 'rgba(0,229,160,0.10)', color: '#00E5A0', border: '1px solid rgba(0,229,160,0.25)', cursor: 'pointer' }}>
                + Create Challenge
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {challenges.slice(0, 4).map(ch => (
              <div key={ch.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderTop: '2px solid #00E5A0', borderRadius: 12, padding: 14 }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-snug truncate" style={{ color: '#FFFFFF' }}>{ch.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {ch.days_remaining}d left · {ch.participant_count} athlete{ch.participant_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {ch.joined ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: 'rgba(0,229,160,0.12)', color: '#00E5A0' }}>Joined</span>
                  ) : (
                    <button type="button" onClick={() => join(ch.id)} disabled={joining === ch.id}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 transition-all"
                      style={{ background: '#00E5A0', color: '#000', border: 'none', cursor: 'pointer' }}>
                      {joining === ch.id ? '…' : 'Join'}
                    </button>
                  )}
                </div>
                {ch.joined && (
                  <div className="mb-2">
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, ch.pct_complete)}%`, background: '#00E5A0' }} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{Math.round(ch.my_progress * 10) / 10} / {ch.target_value} {ch.target_unit}</span>
                      <span className="text-[10px] font-semibold" style={{ color: '#00E5A0' }}>{ch.pct_complete}%</span>
                    </div>
                  </div>
                )}
                <button type="button" onClick={() => openLeaderboard(ch.id)}
                  style={{ color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; }}>
                  View leaderboard →
                </button>
              </div>
            ))}
            {challenges.length > 4 && (
              <p className="text-xs text-center pt-1" style={{ color: '#00E5A0' }}>+{challenges.length - 4} more challenges</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Top Athletes Sidebar ──────────────────────────────────────────────────────
function TopAthletesSidebar() {
  const [athletes, setAthletes] = useState<any[]>([]);
  useEffect(() => { apiFetch('/api/community/top-athletes').then(setAthletes).catch(() => {}); }, []);
  if (athletes.length === 0) return null;
  return (
    <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 20 }}>
      <h3 className="font-semibold text-sm mb-4" style={{ color: '#FFFFFF' }}>Top Athletes This Week</h3>
      <div className="space-y-3">
        {athletes.slice(0, 5).map((athlete: any, i: number) => (
          <div key={athlete.id} className="flex items-center gap-3">
            <span className="w-5 text-xs font-bold text-center shrink-0"
              style={{ color: i === 0 ? '#FCD34D' : i === 1 ? '#D1D5DB' : i === 2 ? '#D97706' : 'rgba(255,255,255,0.3)' }}>
              {i + 1}
            </span>
            <UserAvatar name={athlete.name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: '#FFFFFF' }}>{athlete.name}</p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{athlete.weekly_miles} mi this week</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Community Page ───────────────────────────────────────────────────────
export function Community() {
  const { profile, clearAuth, role, logout } = useAuthStore();
  const nav = useNavigate();
  const isCoach = role === 'coach';

  const [posts, setPosts]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [pendingPosts, setPendingPosts] = useState<any[]>([]);
  const [activeTopic, setActiveTopic] = useState('general');
  const knownPostIdsRef = useRef<Set<string>>(new Set());
  const newestPostIdRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => { loadPage(1, true, activeTopic); }, [activeTopic]);

  // 15-second poll: detect new posts + silently refresh counts
  // Sends lastSeenId so the backend can short-circuit with { unchanged: true }
  // when nothing new has arrived — keeps Railway logs silent on idle polls.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const lastSeenId = newestPostIdRef.current;
        const url = lastSeenId
          ? `/api/community/feed?page=1&lastSeenId=${encodeURIComponent(lastSeenId)}`
          : '/api/community/feed?page=1';
        const data = await apiFetch(url);

        if (data.unchanged) return;

        const fresh: any[] = data.posts ?? [];

        if (fresh.length > 0) newestPostIdRef.current = fresh[0].id;

        // Find posts not yet shown
        const newOnes = fresh.filter(p => !knownPostIdsRef.current.has(p.id));
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

  const deletePost = (postId: string) => setPosts(prev => prev.filter(p => p.id !== postId));
  const editPost   = (postId: string, newBody: string) => setPosts(prev => prev.map(p => p.id === postId ? { ...p, body: newBody } : p));

  return (
    <AppLayout role={role ?? 'athlete'} name={profile?.name} onLogout={handleLogout}>
      <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)', overflowX: 'hidden' }}>
        {showCreate && (
          <CreatePostModal
            onClose={() => setShowCreate(false)}
            onPost={post => setPosts(prev => [post, ...prev])}
          />
        )}

        <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          {/* Header */}
          <div className="mb-4">
            <h1 className="font-bold text-2xl sm:text-3xl" style={{ color: '#FFFFFF' }}>Community</h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Where wins get celebrated.</p>
          </div>

          {/* Two-column layout */}
          <div className="flex flex-col lg:flex-row gap-8 items-start">

            {/* LEFT — Feed, max 680px */}
            <div className="flex-1 min-w-0">
              <div style={{ maxWidth: 680 }}>
                <ComposerBar name={profile?.name ?? 'A'} onClick={() => setShowCreate(true)} />

                {/* Topic tabs */}
                <div className="flex gap-2 overflow-x-auto pb-1 mb-4 mt-3 w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {TOPICS.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setActiveTopic(t.value)}
                      className="shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-150"
                      style={activeTopic === t.value
                        ? { background: '#00E5A0', color: '#000', border: 'none', cursor: 'pointer' }
                        : { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: 'none', cursor: 'pointer' }
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
                    background: '#111111',
                    backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 16, padding: '72px 32px', textAlign: 'center',
                  }}>
                    <p className="font-bold text-xl mb-3" style={{ color: '#FFFFFF' }}>Nothing here yet</p>
                    <p className="text-sm mb-8 mx-auto" style={{ color: 'rgba(255,255,255,0.40)', maxWidth: 320, lineHeight: 1.65 }}>
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
                      />
                    ))}
                    {loadingMore && <div className="flex justify-center py-4"><Spinner /></div>}
                    <div ref={sentinelRef} className="h-4" />
                    {!hasMore && posts.length > 8 && (
                      <p className="text-center text-xs py-4" style={{ color: 'rgba(255,255,255,0.20)' }}>
                        You're all caught up
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — Sidebar (desktop only) */}
            <div className="hidden lg:block w-80 shrink-0 sticky top-8">
              <ChallengesSidebar isCoach={isCoach} />
              <TopAthletesSidebar />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
