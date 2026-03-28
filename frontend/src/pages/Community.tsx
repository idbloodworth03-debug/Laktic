import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Spinner, EmptyState, Badge } from '../components/ui';

const CHANNELS = ['all', 'track', 'xc', 'triathlon', 'road', 'swimming', 'general'] as const;
type Channel = typeof CHANNELS[number];

const CHANNEL_EMOJI: Record<Channel, string> = {
  all: '🌐', track: '🏟️', xc: '🌲', triathlon: '🏊', road: '🛣️', swimming: '🏊', general: '💬',
};

const POST_TYPE_COLORS: Record<string, string> = {
  activity: 'blue', race_result: 'green', milestone: 'amber', manual: 'gray',
};

const POST_TYPE_ICON: Record<string, string> = {
  activity: '🏃', race_result: '🏅', milestone: '⭐', manual: '💬',
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

// ── Post Card ─────────────────────────────────────────────────────────────────
function PostCard({
  post,
  currentAthleteId,
  onKudo,
}: {
  post: any;
  currentAthleteId: string;
  onKudo: (id: string) => void;
}) {
  const name = post.athlete_profiles?.name ?? 'Athlete';
  const initial = name.charAt(0).toUpperCase();
  const icon = POST_TYPE_ICON[post.feed_type] ?? '💬';
  const colorKey = POST_TYPE_COLORS[post.feed_type] ?? 'gray';

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border2)] rounded-xl p-4 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-[var(--surface2)] border border-[var(--border2)] flex items-center justify-center text-sm font-bold text-brand-400 shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-[var(--text)]">{name}</span>
            <span className="text-base leading-none">{icon}</span>
            <Badge label={post.feed_type} color={colorKey as any} />
            {post.sport_channel && (
              <span className="text-xs text-[var(--muted)] capitalize">{CHANNEL_EMOJI[post.sport_channel as Channel] ?? ''} {post.sport_channel}</span>
            )}
            <span className="text-xs text-[var(--muted)] ml-auto">{timeAgo(post.created_at)}</span>
          </div>
          <p className="text-sm text-[var(--text2)] leading-relaxed">{post.body}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-[var(--border)]/40">
        <button
          onClick={() => onKudo(post.id)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
            post.i_kudoed
              ? 'bg-brand-900/50 text-brand-400 border border-brand-700/50'
              : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)]'
          }`}
        >
          <span>{post.i_kudoed ? '❤️' : '🤍'}</span>
          <span>
            {post.kudo_count > 0
              ? `${post.kudo_count} ${post.kudo_count === 1 ? 'kudo' : 'kudos'}`
              : 'Give kudos'}
          </span>
        </button>
      </div>
    </div>
  );
}

// ── Create Post Modal ─────────────────────────────────────────────────────────
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
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  // Caption generation
  const [captions, setCaptions] = useState<{ short: string; hype: string; reflective: string } | null>(null);
  const [generatingCaptions, setGeneratingCaptions] = useState(false);
  const [captionError, setCaptionError] = useState('');

  const generateCaptions = async () => {
    setGeneratingCaptions(true);
    setCaptionError('');
    try {
      const { captions: caps } = await apiFetch('/api/ai/generate-caption', {
        method: 'POST',
        body: JSON.stringify({ milestone_label: body || undefined }),
      });
      setCaptions(caps);
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
      const post = await apiFetch('/api/community/posts', {
        method: 'POST',
        body: JSON.stringify({
          body: body.trim(),
          scope,
          sport_channel: channel || undefined,
        }),
      });
      onPost(post);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border2)] rounded-2xl shadow-2xl p-6 fade-up"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] text-lg"
        >×</button>

        <h2 className="font-display font-semibold text-lg mb-4">Share with the Community</h2>

        {/* AI Caption chips */}
        {captions && (
          <div className="mb-3 flex flex-col gap-2">
            <p className="text-xs text-[var(--muted)] font-medium">Pick a caption or edit below:</p>
            {[captions.short, captions.hype, captions.reflective].map((cap, i) => (
              <button
                key={i}
                onClick={() => setBody(cap)}
                className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                  body === cap
                    ? 'border-brand-500 bg-brand-900/30 text-brand-300'
                    : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-500 hover:text-[var(--text)]'
                }`}
              >
                {cap}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Share a run, a win, or some motivation…"
          rows={3}
          maxLength={500}
          autoFocus
          className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--muted)] resize-none focus:outline-none focus:border-brand-500 transition-colors mb-4"
        />

        {captionError && <p className="text-xs text-red-400 mb-3">{captionError}</p>}

        {/* Channel selector */}
        <div className="mb-4">
          <label className="text-xs font-medium text-[var(--muted)] block mb-2">Sport channel (optional)</label>
          <div className="flex flex-wrap gap-1.5">
            {(['track', 'xc', 'triathlon', 'road', 'swimming', 'general'] as const).map(ch => (
              <button
                key={ch}
                onClick={() => setChannel(prev => prev === ch ? '' : ch)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
                  channel === ch
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-500'
                }`}
              >
                {CHANNEL_EMOJI[ch]} {ch}
              </button>
            ))}
          </div>
        </div>

        {/* Scope toggle */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-[var(--muted)]">Visible to:</span>
          <button
            onClick={() => setScope('public')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              scope === 'public' ? 'bg-brand-600 border-brand-500 text-white' : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-500'
            }`}
          >
            🌐 Everyone
          </button>
          <button
            onClick={() => setScope('team')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              scope === 'team' ? 'bg-brand-600 border-brand-500 text-white' : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-500'
            }`}
          >
            🏟️ Team only
          </button>
        </div>

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={generateCaptions}
            disabled={generatingCaptions}
            className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
          >
            {generatingCaptions ? <span className="w-3 h-3 border border-brand-400 border-t-transparent rounded-full animate-spin inline-block" /> : '✨'}
            {generatingCaptions ? 'Generating…' : 'Generate Caption'}
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={posting} disabled={!body.trim()} onClick={submit}>Post</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Challenges Tab ────────────────────────────────────────────────────────────
function ChallengesTab({ athleteId }: { athleteId: string }) {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<{ challenge: any; leaderboard: any[] } | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/challenges')
      .then(setChallenges)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const join = async (challengeId: string) => {
    setJoining(challengeId);
    try {
      await apiFetch(`/api/challenges/${challengeId}/join`, { method: 'POST' });
      setChallenges(prev =>
        prev.map(c => c.id === challengeId ? { ...c, joined: true } : c)
      );
    } catch (e: any) { console.error(e); }
    finally { setJoining(null); }
  };

  const openLeaderboard = async (challengeId: string) => {
    try {
      const data = await apiFetch(`/api/challenges/${challengeId}/leaderboard`);
      setLeaderboard(data);
    } catch (e: any) { console.error(e); }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <>
      {/* Leaderboard modal */}
      {leaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setLeaderboard(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-[var(--surface)] border border-[var(--border2)] rounded-2xl shadow-2xl p-6 max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setLeaderboard(null)} className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] text-lg">×</button>
            <h3 className="font-display font-semibold text-base mb-1">{leaderboard.challenge.title}</h3>
            <p className="text-xs text-[var(--muted)] mb-4">
              Target: {leaderboard.challenge.target_value} {leaderboard.challenge.target_unit}
            </p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {leaderboard.leaderboard.length === 0 ? (
                <p className="text-sm text-[var(--muted)] text-center py-8">No participants yet.</p>
              ) : leaderboard.leaderboard.map((entry: any) => (
                <div key={entry.athlete_id} className="flex items-center gap-3 py-2 border-b border-[var(--border)]/40 last:border-0">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    entry.rank === 1 ? 'bg-amber-500/20 text-amber-300' : 'bg-[var(--surface2)] text-[var(--muted)]'
                  }`}>{entry.rank}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{entry.name}</span>
                      <span className="text-xs text-[var(--muted)] shrink-0 ml-2">{Math.round(entry.progress * 10) / 10} {leaderboard.challenge.target_unit}</span>
                    </div>
                    <div className="w-full bg-[var(--surface2)] rounded-full h-1.5 mt-1">
                      <div
                        className="bg-brand-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${entry.pct_complete}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-[var(--muted)] shrink-0">{entry.pct_complete}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {challenges.length === 0 ? (
        <EmptyState title="No active challenges" message="Challenges will appear here when coaches create them." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {challenges.map(ch => (
            <div key={ch.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--border2)] transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{ch.sport_emoji}</span>
                    <h3 className="font-display font-semibold text-sm text-[var(--text)]">{ch.title}</h3>
                  </div>
                  {ch.description && (
                    <p className="text-xs text-[var(--muted)] leading-relaxed mb-2">{ch.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                    <span>{ch.participant_count} athletes</span>
                    <span>·</span>
                    <span>{ch.days_remaining}d left</span>
                    <span>·</span>
                    <span>{ch.target_value} {ch.target_unit}</span>
                  </div>
                </div>
              </div>

              {ch.joined && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[var(--muted)]">Your progress</span>
                    <span className="text-brand-400 font-medium">{Math.round(ch.my_progress * 10) / 10} {ch.target_unit}</span>
                  </div>
                  <div className="w-full bg-[var(--surface2)] rounded-full h-2">
                    <div
                      className="bg-brand-500 h-2 rounded-full transition-all"
                      style={{ width: `${ch.pct_complete}%` }}
                    />
                  </div>
                  <div className="text-right text-xs text-[var(--muted)] mt-0.5">{ch.pct_complete}%</div>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                {!ch.joined && (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={joining === ch.id}
                    onClick={() => join(ch.id)}
                  >
                    Join Challenge
                  </Button>
                )}
                {ch.joined && (
                  <span className="text-xs text-green-400 font-medium flex items-center gap-1">✓ Joined</span>
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
  const [activeTab, setActiveTab] = useState<'feed' | 'challenges'>('feed');
  const [channel, setChannel] = useState<Channel>('all');
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [athleteId] = useState('');

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const loadPage = async (pg: number, ch: Channel, reset: boolean) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const data = await apiFetch(`/api/community/feed?page=${pg}&channel=${ch}`);
      if (reset) {
        setPosts(data.posts);
      } else {
        setPosts(prev => [...prev, ...data.posts]);
      }
      setHasMore(data.hasMore);
      setPage(pg);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  };

  useEffect(() => {
    loadPage(1, channel, true);
  }, [channel]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        loadPage(page + 1, channel, false);
      }
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, page, channel]);

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

  const tabCls = (active: boolean) =>
    `px-5 py-2 text-sm font-medium transition-all border-b-2 -mb-px ${
      active ? 'border-brand-500 text-[var(--text)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
    }`;

  return (
    <div className="min-h-screen">
      <Navbar role={role ?? 'athlete'} name={profile?.name} onLogout={logout} />

      {showCreate && (
        <CreatePostModal
          onClose={() => setShowCreate(false)}
          onPost={post => setPosts(prev => [post, ...prev])}
        />
      )}

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-3xl font-bold text-[var(--text)]">Community</h1>
            <p className="text-sm text-[var(--muted)] mt-0.5">Where wins get celebrated.</p>
          </div>
          {role === 'athlete' && (
            <Button size="sm" onClick={() => setShowCreate(true)}>+ Share</Button>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex items-center border-b border-[var(--border)] mb-6 fade-up-1">
          <button className={tabCls(activeTab === 'feed')} onClick={() => setActiveTab('feed')}>Feed</button>
          <button className={tabCls(activeTab === 'challenges')} onClick={() => setActiveTab('challenges')}>Challenges</button>
        </div>

        {activeTab === 'challenges' ? (
          <ChallengesTab athleteId={athleteId} />
        ) : (
          <>
            {/* Channel filter */}
            <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 fade-up-1">
              {CHANNELS.map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all capitalize ${
                    channel === ch
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-500 hover:text-[var(--text)]'
                  }`}
                >
                  {CHANNEL_EMOJI[ch]} {ch}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-20"><Spinner size="lg" /></div>
            ) : posts.length === 0 ? (
              <EmptyState
                title="Nothing here yet"
                message="Be the first to share something in this channel."
                action={role === 'athlete' ? <Button size="sm" onClick={() => setShowCreate(true)}>Share something</Button> : undefined}
              />
            ) : (
              <div className="space-y-4 fade-up-2">
                {posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentAthleteId={athleteId}
                    onKudo={toggleKudo}
                  />
                ))}
                {loadingMore && (
                  <div className="flex justify-center py-4"><Spinner /></div>
                )}
                <div ref={sentinelRef} className="h-4" />
                {!hasMore && posts.length > 0 && (
                  <p className="text-center text-xs text-[var(--muted)] py-4">You've seen everything ✓</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
