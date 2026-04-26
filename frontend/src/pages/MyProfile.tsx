import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { AppLayout, Spinner } from '../components/ui';
import { AvatarUpload } from '../components/AvatarUpload';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const TOPIC_LABELS: Record<string, string> = {
  general: 'General', running: 'Running & PRs', apparel: 'Apparel',
  races: 'Races', fun: 'Fun',
};

type UserStub = { id: string; name: string; username: string | null; avatar_url: string | null };

function UserListModal({
  title,
  users,
  onClose,
  onNavigate,
}: {
  title: string;
  users: UserStub[];
  onClose: () => void;
  onNavigate: (username: string) => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 1000, padding: '0 0 0 0',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-secondary, #111)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480,
          maxHeight: '75vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 20px' }}>
          {users.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14, padding: '32px 0' }}>Nobody here yet.</p>
          ) : (
            users.map(u => (
              <button
                key={u.id}
                onClick={() => u.username ? onNavigate(u.username) : undefined}
                disabled={!u.username}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', background: 'none', border: 'none',
                  padding: '10px 8px', borderRadius: 12, cursor: u.username ? 'pointer' : 'default',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (u.username) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {u.avatar_url
                    ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)' }}>{u.name?.[0]?.toUpperCase() ?? '?'}</span>
                  }
                </div>
                {/* Text */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{u.name}</div>
                  {u.username && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>@{u.username}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function MyProfile() {
  const { profile, role, clearAuth, setAuth, session } = useAuthStore();
  const nav = useNavigate();

  const [name, setName]         = useState(profile?.name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio]           = useState(profile?.running_style ?? '');
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');
  const [saveErr, setSaveErr]   = useState('');

  const [posts, setPosts]           = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  const [followerList, setFollowerList] = useState<UserStub[]>([]);
  const [followingList, setFollowingList] = useState<UserStub[]>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [showList, setShowList] = useState<'followers' | 'following' | null>(null);

  useEffect(() => {
    apiFetch('/api/community/my-posts')
      .then(setPosts)
      .catch(() => {})
      .finally(() => setPostsLoading(false));

    if (profile?.id) {
      Promise.all([
        apiFetch('/api/social/followers'),
        apiFetch('/api/social/following'),
      ]).then(([f1, f2]) => {
        setFollowerList(Array.isArray(f1) ? f1 : []);
        setFollowingList(Array.isArray(f2) ? f2 : []);
        setStatsLoaded(true);
      }).catch(() => setStatsLoaded(true));
    }
  }, []);

  const save = async () => {
    const uClean = username.trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
    if (uClean && uClean.length < 3) {
      setSaveErr('Username must be at least 3 characters.');
      return;
    }
    const nameTrim = name.trim();
    if (!nameTrim) {
      setSaveErr('Name cannot be empty.');
      return;
    }
    setSaving(true);
    setSaveMsg('');
    setSaveErr('');
    try {
      const updated = await apiFetch('/api/athlete/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: nameTrim, ...(uClean ? { username: uClean } : {}), running_style: bio.trim() || null }),
      });
      setAuth(session, role as 'athlete', { ...profile, name: nameTrim, username: uClean || profile?.username, running_style: bio.trim(), ...updated });
      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e: any) {
      setSaveErr(e.message?.includes('unique') ? 'That username is already taken.' : (e.message || 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = (url: string) => {
    setAuth(session, role as 'athlete', { ...profile, avatar_url: url });
  };

  const openProfile = (username: string) => {
    setShowList(null);
    nav(`/athlete/${username}`);
  };

  return (
    <AppLayout role={role ?? undefined} name={profile?.name} onLogout={clearAuth}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 80px' }}>

        {/* Back */}
        <button
          onClick={() => nav(-1)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 24 }}
        >
          ← Back
        </button>

        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 24 }}>My Profile</h1>

        {/* Avatar */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <AvatarUpload
            currentUrl={profile?.avatar_url}
            name={profile?.name ?? 'U'}
            role="athlete"
            onUpload={handleAvatarUpload}
          />
        </div>

        {/* Follower stats */}
        {statsLoaded && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 24 }}>
            <button
              onClick={() => setShowList('followers')}
              style={{ textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: 10, transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{followerList.length}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Followers</div>
            </button>
            <button
              onClick={() => setShowList('following')}
              style={{ textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: 10, transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{followingList.length}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Following</div>
            </button>
          </div>
        )}

        {/* Edit fields */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px', marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>Edit Profile</p>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Username</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 14, pointerEvents: 'none' }}>@</span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                placeholder="yourhandle"
                style={{ ...inputStyle, paddingLeft: 26 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value.slice(0, 500))}
              placeholder="Tell the community about yourself..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4, textAlign: 'right' }}>{bio.length}/500</p>
          </div>

          {saveErr && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{saveErr}</p>}
          {saveMsg && <p style={{ fontSize: 13, color: '#00E5A0', marginBottom: 12 }}>{saveMsg}</p>}

          <button
            onClick={save}
            disabled={saving}
            style={{
              width: '100%', padding: '12px', borderRadius: 10,
              background: saving ? 'rgba(0,229,160,0.4)' : '#00E5A0',
              color: '#000', fontWeight: 700, fontSize: 14, border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* My Posts */}
        <div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
            My Posts ({posts.length})
          </p>

          {postsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}><Spinner /></div>
          ) : posts.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '32px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>You haven't posted anything yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {posts.map(post => (
                <div key={post.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {TOPIC_LABELS[post.topic] ?? post.topic}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{timeAgo(post.created_at)}</span>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{post.body}</p>
                  {post.image_url && (
                    <img src={post.image_url} alt="" style={{ marginTop: 10, width: '100%', borderRadius: 10, maxHeight: 260, objectFit: 'cover' }} />
                  )}
                  <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>♥ {post.kudo_count}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>💬 {post.comment_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Followers / Following modal */}
      {showList && (
        <UserListModal
          title={showList === 'followers' ? `Followers (${followerList.length})` : `Following (${followingList.length})`}
          users={showList === 'followers' ? followerList : followingList}
          onClose={() => setShowList(null)}
          onNavigate={openProfile}
        />
      )}
    </AppLayout>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: 'var(--color-text-primary)',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
};
