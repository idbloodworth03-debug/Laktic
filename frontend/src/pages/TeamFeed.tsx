import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Spinner, EmptyState } from '../components/ui';

type FeedPost = {
  id: string;
  feed_type: string;
  body: string;
  created_at: string;
  kudo_count: number;
  i_kudoed: boolean;
  athlete_profiles: { id: string; name: string };
};

const FEED_TYPE_LABEL: Record<string, string> = {
  activity: 'activity',
  race_result: 'race',
  milestone: 'milestone',
  manual: 'post',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function TeamFeed() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [postText, setPostText] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const loadFeed = () => {
    apiFetch('/api/athlete/feed')
      .then(setPosts)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadFeed, []);

  const handlePost = async () => {
    if (!postText.trim()) return;
    setPosting(true);
    try {
      const newPost = await apiFetch('/api/athlete/feed', {
        method: 'POST',
        body: JSON.stringify({ body: postText.trim() }),
      });
      setPosts(prev => [{
        ...newPost,
        kudo_count: 0,
        i_kudoed: false,
        athlete_profiles: { id: '', name: profile?.name ?? '' },
      }, ...prev]);
      setPostText('');
      setShowCompose(false);
    } catch (e: any) {
      console.error(e.message);
    } finally {
      setPosting(false);
    }
  };

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
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 fade-up gap-3">
            <div>
              <h1 className="text-3xl font-bold">Team Feed</h1>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">See what your teammates are up to.</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setShowCompose(v => !v);
                setTimeout(() => textRef.current?.focus(), 50);
              }}
            >
              Post update
            </Button>
          </div>

          {showCompose && (
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-accent)]/20 rounded-xl p-4 mb-6 fade-up">
              <textarea
                ref={textRef}
                value={postText}
                onChange={e => setPostText(e.target.value)}
                placeholder="Share a run, a win, or some motivation with your team…"
                rows={3}
                maxLength={500}
                className="w-full bg-[var(--color-bg-tertiary)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] resize-none outline-none border border-[var(--color-border)] focus:border-[var(--color-accent)]"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-[var(--color-text-tertiary)] font-mono">{postText.length}/500</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowCompose(false)}>Cancel</Button>
                  <Button size="sm" loading={posting} onClick={handlePost} disabled={!postText.trim()}>Post</Button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : posts.length === 0 ? (
            <EmptyState
              title="No posts yet"
              message="Once teammates log activities or post updates, they'll show up here."
              action={
                <Button size="sm" variant="secondary" onClick={() => setShowCompose(true)}>
                  Be the first to post
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              {posts.map(post => (
                <FeedCard key={post.id} post={post} onKudo={toggleKudo} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function FeedCard({ post, onKudo }: { post: FeedPost; onKudo: (id: string) => void }) {
  const typeLabel = FEED_TYPE_LABEL[post.feed_type] ?? 'post';
  const athleteName = post.athlete_profiles?.name ?? 'Teammate';
  const initial = athleteName.charAt(0).toUpperCase();

  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-light)] rounded-xl p-4 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/20 flex items-center justify-center text-xs font-bold text-[var(--color-accent)] shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{athleteName}</span>
            <span className="text-xs text-[var(--color-text-tertiary)] capitalize">{typeLabel}</span>
            <span className="text-xs text-[var(--color-text-tertiary)] ml-auto shrink-0">{timeAgo(post.created_at)}</span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{post.body}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-[var(--color-border)]/50">
        <button
          onClick={() => onKudo(post.id)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all"
          style={post.i_kudoed
            ? { background: 'var(--color-accent-dim)', color: 'var(--color-accent)', border: '1px solid rgba(0,229,160,0.3)' }
            : { color: 'var(--color-text-tertiary)', border: '1px solid transparent' }
          }
        >
          {post.kudo_count > 0 ? post.kudo_count : ''} {post.kudo_count === 1 ? 'kudo' : post.kudo_count > 1 ? 'kudos' : 'Kudo'}
        </button>
      </div>
    </div>
  );
}
