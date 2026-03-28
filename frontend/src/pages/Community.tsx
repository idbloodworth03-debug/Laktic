import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Spinner, EmptyState, Badge, Input } from '../components/ui';

// ── Constants ─────────────────────────────────────────────────────────────────
const CHANNELS = ['all', 'track', 'xc', 'triathlon', 'road', 'swimming', 'general'] as const;
type Channel = typeof CHANNELS[number];

const POST_TYPE_LABEL: Record<string, string> = {
  activity: 'activity', race_result: 'race', milestone: 'milestone', manual: 'post',
};
const POST_TYPE_COLOR: Record<string, 'blue' | 'green' | 'amber' | 'gray'> = {
  activity: 'blue', race_result: 'green', milestone: 'amber', manual: 'gray',
};

const METRIC_LABELS: Record<string, string> = {
  miles: 'miles', workouts: 'workouts', hours: 'hours', elevation_ft: 'ft elevation',
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

// ── Upload image to Supabase Storage ──────────────────────────────────────────
async function uploadCommunityImage(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `community/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from('community-images')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return null;
  const { data } = supabase.storage.from('community-images').getPublicUrl(path);
  return data.publicUrl;
}

// ── Post Card ─────────────────────────────────────────────────────────────────
function PostCard({ post, onKudo }: { post: any; onKudo: (id: string) => void }) {
  const name: string = post.athlete_profiles?.name ?? 'Athlete';
  const initial = name.charAt(0).toUpperCase();
  const typeColor = POST_TYPE_COLOR[post.feed_type] ?? 'gray';
  const typeLabel = POST_TYPE_LABEL[post.feed_type] ?? 'post';

  return (
    <article
      className="transition-all duration-150 fade-up"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-light)')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)')}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          {/* Avatar */}
          <div
            className="shrink-0 flex items-center justify-center text-sm font-bold"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--color-accent-dim)',
              border: '1px solid rgba(0,229,160,0.2)',
              color: 'var(--color-accent)',
            }}
          >
            {initial}
          </div>

          {/* Meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{name}</span>
              <Badge label={typeLabel} color={typeColor} />
              {post.sport_channel && (
                <span className="text-xs capitalize" style={{ color: 'var(--color-text-secondary)' }}>{post.sport_channel}</span>
              )}
              {post.scope === 'public' && (
                <span
                  className="text-[10px]"
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 9999,
                    padding: '1px 6px',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  public
                </span>
              )}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{timeAgo(post.created_at)}</div>
          </div>

          {/* Timestamp right-aligned */}
          <span className="text-xs shrink-0 hidden sm:block" style={{ color: 'var(--color-text-tertiary)' }}>
            {new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>

        {/* Body */}
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>{post.body}</p>

        {/* Image */}
        {post.image_url && (
          <div
            className="mb-3 overflow-hidden"
            style={{ borderRadius: 12, border: '1px solid var(--color-border)' }}
          >
            <img
              src={post.image_url}
              alt="Post image"
              className="w-full max-h-80 object-cover"
              loading="lazy"
            />
          </div>
        )}
      </div>

      {/* Reaction bar */}
      <div
        className="px-4 py-2.5 flex items-center gap-1"
        style={{ borderTop: '1px solid rgba(42,42,42,0.5)' }}
      >
        <button
          onClick={() => onKudo(post.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150"
          style={post.i_kudoed ? {
            background: 'var(--color-accent-dim)',
            border: '1px solid rgba(0,229,160,0.3)',
            color: 'var(--color-accent)',
          } : {
            background: 'transparent',
            border: '1px solid transparent',
            color: 'var(--color-text-secondary)',
          }}
        >
          {post.kudo_count > 0
            ? `${post.kudo_count} ${post.kudo_count === 1 ? 'kudo' : 'kudos'}`
            : 'Kudo'}
        </button>
      </div>
    </article>
  );
}

// ── Create Post Modal ──────────────────────────────────────────────────────────
function CreatePostModal({ onClose, onPost }: { onClose: () => void; onPost: (post: any) => void }) {
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<'public' | 'team'>('public');
  const [channel, setChannel] = useState<Channel | ''>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [captions, setCaptions] = useState<{ short: string; hype: string; reflective: string } | null>(null);
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
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const generateCaptions = async () => {
    setGeneratingCaptions(true);
    setCaptionError('');
    try {
      const result = await apiFetch('/api/ai/generate-caption', {
        method: 'POST',
        body: JSON.stringify({ milestone_label: body || undefined }),
      });
      setCaptions(result.captions);
    } catch (e: any) {
      setCaptionError(e.message || 'Failed to generate captions');
    } finally {
      setGeneratingCaptions(false);
    }
  };

  const submit = async () => {
    if (!body.trim()) return;
    setPosting(true);
    setError('');
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
        body: JSON.stringify({
          body: body.trim(),
          scope,
          sport_channel: channel || undefined,
          ...(imageUrl && { image_url: imageUrl }),
        }),
      });
      onPost(post);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to post');
    } finally {
      setPosting(false);
      setUploading(false);
    }
  };

  const CAPTION_STYLES = ['Short', 'Hype', 'Reflective'] as const;
  const captionValues = captions ? [captions.short, captions.hype, captions.reflective] : [];

  const pillBase: React.CSSProperties = {
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 500,
    border: '1px solid var(--color-border)',
    padding: '4px 12px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };
  const pillActive: React.CSSProperties = {
    ...pillBase,
    background: 'var(--color-accent)',
    borderColor: 'var(--color-accent)',
    color: '#000',
  };
  const pillInactive: React.CSSProperties = {
    ...pillBase,
    background: 'transparent',
    color: 'var(--color-text-secondary)',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg fade-up overflow-hidden"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-light)',
          borderRadius: 20,
          boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h2 className="font-semibold text-base" style={{ color: 'var(--color-text-primary)' }}>Share with the Community</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-lg transition-all duration-150"
            style={{ borderRadius: '50%', color: 'var(--color-text-secondary)' }}
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* AI Caption chips */}
          {captions && (
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>AI suggestions — tap to use:</p>
              <div className="flex flex-col gap-1.5">
                {captionValues.map((cap, i) => (
                  <button
                    key={i}
                    onClick={() => setBody(cap)}
                    className="text-left text-xs px-3 py-2.5 rounded-xl transition-all leading-relaxed"
                    style={body === cap ? {
                      border: '1px solid var(--color-accent)',
                      background: 'var(--color-accent-dim)',
                      color: 'var(--color-accent)',
                    } : {
                      border: '1px solid var(--color-border)',
                      background: 'transparent',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    <span className="block mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">{CAPTION_STYLES[i]}</span>
                    {cap}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Text input */}
          <div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Share a run, a win, or some motivation…"
              rows={3}
              maxLength={500}
              autoFocus
              className="w-full text-sm resize-none outline-none transition-all duration-150"
              style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: '12px 14px',
                color: 'var(--color-text-primary)',
              }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--color-accent)'; }}
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
                <button
                  onClick={removeImage}
                  className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center text-white text-sm transition-all"
                  style={{ background: 'rgba(0,0,0,0.6)', borderRadius: '50%' }}
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 text-xs flex items-center justify-center gap-2 transition-all duration-150"
                style={{
                  border: '1px dashed var(--color-border)',
                  borderRadius: 12,
                  color: 'var(--color-text-tertiary)',
                  background: 'transparent',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-tertiary)';
                }}
              >
                Add photo (optional · max 5 MB)
              </button>
            )}
          </div>

          {/* Channel selector */}
          <div>
            <label className="text-xs font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>Sport channel</label>
            <div className="flex flex-wrap gap-1.5">
              {(['track', 'xc', 'triathlon', 'road', 'swimming', 'general'] as const).map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannel(prev => prev === ch ? '' : ch)}
                  style={channel === ch ? pillActive : pillInactive}
                  className="capitalize"
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {/* Scope */}
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Visible to:</span>
            {(['public', 'team'] as const).map(s => (
              <button
                key={s}
                onClick={() => setScope(s)}
                style={scope === s ? pillActive : pillInactive}
              >
                {s === 'public' ? 'Everyone' : 'Team only'}
              </button>
            ))}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Footer actions */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              onClick={generateCaptions}
              disabled={generatingCaptions}
              className="flex items-center gap-1.5 text-xs transition-colors disabled:opacity-40"
              style={{ color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {generatingCaptions
                ? <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" /> Generating…</>
                : 'AI Caption'}
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

// ── Create Challenge Modal (coach only) ───────────────────────────────────────
function CreateChallengeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (challenge: any) => void }) {
  const [title, setTitle] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [targetUnit, setTargetUnit] = useState('miles');
  const [metric, setMetric] = useState<'miles' | 'workouts' | 'hours' | 'elevation_ft'>('miles');
  const [endsAt, setEndsAt] = useState('');
  const [description, setDescription] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim() || !targetValue || !endsAt) {
      setError('Title, target, and end date are required.');
      return;
    }
    setPosting(true);
    setError('');
    try {
      const ch = await apiFetch('/api/challenges', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          target_value: parseFloat(targetValue),
          target_unit: targetUnit,
          metric,
          ends_at: new Date(endsAt + 'T23:59:59').toISOString(),
        }),
      });
      onCreated(ch);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to create challenge');
    } finally {
      setPosting(false);
    }
  };

  const handleMetricChange = (m: typeof metric) => {
    setMetric(m);
    setTargetUnit(METRIC_LABELS[m]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg fade-up"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-light)',
          borderRadius: 20,
          boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h2 className="font-semibold text-base" style={{ color: 'var(--color-text-primary)' }}>Create a Challenge</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-lg" style={{ color: 'var(--color-text-secondary)' }}>×</button>
        </div>

        <div className="p-5 space-y-4">
          <Input label="Challenge title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. October Miles Challenge" />

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this challenge about?"
              rows={2}
              className="w-full text-sm resize-none outline-none transition-all duration-150"
              style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--color-text-primary)',
              }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--color-accent)'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--color-border)'; }}
            />
          </div>

          {/* Metric */}
          <div>
            <label className="text-xs font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>Track by</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['miles', 'workouts', 'hours', 'elevation_ft'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => handleMetricChange(m)}
                  className="py-2 px-2 text-xs font-medium text-center capitalize transition-all duration-150"
                  style={metric === m ? {
                    background: 'var(--color-accent)',
                    border: '1px solid var(--color-accent)',
                    borderRadius: 12,
                    color: '#000',
                  } : {
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    color: 'var(--color-text-secondary)',
                  }}
                >
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
            <Button size="sm" loading={posting} disabled={!title.trim() || !targetValue || !endsAt} onClick={submit}>
              Create Challenge
            </Button>
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md p-6 max-h-[80vh] flex flex-col"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-light)',
          borderRadius: 20,
          boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center text-lg"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ×
        </button>
        <div className="mb-4">
          <h3 className="font-semibold text-base" style={{ color: 'var(--color-text-primary)' }}>{data.challenge.title}</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            Target: {data.challenge.target_value} {data.challenge.target_unit}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {data.leaderboard.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-secondary)' }}>No participants yet.</p>
          ) : data.leaderboard.map((entry: any) => (
            <div
              key={entry.athlete_id}
              className="flex items-center gap-3 py-2.5"
              style={{ borderBottom: '1px solid rgba(42,42,42,0.4)' }}
            >
              <span
                className="w-7 h-7 flex items-center justify-center text-sm font-bold shrink-0"
                style={{
                  borderRadius: '50%',
                  background: entry.rank === 1 ? 'rgba(245,158,11,0.2)'
                    : entry.rank === 2 ? 'rgba(160,160,160,0.15)'
                    : entry.rank === 3 ? 'rgba(180,83,9,0.2)'
                    : 'var(--color-bg-tertiary)',
                  color: entry.rank === 1 ? '#FCD34D'
                    : entry.rank === 2 ? '#D1D5DB'
                    : entry.rank === 3 ? '#D97706'
                    : 'var(--color-text-secondary)',
                }}
              >
                {entry.rank}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{entry.name}</span>
                  <span className="text-xs shrink-0 ml-2" style={{ color: 'var(--color-text-secondary)' }}>
                    {Math.round(entry.progress * 10) / 10} {data.challenge.target_unit}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full" style={{ background: 'var(--color-bg-tertiary)' }}>
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, entry.pct_complete)}%`, background: 'var(--color-accent)' }}
                  />
                </div>
              </div>
              <span className="text-xs font-medium shrink-0 w-10 text-right" style={{ color: 'var(--color-accent)' }}>{entry.pct_complete}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Challenges Tab ────────────────────────────────────────────────────────────
