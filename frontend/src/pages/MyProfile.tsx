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

export function MyProfile() {
  const { profile, role, clearAuth, setAuth, session } = useAuthStore();
  const nav = useNavigate();

  const [name, setName]       = useState(profile?.name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio]         = useState(profile?.running_style ?? '');
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  const [posts, setPosts]     = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  const [followers, setFollowers] = useState<number | null>(null);
  const [following, setFollowing] = useState<number | null>(null);

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
        setFollowers(Array.isArray(f1) ? f1.length : 0);
        setFollowing(Array.isArray(f2) ? f2.length : 0);
      }).catch(() => {});
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
        {(followers !== null || following !== null) && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{followers ?? '—'}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Followers</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{following ?? '—'}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Following</div>
            </div>
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
