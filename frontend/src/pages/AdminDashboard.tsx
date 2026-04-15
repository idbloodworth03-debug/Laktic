import { useState, useEffect, FormEvent } from 'react';
import { apiFetch } from '../lib/api';
import { Spinner, Badge } from '../components/ui';

function adminFetch(path: string, key: string, options: RequestInit = {}) {
  return apiFetch(path, {
    ...options,
    headers: { ...(options.headers as Record<string, string> ?? {}), 'x-admin-key': key },
  });
}

// ── Password gate ─────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }: { onUnlock: (key: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await adminFetch('/api/admin/stats', value);
      sessionStorage.setItem('admin_key', value);
      onUnlock(value);
    } catch { setError('Wrong password.'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={submit} style={{ width: 320, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '36px 28px' }}>
        <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Admin Dashboard</p>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>Enter your admin password</p>
        <input type="password" required value={value} onChange={e => setValue(e.target.value)} placeholder="Admin password"
          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', marginBottom: 12 }} />
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: '11px', background: '#00E5A0', color: '#000', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const Th = ({ children }: { children: React.ReactNode }) => <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{children}</th>;
const Td = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text2)', borderBottom: '1px solid var(--border)', ...style }}>{children}</td>;

function ActionBtn({ label, color, onClick }: { label: string; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, background: 'transparent', border: `1px solid ${color ?? '#333'}`, borderRadius: 6, color: color ?? '#666', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function AdminDashboard() {
  const [adminKey, setAdminKey] = useState<string | null>(() => sessionStorage.getItem('admin_key'));
  const [tab, setTab] = useState<'overview' | 'users' | 'revenue' | 'bans' | 'activity'>('overview');

  const [stats, setStats] = useState<any>(null);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [bans, setBans] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [userTab, setUserTab] = useState<'athletes' | 'coaches'>('athletes');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  function af(path: string, opts?: RequestInit) { return adminFetch(path, adminKey!, opts); }

  useEffect(() => {
    if (!adminKey) return;
    setLoading(true);
    af('/api/admin/stats').then(setStats).finally(() => setLoading(false));
  }, [adminKey]);

  useEffect(() => {
    if (!adminKey) return;
    if (tab === 'users') { af('/api/admin/coaches').then(setCoaches); af('/api/admin/athletes').then(setAthletes); }
    if (tab === 'revenue') af('/api/admin/revenue').then(setRevenue);
    if (tab === 'bans') af('/api/admin/bans').then(setBans);
    if (tab === 'activity') af('/api/admin/activity-feed?limit=100').then(setActivity);
  }, [tab, adminKey]);

  if (!adminKey) return <PasswordGate onUnlock={k => setAdminKey(k)} />;
  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>;

  // ── Actions ───
  async function suspendUser(type: 'athletes' | 'coaches', id: string, suspended: boolean) {
    await af(`/api/admin/${type}/${id}/suspend`, { method: 'PATCH', body: JSON.stringify({ suspended }) });
    if (type === 'athletes') af('/api/admin/athletes').then(setAthletes);
    else af('/api/admin/coaches').then(setCoaches);
  }

  async function deleteUser(type: 'athletes' | 'coaches', id: string, name: string) {
    if (!confirm(`Permanently delete ${name}? This removes their profile and login. Cannot be undone.`)) return;
    await af(`/api/admin/${type}/${id}`, { method: 'DELETE' });
    if (type === 'athletes') setAthletes(p => p.filter(a => a.id !== id));
    else setCoaches(p => p.filter(c => c.id !== id));
    af('/api/admin/stats').then(setStats);
  }

  async function removeBan(id: string) {
    await af(`/api/admin/bans/${id}`, { method: 'DELETE' });
    setBans(p => p.filter(b => b.id !== id));
  }

  const q = search.toLowerCase();
  const filteredAthletes = athletes.filter(a => (a.name ?? '').toLowerCase().includes(q) || (a.username ?? '').toLowerCase().includes(q));
  const filteredCoaches = coaches.filter(c => (c.name ?? '').toLowerCase().includes(q) || (c.username ?? '').toLowerCase().includes(q));

  const TABS = ['overview', 'users', 'revenue', 'bans', 'activity'] as const;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans, sans-serif)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Admin Dashboard</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Platform management</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Badge label="Admin" color="red" />
            <button onClick={() => { sessionStorage.removeItem('admin_key'); setAdminKey(null); }}
              style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Lock</button>
          </div>
        </div>

        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #00E5A0' : '2px solid transparent', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? 'var(--text)' : 'var(--muted)', textTransform: 'capitalize', marginBottom: -1 }}>
              {t}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ─── */}
        {tab === 'overview' && stats && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
              {[
                { label: 'Total Athletes', value: stats.totals.athletes, sub: `+${stats.last_30_days.new_athletes} this month`, color: '#00E5A0' },
                { label: 'Total Coaches', value: stats.totals.coaches, sub: `+${stats.last_30_days.new_coaches} this month`, color: '#60a5fa' },
                { label: 'Plan Purchases', value: stats.totals.plan_purchases, color: '#f97316' },
                { label: 'Published Plans', value: stats.totals.published_plans, color: '#a78bfa' },
                { label: 'Certified Coaches', value: stats.totals.certified_coaches, color: '#fbbf24' },
                { label: 'Banned Emails', value: stats.totals.banned_emails, color: '#ef4444' },
                { label: 'Suspended', value: stats.totals.suspended_athletes, color: '#f59e0b' },
              ].map(c => (
                <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 16px' }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{c.label}</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: c.color, fontFamily: 'monospace' }}>{c.value}</p>
                  {c.sub && <p style={{ fontSize: 11, color: '#00E5A0', marginTop: 4 }}>{c.sub}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── USERS ─── */}
        {tab === 'users' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {(['athletes', 'coaches'] as const).map(t => (
                  <button key={t} onClick={() => setUserTab(t)}
                    style={{ padding: '7px 16px', border: 'none', cursor: 'pointer', fontSize: 13, background: userTab === t ? '#00E5A0' : 'transparent', color: userTab === t ? '#000' : 'var(--muted)', fontWeight: userTab === t ? 600 : 400 }}>
                    {t === 'athletes' ? `Athletes (${athletes.length})` : `Coaches (${coaches.length})`}
                  </button>
                ))}
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or username…"
                style={{ padding: '7px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', minWidth: 220 }} />
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {userTab === 'athletes'
                      ? ['Name', 'Username', 'Tier', 'Status', 'Joined', 'Actions'].map(h => <Th key={h}>{h}</Th>)
                      : ['Name', 'Username', 'License', 'Certified', 'Status', 'Joined', 'Actions'].map(h => <Th key={h}>{h}</Th>)
                    }
                  </tr>
                </thead>
                <tbody>
                  {userTab === 'athletes' ? filteredAthletes.map(a => (
                    <tr key={a.id}>
                      <Td><span style={{ fontWeight: 500 }}>{a.name || '—'}</span></Td>
                      <Td style={{ color: 'var(--muted)' }}>@{a.username || '—'}</Td>
                      <Td><Badge label={a.subscription_tier ?? 'free'} color={a.subscription_tier === 'pro' ? 'green' : 'gray'} /></Td>
                      <Td>{a.suspended ? <span style={{ color: '#f59e0b', fontSize: 12 }}>Suspended</span> : <span style={{ color: '#00E5A0', fontSize: 12 }}>Active</span>}</Td>
                      <Td style={{ color: 'var(--muted)' }}>{fmtDate(a.created_at)}</Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <ActionBtn label={a.suspended ? 'Unsuspend' : 'Suspend'} color={a.suspended ? '#00E5A0' : '#f59e0b'} onClick={() => suspendUser('athletes', a.id, !a.suspended)} />
                          <ActionBtn label="Delete" color="#ef4444" onClick={() => deleteUser('athletes', a.id, a.name)} />
                        </div>
                      </Td>
                    </tr>
                  )) : filteredCoaches.map(c => (
                    <tr key={c.id}>
                      <Td><span style={{ fontWeight: 500 }}>{c.name || '—'}</span></Td>
                      <Td style={{ color: 'var(--muted)' }}>@{c.username || '—'}</Td>
                      <Td>{c.license_type || '—'}</Td>
                      <Td>{c.certified_coach ? <span style={{ color: '#00E5A0', fontSize: 12 }}>Yes</span> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>No</span>}</Td>
                      <Td>{c.suspended ? <span style={{ color: '#f59e0b', fontSize: 12 }}>Suspended</span> : <span style={{ color: '#00E5A0', fontSize: 12 }}>Active</span>}</Td>
                      <Td style={{ color: 'var(--muted)' }}>{fmtDate(c.created_at)}</Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <ActionBtn label={c.suspended ? 'Unsuspend' : 'Suspend'} color={c.suspended ? '#00E5A0' : '#f59e0b'} onClick={() => suspendUser('coaches', c.id, !c.suspended)} />
                          <ActionBtn label="Delete" color="#ef4444" onClick={() => deleteUser('coaches', c.id, c.name)} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(userTab === 'athletes' ? filteredAthletes : filteredCoaches).length === 0 && (
                <p style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No results</p>
              )}
            </div>
          </div>
        )}

        {/* ── REVENUE ─── */}
        {tab === 'revenue' && revenue && (
          <div>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
              {[
                { label: 'Total Revenue', value: fmtMoney(revenue.total_cents), color: '#00E5A0' },
                { label: 'Transactions', value: String(revenue.purchases.length), color: '#fff' },
                { label: 'Avg. Sale', value: revenue.purchases.length ? fmtMoney(Math.round(revenue.total_cents / revenue.purchases.length)) : '—', color: '#fff' },
              ].map(c => (
                <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 16px' }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{c.label}</p>
                  <p style={{ fontSize: 26, fontWeight: 700, color: c.color, fontFamily: 'monospace' }}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* Monthly breakdown */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Monthly Revenue (last 12 months)</p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 80 }}>
                {(revenue.monthly ?? []).map((m: any) => {
                  const max = Math.max(...(revenue.monthly ?? []).map((x: any) => x.cents), 1);
                  const h = Math.max(4, Math.round((m.cents / max) * 72));
                  return (
                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 9, color: 'var(--muted)' }}>{m.cents > 0 ? fmtMoney(m.cents) : ''}</span>
                      <div style={{ width: '100%', height: h, background: m.cents > 0 ? '#00E5A0' : 'var(--border)', borderRadius: 3 }} />
                      <span style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{m.month.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per-coach breakdown */}
            {(revenue.by_coach ?? []).length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
                <p style={{ fontSize: 13, fontWeight: 600, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>Revenue by Coach</p>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><Th>Coach</Th><Th>Sales</Th><Th>Revenue</Th></tr></thead>
                  <tbody>
                    {revenue.by_coach.map((c: any) => (
                      <tr key={c.name}>
                        <Td style={{ fontWeight: 500 }}>{c.name}</Td>
                        <Td style={{ color: 'var(--muted)' }}>{c.count}</Td>
                        <Td style={{ color: '#00E5A0', fontFamily: 'monospace' }}>{fmtMoney(c.cents)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Transaction list */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <p style={{ fontSize: 13, fontWeight: 600, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>All Transactions</p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th>Plan</Th><Th>Coach</Th><Th>Amount</Th><Th>Date</Th></tr></thead>
                <tbody>
                  {revenue.purchases.map((p: any) => (
                    <tr key={p.id}>
                      <Td>{p.plan?.title ?? '—'}</Td>
                      <Td style={{ color: 'var(--muted)' }}>{p.plan?.coach?.name ?? '—'}</Td>
                      <Td style={{ color: '#00E5A0', fontFamily: 'monospace' }}>{fmtMoney(p.amount_paid_cents ?? 0)}</Td>
                      <Td style={{ color: 'var(--muted)' }}>{fmtDate(p.purchased_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {revenue.purchases.length === 0 && <p style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No purchases yet</p>}
            </div>
          </div>
        )}

        {/* ── BANS ─── */}
        {tab === 'bans' && <BansTab bans={bans} setBans={setBans} af={af} />}

        {/* ── ACTIVITY ─── */}
        {tab === 'activity' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              <button onClick={() => af('/api/admin/activity-feed?limit=100').then(setActivity)}
                style={{ fontSize: 12, padding: '6px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer' }}>
                Refresh
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {activity.map((e: any, i: number) => {
                const icons: Record<string, string> = { athlete_signup: '🏃', coach_signup: '🎓', community_post: '💬', plan_generated: '📋' };
                const colors: Record<string, string> = { athlete_signup: '#00E5A0', coach_signup: '#60a5fa', community_post: '#a78bfa', plan_generated: '#f59e0b' };
                const labels: Record<string, string> = { athlete_signup: 'Athlete signed up', coach_signup: 'Coach signed up', community_post: 'Community post', plan_generated: 'Plan generated' };
                const diff = Date.now() - new Date(e.ts).getTime();
                const mins = Math.floor(diff / 60000);
                const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', borderRadius: i === 0 ? '12px 12px 0 0' : i === activity.length - 1 ? '0 0 12px 12px' : 0 }}>
                    <span style={{ fontSize: 17 }}>{icons[e.type] ?? '•'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: colors[e.type] ?? 'var(--muted)' }}>{labels[e.type] ?? e.type}</span>
                      {e.meta && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{e.meta}</span>}
                      <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label || '—'}</p>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', paddingTop: 2 }}>{rel}</span>
                  </div>
                );
              })}
              {activity.length === 0 && <p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No activity yet</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bans tab (separate to keep main component clean) ──────────────────────────
function BansTab({ bans, setBans, af }: { bans: any[]; setBans: React.Dispatch<React.SetStateAction<any[]>>; af: (path: string, opts?: RequestInit) => Promise<any> }) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  async function addBan(e: FormEvent) {
    e.preventDefault();
    setError(''); setAdding(true);
    try {
      const ban = await af('/api/admin/bans', { method: 'POST', body: JSON.stringify({ email, reason }) });
      setBans(prev => [ban, ...prev]);
      setEmail(''); setReason('');
    } catch (err: any) { setError(err.message); }
    finally { setAdding(false); }
  }

  return (
    <div>
      {/* Add ban form */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Ban an email address</p>
        <form onSubmit={addBan} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input value={email} onChange={e => setEmail(e.target.value)} required type="email" placeholder="email@example.com"
            style={{ flex: 2, minWidth: 200, padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }} />
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)"
            style={{ flex: 3, minWidth: 200, padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }} />
          <button type="submit" disabled={adding}
            style={{ padding: '8px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: adding ? 'not-allowed' : 'pointer' }}>
            {adding ? 'Banning…' : 'Ban'}
          </button>
        </form>
        {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{error}</p>}
      </div>

      {/* Ban list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Email</Th><Th>Reason</Th><Th>Banned</Th><Th>&nbsp;</Th></tr></thead>
          <tbody>
            {bans.map(b => (
              <tr key={b.id}>
                <Td style={{ fontFamily: 'monospace', fontSize: 12 }}>{b.email}</Td>
                <Td style={{ color: 'var(--muted)' }}>{b.reason || '—'}</Td>
                <Td style={{ color: 'var(--muted)' }}>{fmtDate(b.banned_at)}</Td>
                <Td><ActionBtn label="Unban" color="#00E5A0" onClick={async () => { await af(`/api/admin/bans/${b.id}`, { method: 'DELETE' }); setBans(prev => prev.filter((x: any) => x.id !== b.id)); }} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
        {bans.length === 0 && <p style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No banned emails</p>}
      </div>
    </div>
  );
}