function ChallengesTab({ isCoach }: { isCoach: boolean }) {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<{ challenge: any; leaderboard: any[] } | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    apiFetch('/api/challenges')
      .then(setChallenges)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const join = async (id: string) => {
    setJoining(id);
    try {
      await apiFetch(`/api/challenges/${id}/join`, { method: 'POST' });
      setChallenges(prev => prev.map(c => c.id === id ? { ...c, joined: true } : c));
    } catch (e: any) { console.error(e); }
    finally { setJoining(null); }
  };

  const openLeaderboard = async (id: string) => {
    try {
      const data = await apiFetch(`/api/challenges/${id}/leaderboard`);
      setLeaderboard(data);
    } catch (e: any) { console.error(e); }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <>
      {leaderboard && <LeaderboardModal data={leaderboard} onClose={() => setLeaderboard(null)} />}
      {showCreate && (
        <CreateChallengeModal
          onClose={() => setShowCreate(false)}
          onCreated={ch => { setChallenges(prev => [ch, ...prev]); }}
        />
      )}

      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {challenges.length} active challenge{challenges.length !== 1 ? 's' : ''}
        </p>
        {isCoach && (
          <Button size="sm" variant="secondary" onClick={() => setShowCreate(true)}>
            + Create Challenge
          </Button>
        )}
      </div>

      {challenges.length === 0 ? (
        <EmptyState
          title="No active challenges"
          message={isCoach
            ? 'Create a challenge for your athletes — miles, workouts, or elevation.'
            : 'Challenges will appear here when coaches create them.'}
          action={isCoach ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>Create Challenge</Button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {challenges.map(ch => (
            <div
              key={ch.id}
              className="flex flex-col transition-all duration-150"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 16,
                padding: 16,
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-light)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)')}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm leading-snug truncate" style={{ color: 'var(--color-text-primary)' }}>{ch.title}</h3>
                  {ch.description && (
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>{ch.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--color-accent)' }} />
                  {ch.participant_count} athlete{ch.participant_count !== 1 ? 's' : ''}
                </span>
                <span>·</span>
                <span>{ch.days_remaining}d left</span>
                <span>·</span>
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{ch.target_value} {ch.target_unit}</span>
              </div>

              {ch.joined && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span style={{ color: 'var(--color-text-secondary)' }}>Your progress</span>
                    <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                      {Math.round(ch.my_progress * 10) / 10} / {ch.target_value} {ch.target_unit}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-tertiary)' }}>
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, ch.pct_complete)}%`, background: 'var(--color-accent)' }}
                    />
                  </div>
                  <div className="text-right text-[10px] mt-0.5 font-medium" style={{ color: 'var(--color-accent)' }}>{ch.pct_complete}%</div>
                </div>
              )}

              <div className="flex gap-2 mt-auto">
                {!ch.joined ? (
                  <Button size="sm" loading={joining === ch.id} onClick={() => join(ch.id)}>Join</Button>
                ) : (
                  <span className="text-xs font-semibold flex items-center gap-1" style={{ color: '#4ADE80' }}>
                    <span
                      className="w-3.5 h-3.5 flex items-center justify-center text-[9px]"
                      style={{ borderRadius: '50%', background: 'rgba(74,222,128,0.2)', border: '1px solid rgba(74,222,128,0.5)' }}
                    >
                      ✓
                    </span>
                    Joined
                  </span>
                )}
                <Button size="sm" variant="ghost" onClick={() => openLeaderboard(ch.id)}>Leaderboard</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Main Community Page ───────────────────────────────────────────────────────
export function Community() {
  const { profile, clearAuth, role } = useAuthStore();
  const nav = useNavigate();
  const isCoach = role === 'coach';
  const isAthlete = role === 'athlete';

  const [activeTab, setActiveTab] = useState<'feed' | 'challenges'>('feed');
  const [channel, setChannel] = useState<Channel>('all');
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const loadPage = async (pg: number, ch: Channel, reset: boolean) => {
    if (reset) { setLoading(true); setPosts([]); } else setLoadingMore(true);
    try {
      const data = await apiFetch(`/api/community/feed?page=${pg}&channel=${ch}`);
      setPosts(prev => reset ? data.posts : [...prev, ...data.posts]);
      setHasMore(data.hasMore);
      setPage(pg);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  };

  useEffect(() => { loadPage(1, channel, true); }, [channel]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        loadPage(page + 1, channel, false);
      }
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, page, channel]);

  const toggleKudo = async (postId: string) => {
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, i_kudoed: !p.i_kudoed, kudo_count: p.i_kudoed ? p.kudo_count - 1 : p.kudo_count + 1 }
        : p
    ));
    try {
      await apiFetch(`/api/athlete/feed/${postId}/kudos`, { method: 'POST' });
    } catch {
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, i_kudoed: !p.i_kudoed, kudo_count: p.i_kudoed ? p.kudo_count - 1 : p.kudo_count + 1 }
          : p
      ));
    }
  };

  return (
    <AppLayout role={role ?? 'athlete'} name={profile?.name} onLogout={logout}>
      <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
        {showCreate && isAthlete && (
          <CreatePostModal
            onClose={() => setShowCreate(false)}
            onPost={post => setPosts(prev => [post, ...prev])}
          />
        )}

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 fade-up">
            <div>
              <h1 className="font-bold text-3xl" style={{ color: 'var(--color-text-primary)' }}>Community</h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>Where wins get celebrated.</p>
            </div>
            {isAthlete && (
              <Button onClick={() => setShowCreate(true)}>
                + Create Post
              </Button>
            )}
          </div>

          {/* Tab bar */}
          <div
            className="flex items-center mb-6 fade-up-1"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            {(['feed', 'challenges'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className="px-5 py-2.5 text-sm font-medium transition-all capitalize"
                style={{
                  borderBottom: activeTab === t ? '2px solid var(--color-accent)' : '2px solid transparent',
                  marginBottom: -1,
                  color: activeTab === t ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  background: 'transparent',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Challenges Tab */}
          {activeTab === 'challenges' && (
            <div className="fade-up-1">
              <ChallengesTab isCoach={isCoach} />
            </div>
          )}

          {/* Feed Tab */}
          {activeTab === 'feed' && (
            <>
              {/* Channel pill bar — horizontal scrollable */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1 fade-up-1" style={{ scrollbarWidth: 'none' }}>
                {CHANNELS.map(ch => (
                  <button
                    key={ch}
                    onClick={() => setChannel(ch)}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all duration-150"
                    style={channel === ch ? {
                      background: 'var(--color-accent)',
                      border: '1px solid var(--color-accent)',
                      color: '#000',
                    } : {
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {ch}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="flex justify-center py-20"><Spinner size="lg" /></div>
              ) : posts.length === 0 ? (
                <EmptyState
                  title="Nothing here yet"
                  message={isAthlete
                    ? 'Be the first to share something in this channel.'
                    : 'Athletes will post here once they join the community.'}
                  action={isAthlete ? (
                    <Button size="sm" onClick={() => setShowCreate(true)}>Share something</Button>
                  ) : undefined}
                />
              ) : (
                <div className="space-y-4 fade-up-2">
                  {posts.map(post => (
                    <PostCard key={post.id} post={post} onKudo={isAthlete ? toggleKudo : () => {}} />
                  ))}
                  {loadingMore && (
                    <div className="flex justify-center py-4"><Spinner /></div>
                  )}
                  <div ref={sentinelRef} className="h-4" />
                  {!hasMore && posts.length > 10 && (
                    <p className="text-center text-xs py-4" style={{ color: 'var(--color-text-tertiary)' }}>
                      You've seen it all
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
