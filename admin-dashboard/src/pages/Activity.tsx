import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';

interface Event {
  type: string;
  id: string;
  label: string;
  meta?: string;
  ts: string;
}

const TYPE_META: Record<string, { icon: string; color: string; title: string }> = {
  athlete_signup:  { icon: '🏃', color: '#00E5A0', title: 'Athlete signed up' },
  coach_signup:    { icon: '🎓', color: '#60a5fa', title: 'Coach signed up' },
  community_post:  { icon: '💬', color: '#a78bfa', title: 'Community post' },
  plan_generated:  { icon: '📋', color: '#F59E0B', title: 'Plan generated' },
};

export default function Activity() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<Event[]>('/api/admin/activity-feed?limit=100')
      .then(setEvents)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const types = ['all', 'athlete_signup', 'coach_signup', 'community_post', 'plan_generated'];
  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ ...h1, marginBottom: 0 }}>Activity Feed</h1>
        <div style={{ flex: 1 }} />
        <button onClick={load} style={refreshBtn}>Refresh</button>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {types.map(t => {
          const meta = TYPE_META[t];
          return (
            <button key={t} onClick={() => setFilter(t)} style={{
              padding: '5px 14px', border: '1px solid', borderRadius: 99, cursor: 'pointer', fontSize: 12,
              background: filter === t ? (meta?.color ?? '#00E5A0') : 'transparent',
              borderColor: filter === t ? (meta?.color ?? '#00E5A0') : '#333',
              color: filter === t ? '#000' : '#666',
              fontWeight: filter === t ? 600 : 400,
            }}>
              {meta ? `${meta.icon} ${meta.title}` : 'All events'}
            </button>
          );
        })}
      </div>

      {error && <Err msg={error} />}
      {loading ? <Loading /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.length === 0 && (
            <div style={{ color: '#555', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>No events</div>
          )}
          {filtered.map((e, i) => {
            const meta = TYPE_META[e.type] ?? { icon: '•', color: '#555', title: e.type };
            return (
              <div key={`${e.id}-${i}`} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px',
                background: '#111', borderBottom: '1px solid #1a1a1a',
                borderRadius: i === 0 ? '12px 12px 0 0' : i === filtered.length - 1 ? '0 0 12px 12px' : 0,
              }}>
                <span style={{ fontSize: 18, lineHeight: 1.4 }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: meta.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{meta.title}</span>
                    {e.meta && <span style={{ fontSize: 11, color: '#555' }}>{e.meta}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#ccc', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.label || '—'}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#444', whiteSpace: 'nowrap', paddingTop: 2 }}>
                  {fmtRelative(e.ts)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#fff' };
const refreshBtn: React.CSSProperties = {
  padding: '7px 14px', background: 'transparent', border: '1px solid #333',
  borderRadius: 8, color: '#888', cursor: 'pointer', fontSize: 13,
};
const Loading = () => <div style={{ color: '#555', fontSize: 14 }}>Loading…</div>;
const Err = ({ msg }: { msg: string }) => (
  <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '12px 16px', fontSize: 14, marginBottom: 16 }}>{msg}</div>
);
