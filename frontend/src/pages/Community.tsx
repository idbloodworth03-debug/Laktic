import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Spinner, EmptyState, Badge, Input } from '../components/ui';

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
function PostCard({
  post,
  onKudo,
}: {
  post: any;
  onKudo: (id: string) => void;
}) {
  const name: string = post.athlete_profiles?.name ?? 'Athlete';
  const initial = name.charAt(0).toUpperCase();
  const typeColor = POST_TYPE_COLOR[post.feed_type] ?? 'gray';
  const typeLabel = POST_TYPE_LABEL[post.feed_type] ?? 'post';

  return (
    <article className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border2)] rounded-2xl overflow-hidden transition-all duration-150 fade-up">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-900 to-brand-950 border border-brand-800/60 flex items-center justify-center text-sm font-bold text-brand-300 shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[var(--text)]">{name}</span>
              <Badge label={typeLabel} color={typeColor} />
              {post.sport_channel && (
                <span className="text-xs text-[var(--muted)] capitalize">{post.sport_channel}</span>
              )}
              {post.scope === 'public' && (
                <span className="text-[10px] text-[var(--muted2)] border border-[var(--border)] rounded-full px-1.5 py-0.5">public</span>
              )}
            </div>
            <div className="text-xs text-[var(--muted)] mt-0.5">{timeAgo(post.created_at)}</div>
          </div>
        </div>

        {/* Body */}
        <p className="text-sm text-[var(--text2)] leading-relaxed mb-3">{post.body}</p>

        {/* Image */}
        {post.image_url && (
          <div className="mb-3 rounded-xl overflow-hidden border border-[var(--border)]">
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
      <div className="border-t border-[var(--border)]/50 px-4 py-2.5 flex items-center gap-1">
        <button
          onClick={() => onKudo(post.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            post.i_kudoed
              ? 'bg-brand-900/60 text-brand-400 border border-brand-700/60'
              : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)]'
          }`}
        >
          <span>
            {post.kudo_count > 0
              ? `${post.kudo_count} ${post.kudo_count === 1 ? 'kudo' : 'kudos'}`
              : 'Kudo'}
          </span>
        </button>
      </div>
    </article>
  );
}

// ── Create Post Modal ──────────────────────────────────────────────────────────
function CreatePostModal({
  onClose,
  onPost,
}: {
  onClose: () => void;
  onPost: (post: any) => void;
}) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border2)] rounded-2xl shadow-2xl fade-up overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-display font-semibold text-base">Share with the Community</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] text-lg"
          >×</button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* AI Caption chips */}
          {captions && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--muted)] font-medium">AI suggestions — tap to use:</p>
              <div className="flex flex-col gap-1.5">
                {captionValues.map((cap, i) => (
                  <button
                    key={i}
                    onClick={() => setBody(cap)}
                    className={`text-left text-xs px-3 py-2.5 rounded-xl border transition-all leading-relaxed ${
                      body === cap
                        ? 'border-brand-500 bg-brand-950/40 text-brand-300'
                        : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-600 hover:text-[var(--text)] hover:bg-[var(--surface2)]'
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60 block mb-0.5">{CAPTION_STYLES[i]}</span>
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
              className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--muted)] resize-none focus:outline-none focus:border-brand-500 transition-colors"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-[var(--muted2)]">{body.length}/500</span>
              {captionError && <span className="text-xs text-red-400">{captionError}</span>}
            </div>
          </div>

          {/* Image upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImagePick}
            />
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-[var(--border)]">
                <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-cover" />
                <button
                  onClick={removeImage}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors text-sm"
                >×</button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-[var(--border)] rounded-xl py-3 text-xs text-[var(--muted)] hover:text-brand-400 hover:border-brand-700 transition-colors flex items-center justify-center gap-2"
              >
                Add photo (optional · max 5 MB)
              </button>
            )}
          </div>

          {/* Channel selector */}
          <div>
            <label className="text-xs font-medium text-[var(--muted)] block mb-2">Sport channel</label>
            <div className="flex flex-wrap gap-1.5">
              {(['track', 'xc', 'triathlon', 'road', 'swimming', 'general'] as const).map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannel(prev => prev === ch ? '' : ch)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all capitalize ${
                    channel === ch
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-600'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {/* Scope */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--muted)]">Visible to:</span>
            {(['public', 'team'] as const).map(s => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  scope === s
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-600'
                }`}
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
              className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-40"
            >
              {generatingCaptions
                ? <><span className="w-3 h-3 border border-brand-400 border-t-transparent rounded-full animate-spin inline-block" /> Generating…</>
                : <>AI Caption</>
              }
            </button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                loading={posting || uploading}
                disabled={!body.trim()}
                onClick={submit}
              >
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
function CreateChallengeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (challenge: any) => void;
}) {
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

  // Sync unit to metric choice
  const handleMetricChange = (m: typeof metric) => {
    setMetric(m);
    setTargetUnit(METRIC_LABELS[m]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border2)] rounded-2xl shadow-2xl fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-display font-semibold text-base">Create a Challenge</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] text-lg">×</button>
        </div>

        <div className="p-5 space-y-4">
          <Input
            label="Challenge title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. October Miles Challenge"
          />

          <div>
            <label className="text-xs font-medium text-[var(--text2)] uppercase tracking-wide block mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this challenge about?"
              rows={2}
              className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] resize-none focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          {/* Metric */}
          <div>
            <label className="text-xs font-medium text-[var(--muted)] block mb-2">Track by</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['miles', 'workouts', 'hours', 'elevation_ft'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => handleMetricChange(m)}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border transition-all text-center capitalize ${
                    metric === m
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-600'
                  }`}
                >
                  {m.replace('_ft', ' ft')}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={`Target (${METRIC_LABELS[metric]})`}
              type="number"
              min="1"
              value={targetValue}
              onChange={e => setTargetValue(e.target.value)}
              placeholder="e.g. 100"
            />
            <Input
              label="Ends on"
              type="date"
              value={endsAt}
              onChange={e => setEndsAt(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
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
        className="relative w-full max-w-md bg-[var(--surface)] border border-[var(--border2)] rounded-2xl shadow-2xl p-6 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] text-lg">×</button>
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-display font-semibold text-base">{data.challenge.title}</h3>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Target: {data.challenge.target_value} {data.challenge.target_unit}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {data.leaderboard.length === 0 ? (
            <p className="text-sm text-[var(--muted)] text-center py-8">No participants yet.</p>
          ) : data.leaderboard.map((entry: any) => (
            <div key={entry.athlete_id} className="flex items-center gap-3 py-2.5 border-b border-[var(--border)]/40 last:border-0">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                entry.rank === 1 ? 'bg-amber-500/20 text-amber-300'
                : entry.rank === 2 ? 'bg-gray-400/15 text-gray-300'
                : entry.rank === 3 ? 'bg-amber-700/20 text-amber-500'
                : 'bg-[var(--surface2)] text-[var(--muted)]'
              }`}>{entry.rank}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">{entry.name}</span>
                  <span className="text-xs text-[var(--muted)] shrink-0 ml-2">
                    {Math.round(entry.progress * 10) / 10} {data.challenge.target_unit}
                  </span>
                </div>
                <div className="w-full bg-[var(--surface2)] rounded-full h-1.5">
                  <div
                    className="bg-brand-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, entry.pct_complete)}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-brand-400 font-medium shrink-0 w-10 text-right">{entry.pct_complete}%</span>
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
        <p className="text-sm text-[var(--muted)]">{challenges.length} active challenge{challenges.length !== 1 ? 's' : ''}</p>
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
              className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 hover:border-[var(--border2)] transition-colors flex flex-col"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-sm text-[var(--text)] leading-snug truncate">{ch.title}</h3>
                  {ch.description && (
                    <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">{ch.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-[var(--muted)] mb-3">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 inline-block" />
                  {ch.participant_count} athlete{ch.participant_count !== 1 ? 's' : ''}
                </span>
                <span>·</span>
                <span>{ch.days_remaining}d left</span>
                <span>·</span>
                <span className="font-medium text-[var(--text2)]">{ch.target_value} {ch.target_unit}</span>
              </div>

              {ch.joined && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[var(--muted)]">Your progress</span>
                    <span className="text-brand-400 font-semibold">
                      {Math.round(ch.my_progress * 10) / 10} / {ch.target_value} {ch.target_unit}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--surface2)] rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-brand-600 to-brand-400 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, ch.pct_complete)}%` }}
                    />
                  </div>
                  <div className="text-right text-[10px] text-brand-400 mt-0.5 font-medium">{ch.pct_complete}%</div>
                </div>
              )}

              <div className="flex gap-2 mt-auto">
                {!ch.joined ? (
                  <Button
                    size="sm"
                    loading={joining === ch.id}
                    onClick={() => join(ch.id)}
                  >
                    Join
                  </Button>
                ) : (
                  <span className="text-xs text-green-400 font-semibold flex items-center gap-1">
                    <span className="w-3.5 h-3.5 rounded-full bg-green-500/20 border border-green-700/50 flex items-center justify-center text-[9px]">✓</span>
                    Joined
                  </span>
                )}
                <Button size="sm" variant="ghost" onClick={() => openLeaderboard(ch.id)}>
                  Leaderboard
                </Button>
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
      // rollback
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, i_kudoed: !p.i_kudoed, kudo_count: p.i_kudoed ? p.kudo_count - 1 : p.kudo_count + 1 }
          : p
      ));
    }
  };

  const tabCls = (active: boolean) =>
    `px-5 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
      active
        ? 'border-brand-500 text-[var(--text)]'
        : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
    }`;

  return (
    <div className="min-h-screen">
      <Navbar role={role ?? 'athlete'} name={profile?.name} onLogout={logout} />

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
            <h1 className="font-display text-3xl font-bold text-[var(--text)]">Community</h1>
            <p className="text-sm text-[var(--muted)] mt-0.5">Where wins get celebrated.</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center border-b border-[var(--border)] mb-6 fade-up-1">
          <button className={tabCls(activeTab === 'feed')} onClick={() => setActiveTab('feed')}>
            Feed
          </button>
          <button className={tabCls(activeTab === 'challenges')} onClick={() => setActiveTab('challenges')}>
            Challenges
          </button>
        </div>

        {/* ── Challenges Tab ── */}
        {activeTab === 'challenges' && (
          <div className="fade-up-1">
            <ChallengesTab isCoach={isCoach} />
          </div>
        )}

        {/* ── Feed Tab ── */}
        {activeTab === 'feed' && (
          <>
            {/* Channel pills */}
            <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 -mx-1 px-1 fade-up-1">
              {CHANNELS.map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all capitalize ${
                    channel === ch
                      ? 'bg-brand-600 border-brand-500 text-white shadow-glow-sm'
                      : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-600 hover:text-[var(--text)]'
                  }`}
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
                  <p className="text-center text-xs text-[var(--muted)] py-4">You've seen it all ✓</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating "+" button for athletes */}
      {isAthlete && activeTab === 'feed' && (
        <button
          onClick={() => setShowCreate(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white rounded-full shadow-btn-primary hover:shadow-btn-primary-hover flex items-center justify-center text-2xl font-light transition-all active:scale-95 z-30"
          aria-label="Create post"
        >
          +
        </button>
      )}
    </div>
  );
}
