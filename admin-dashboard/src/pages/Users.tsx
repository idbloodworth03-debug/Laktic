import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

interface Coach {
  id: string;
  name: string;
  username: string;
  license_type: string | null;
  certified_coach: boolean;
  created_at: string;
}

interface Athlete {
  id: string;
  name: string;
  username: string;
  subscription_tier: string | null;
  created_at: string;
}

export default function Users() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [tab, setTab] = useState<'athletes' | 'coaches'>('athletes');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<Coach[]>('/api/admin/coaches'),
      apiFetch<Athlete[]>('/api/admin/athletes'),
    ])
      .then(([c, a]) => { setCoaches(c); setAthletes(a); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function deleteCoach(id: string, name: string) {
    if (!confirm(`Delete coach ${name}? This cannot be undone.`)) return;
    await apiFetch(`/api/admin/coaches/${id}`, { method: 'DELETE' });
    setCoaches(prev => prev.filter(c => c.id !== id));
  }

  async function deleteAthlete(id: string, name: string) {
    if (!confirm(`Delete athlete ${name}? This cannot be undone.`)) return;
    await apiFetch(`/api/admin/athletes/${id}`, { method: 'DELETE' });
    setAthletes(prev => prev.filter(a => a.id !== id));
  }

  if (error) return <Err msg={error} />;

  const q = search.toLowerCase();
  const filteredCoaches = coaches.filter(c => (c.name ?? '').toLowerCase().includes(q) || (c.username ?? '').toLowerCase().includes(q));
  const filteredAthletes = athletes.filter(a => (a.name ?? '').toLowerCase().includes(q) || (a.username ?? '').toLowerCase().includes(q));

  return (
    <div>
      <h1 style={h1}>Users</h1>

      {/* Tabs + Search */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0, background: '#1a1a1a', borderRadius: 8, overflow: 'hidden', border: '1px solid #2a2a2a' }}>
          {(['athletes', 'coaches'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 18px', border: 'none', cursor: 'pointer', fontSize: 13,
              background: tab === t ? '#00E5A0' : 'transparent',
              color: tab === t ? '#000' : '#666', fontWeight: tab === t ? 600 : 400,
            }}>
              {t === 'athletes' ? `Athletes (${athletes.length})` : `Coaches (${coaches.length})`}
            </button>
          ))}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or username…"
          style={{ padding: '8px 12px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none', minWidth: 220 }}
        />
      </div>

      {loading ? <Loading /> : (
        <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
                {tab === 'athletes'
                  ? ['Name', 'Username', 'Tier', 'Joined', ''].map(h => <Th key={h}>{h}</Th>)
                  : ['Name', 'Username', 'License', 'Certified', 'Joined', ''].map(h => <Th key={h}>{h}</Th>)
                }
              </tr>
            </thead>
            <tbody>
              {tab === 'athletes'
                ? filteredAthletes.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #141414' }}>
                    <Td>{a.name || '—'}</Td>
                    <Td><span style={{ color: '#555' }}>@</span>{a.username || '—'}</Td>
                    <Td><Badge label={a.subscription_tier ?? 'free'} /></Td>
                    <Td>{fmtDate(a.created_at)}</Td>
                    <Td>
                      <button onClick={() => deleteAthlete(a.id, a.name)} style={delBtn}>Delete</button>
                    </Td>
                  </tr>
                ))
                : filteredCoaches.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #141414' }}>
                    <Td>{c.name || '—'}</Td>
                    <Td><span style={{ color: '#555' }}>@</span>{c.username || '—'}</Td>
                    <Td>{c.license_type || '—'}</Td>
                    <Td>{c.certified_coach ? <span style={{ color: '#00E5A0' }}>Yes</span> : <span style={{ color: '#555' }}>No</span>}</Td>
                    <Td>{fmtDate(c.created_at)}</Td>
                    <Td>
                      <button onClick={() => deleteCoach(c.id, c.name)} style={delBtn}>Delete</button>
                    </Td>
                  </tr>
                ))
              }
            </tbody>
          </table>
          {(tab === 'athletes' ? filteredAthletes : filteredCoaches).length === 0 && (
            <div style={{ padding: '28px 22px', color: '#555', fontSize: 13, textAlign: 'center' }}>No results</div>
          )}
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '12px 16px', textAlign: 'left', color: '#555', fontWeight: 500, whiteSpace: 'nowrap' }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '11px 16px', color: '#ccc', whiteSpace: 'nowrap' }}>{children}</td>;
}
function Badge({ label }: { label: string }) {
  const colors: Record<string, string> = { pro: '#00E5A0', elite: '#60a5fa', free: '#555' };
  const c = colors[label] ?? '#777';
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, border: `1px solid ${c}`, color: c }}>{label}</span>;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const delBtn: React.CSSProperties = {
  padding: '4px 10px', fontSize: 12, background: 'transparent', border: '1px solid #333',
  borderRadius: 6, color: '#555', cursor: 'pointer',
};
const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#fff' };
const Loading = () => <div style={{ color: '#555', fontSize: 14 }}>Loading…</div>;
const Err = ({ msg }: { msg: string }) => (
  <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '12px 16px', fontSize: 14 }}>{msg}</div>
);
