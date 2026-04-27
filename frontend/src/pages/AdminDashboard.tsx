import { useState, useEffect, FormEvent } from 'react';

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const pct = previous === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - previous) / previous) * 100);
  return <span style={{ fontSize: 10, fontWeight: 700, color: pct >= 0 ? '#00E5A0' : '#ef4444', marginLeft: 4 }}>{pct >= 0 ? '▲' : '▼'}{Math.abs(pct)}%</span>;
}

function Sparkline({ data, width = 140, height = 40 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v: number, i: number) => `${((i / (data.length - 1)) * width).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`).join(' ');
  return <svg width={width} height={height} style={{ display: 'block' }}><polyline points={pts} fill="none" stroke="#00E5A0" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function UserDrawer({ user, onClose, onSuspend, onDelete }: { user: any; onClose: () => void; onSuspend: () => void; onDelete: () => void }) {
  const isCoach = 'certified_coach' in user;
  const rows = [
    { label: 'User ID', value: user.id },
    { label: 'Username', value: `@${user.username || '—'}` },
    { label: 'Role', value: isCoach ? 'Coach' : 'Athlete' },
    { label: 'Status', value: user.suspended ? 'Suspended' : 'Active' },
    { label: 'Joined', value: new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
    { label: 'Last Active', value: fmtRelative(user.last_active) },
    ...(isCoach ? [{ label: 'License', value: user.license_type || '—' }, { label: 'Certified', value: user.certified_coach ? 'Yes' : 'No' }] : [{ label: 'Tier', value: user.subscription_tier ?? 'free' }]),
  ];
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 360, background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 50, overflowY: 'auto', padding: '28px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>{user.name || user.username || 'User'}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        {rows.map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{r.value}</span>
          </div>
        ))}
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onSuspend} style={{ padding: '10px', background: user.suspended ? 'rgba(0,229,160,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${user.suspended ? '#00E5A0' : '#f59e0b'}`, borderRadius: 8, color: user.suspended ? '#00E5A0' : '#f59e0b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {user.suspended ? 'Unsuspend User' : 'Suspend User'}
          </button>
          <button onClick={onDelete} style={{ padding: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Delete Account
          </button>
        </div>
      </div>
    </>
  );
}

const BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001';

async function adminFetch(path: string, key: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': key,
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
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
    } catch (e: any) {
      const msg = e?.message ?? '';
      setError(msg.includes('fetch') || msg.includes('network') || msg.includes('CORS')
        ? 'Cannot reach server. Check API connectivity.'
        : 'Wrong password.');
    }
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
function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}
const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const Th = ({ children, w }: { children: React.ReactNode; w?: number | string }) => <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', width: w }}>{children}</th>;
const Td = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text2)', borderBottom: '1px solid var(--border)', ...style }}>{children}</td>;

function ActionBtn({ label, color, onClick }: { label: string; color?: string; onClick: () => void }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }} style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, background: 'transparent', border: `1px solid ${color ?? '#333'}`, borderRadius: 6, color: color ?? '#666', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function AdminDashboard() {
  const [adminKey, setAdminKey] = useState<string | null>(() => sessionStorage.getItem('admin_key'));
  const [tab, setTab] = useState<'overview' | 'users' | 'revenue' | 'bans' | 'activity'>('overview');

  const [stats, setStats] = useState<any>(null);
  const [growth, setGrowth] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [bans, setBans] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [userTab, setUserTab] = useState<'athletes' | 'coaches'>('athletes');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [tierFilter, setTierFilter] = useState<'all' | 'free' | 'pro'>('all');
  const [drawerUser, setDrawerUser] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'athlete' | 'coach'>('all');
  const [loading, setLoading] = useState(false);

  function af(path: string, opts?: RequestInit) { return adminFetch(path, adminKey!, opts); }

  useEffect(() => {
    if (!adminKey) return;
    setLoading(true);
    Promise.all([
      af('/api/admin/stats').then(setStats),
      af('/api/admin/growth').then(setGrowth),
    ]).finally(() => setLoading(false));
  }, [adminKey]);

  useEffect(() => {
    if (!adminKey) return;
    if (tab === 'users') { af('/api/admin/coaches').then(setCoaches); af('/api/admin/athletes').then(setAthletes); }
    if (tab === 'revenue') af('/api/admin/revenue').then(setRevenue);
    if (tab === 'bans') af('/api/admin/bans').then(setBans);
    if (tab === 'activity') af('/api/admin/activity-feed?limit=100').then(setActivity);
  }, [tab, adminKey]);

  if (!adminKey) return <PasswordGate onUnlock={k => setAdminKey(k)} />;
  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</span></div>;

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

  async function bulkSuspend(val: boolean) {
    setBulkLoading(true);
    const type = userTab === 'athletes' ? 'athletes' : 'coaches';
    await Promise.all([...selectedIds].map(id => af(`/api/admin/${type}/${id}/suspend`, { method: 'PATCH', body: JSON.stringify({ suspended: val }) }).catch(() => {})));
    if (type === 'athletes') af('/api/admin/athletes').then(setAthletes); else af('/api/admin/coaches').then(setCoaches);
    setSelectedIds(new Set()); setBulkLoading(false);
  }

  async function bulkDelete() {
    if (!confirm(`Permanently delete ${selectedIds.size} user(s)?`)) return;
    setBulkLoading(true);
    const type = userTab === 'athletes' ? 'athletes' : 'coaches';
    await Promise.all([...selectedIds].map(id => af(`/api/admin/${type}/${id}`, { method: 'DELETE' }).catch(() => {})));
    if (type === 'athletes') setAthletes(p => p.filter(a => !selectedIds.has(a.id))); else setCoaches(p => p.filter(c => !selectedIds.has(c.id)));
    setSelectedIds(new Set()); setBulkLoading(false);
    af('/api/admin/stats').then(setStats);
  }

  function exportCsv() {
    if (!revenue) return;
    const rows = [['Plan', 'Coach', 'Amount', 'Date'], ...revenue.purchases.map((p: any) => [p.plan?.title ?? '', p.plan?.coach?.name ?? '', fmtMoney(p.amount_paid_cents ?? 0), (p.purchased_at ?? '').slice(0, 10)])];
    const csv = rows.map(r => r.map((v: string) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `revenue-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  const q = search.toLowerCase();
  const filteredAthletes = athletes.filter(a => {
    if (statusFilter === 'active' && a.suspended) return false;
    if (statusFilter === 'suspended' && !a.suspended) return false;
    if (tierFilter !== 'all' && (a.subscription_tier ?? 'free') !== tierFilter) return false;
    if (q && !(a.name ?? '').toLowerCase().includes(q) && !(a.username ?? '').toLowerCase().includes(q)) return false;
    return true;
  });
  const filteredCoaches = coaches.filter(c => {
    if (statusFilter === 'active' && c.suspended) return false;
    if (statusFilter === 'suspended' && !c.suspended) return false;
    if (q && !(c.name ?? '').toLowerCase().includes(q) && !(c.username ?? '').toLowerCase().includes(q)) return false;
    return true;
  });

  const displayList = userTab === 'athletes' ? filteredAthletes : filteredCoaches;
  const allChecked = displayList.length > 0 && displayList.every(u => selectedIds.has(u.id));
  function toggleAll() { const next = new Set(selectedIds); if (allChecked) displayList.forEach(u => next.delete(u.id)); else displayList.forEach(u => next.add(u.id)); setSelectedIds(next); }
  function toggleOne(id: string, e: React.MouseEvent) { e.stopPropagation(); const next = new Set(selectedIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedIds(next); }

  const sparkData = growth.slice(-7).map((d: any) => (d.athletes ?? 0) + (d.coaches ?? 0));
  const sparkDates = growth.slice(-7).map((d: any) => (d.date ?? '').slice(5));
  const pendingCount: number = stats?.totals?.pending_approvals ?? 0;
  const filteredActivity = activity.filter((e: any) => activityFilter === 'all' || (activityFilter === 'athlete' && e.type === 'athlete_signup') || (activityFilter === 'coach' && e.type === 'coach_signup'));

  const TABS = ['overview', 'users', 'revenue', 'bans', 'activity'] as const;

  return (
    <>
    {drawerUser && <UserDrawer user={drawerUser} onClose={() => setDrawerUser(null)} onSuspend={() => { const t = 'certified_coach' in drawerUser ? 'coaches' : 'athletes'; suspendUser(t, drawerUser.id, !drawerUser.suspended); setDrawerUser(null); }} onDelete={() => { const t = 'certified_coach' in drawerUser ? 'coaches' : 'athletes'; deleteUser(t, drawerUser.id, drawerUser.name || drawerUser.username); setDrawerUser(null); }} />}
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans, sans-serif)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Admin Dashboard</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Platform management</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button title="Notifications" style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', cursor: 'default', fontSize: 16, lineHeight: 1 }}>
              🔔
            </button>
            <span style={{ padding: '3px 10px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>ADMIN</span>
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
                { label: 'Total Athletes', value: stats.totals.athletes, sub: `+${stats.last_30_days.new_athletes} this month`, color: '#00E5A0', wowC: stats.week_over_week?.new_athletes_7d, wowP: stats.week_over_week?.new_athletes_prev_7d },
                { label: 'Total Coaches', value: stats.totals.coaches, sub: `+${stats.last_30_days.new_coaches} this month`, color: '#60a5fa', wowC: stats.week_over_week?.new_coaches_7d, wowP: stats.week_over_week?.new_coaches_prev_7d },
                { label: 'Plan Purchases', value: stats.totals.plan_purchases, color: '#f97316' },
                { label: 'Published Plans', value: stats.totals.published_plans, color: '#a78bfa' },
                { label: 'Certified Coaches', value: stats.totals.certified_coaches, color: '#fbbf24' },
                { label: 'Banned Emails', value: stats.totals.banned_emails, color: '#ef4444' },
                { label: 'Suspended', value: stats.totals.suspended_athletes, color: '#f59e0b' },
              ].map(c => (
                <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 16px' }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{c.label}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <p style={{ fontSize: 28, fontWeight: 700, color: c.color, fontFamily: 'monospace', margin: 0 }}>{c.value}</p>
                    {c.wowC !== undefined && <DeltaBadge current={c.wowC} previous={c.wowP ?? 0} />}
                  </div>
                  {c.sub && <p style={{ fontSize: 11, color: '#00E5A0', marginTop: 4 }}>{c.sub}</p>}
                </div>
              ))}
            </div>
            {sparkData.length >= 2 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>New Signups — Last 7 Days</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sparkData.reduce((a, b) => a + b, 0)} total · {sparkData[sparkData.length - 1] > sparkData[0] ? '↑ trending up' : sparkData[sparkData.length - 1] < sparkData[0] ? '↓ trending down' : '→ stable'}</p>
                  </div>
                  <Sparkline data={sparkData} width={160} height={44} />
                </div>
                <div style={{ display: 'flex' }}>
                  {sparkDates.map((d: string, i: number) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                      <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>{d}</p>
                      <p style={{ fontSize: 11, fontWeight: 600, margin: '2px 0 0' }}>{sparkData[i]}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── USERS ─── */}
        {tab === 'users' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {(['athletes', 'coaches'] as const).map(t => (
                  <button key={t} onClick={() => { setUserTab(t); setSelectedIds(new Set()); }}
                    style={{ padding: '7px 16px', border: 'none', cursor: 'pointer', fontSize: 13, background: userTab === t ? '#00E5A0' : 'transparent', color: userTab === t ? '#000' : 'var(--muted)', fontWeight: userTab === t ? 600 : 400 }}>
                    {t === 'athletes' ? `Athletes (${athletes.length})` : `Coaches (${coaches.length})`}
                  </button>
                ))}
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or username…"
                style={{ padding: '7px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', minWidth: 200 }} />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
                style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              {userTab === 'athletes' && (
                <select value={tierFilter} onChange={e => setTierFilter(e.target.value as 'all' | 'free' | 'pro')}
                  style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
                  <option value="all">All tiers</option>
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                </select>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 16px', background: 'rgba(0,229,160,0.07)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedIds.size} selected</span>
                <button onClick={() => bulkSuspend(true)} disabled={bulkLoading} style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, background: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b', borderRadius: 6, color: '#f59e0b', cursor: 'pointer' }}>Suspend selected</button>
                <button onClick={() => bulkSuspend(false)} disabled={bulkLoading} style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, background: 'rgba(0,229,160,0.15)', border: '1px solid #00E5A0', borderRadius: 6, color: '#00E5A0', cursor: 'pointer' }}>Unsuspend selected</button>
                <button onClick={bulkDelete} disabled={bulkLoading} style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: 6, color: '#ef4444', cursor: 'pointer' }}>Delete selected</button>
                <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
              </div>
            )}

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th w={40}><input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ cursor: 'pointer' }} /></Th>
                    {userTab === 'athletes'
                      ? ['Name', 'Username', 'Tier', 'Status', 'Joined', 'Last Active', 'Actions'].map(h => <Th key={h}>{h}</Th>)
                      : ['Name', 'Username', 'License', 'Certified', 'Status', 'Joined', 'Last Active', 'Actions'].map(h => <Th key={h}>{h}</Th>)
                    }
                  </tr>
                </thead>
                <tbody>
                  {userTab === 'athletes' ? filteredAthletes.map(a => (
                    <tr key={a.id} onClick={() => setDrawerUser(a)} style={{ cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <Td><input type="checkbox" checked={selectedIds.has(a.id)} onClick={e => toggleOne(a.id, e)} onChange={() => {}} style={{ cursor: 'pointer' }} /></Td>
                      <Td><span style={{ fontWeight: 500 }}>{a.name || '—'}</span></Td>
                      <Td style={{ color: 'var(--muted)' }}>@{a.username || '—'}</Td>
                      <Td><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: a.subscription_tier === 'pro' ? 'rgba(0,229,160,0.15)' : 'rgba(113,113,122,0.15)', color: a.subscription_tier === 'pro' ? '#00E5A0' : 'var(--muted)' }}>{a.subscription_tier ?? 'free'}</span></Td>
                      <Td>{a.suspended ? <span style={{ color: '#f59e0b', fontSize: 12 }}>Suspended</span> : <span style={{ color: '#00E5A0', fontSize: 12 }}>Active</span>}</Td>
                      <Td style={{ color: 'var(--muted)' }}>{fmtDate(a.created_at)}</Td>
                      <Td style={{ color: a.last_active ? 'var(--text2)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtRelative(a.last_active)}</Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <ActionBtn label={a.suspended ? 'Unsuspend' : 'Suspend'} color={a.suspended ? '#00E5A0' : '#f59e0b'} onClick={() => suspendUser('athletes', a.id, !a.suspended)} />
                          <ActionBtn label="Delete" color="#ef4444" onClick={() => deleteUser('athletes', a.id, a.name)} />
                        </div>
                      </Td>
                    </tr>
                  )) : filteredCoaches.map(c => (
                    <tr key={c.id} onClick={() => setDrawerUser(c)} style={{ cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <Td><input type="checkbox" checked={selectedIds.has(c.id)} onClick={e => toggleOne(c.id, e)} onChange={() => {}} style={{ cursor: 'pointer' }} /></Td>
                      <Td><span style={{ fontWeight: 500 }}>{c.name || '—'}</span></Td>
                      <Td style={{ color: 'var(--muted)' }}>@{c.username || '—'}</Td>
                      <Td>{c.license_type || '—'}</Td>
                      <Td>{c.certified_coach ? <span style={{ color: '#00E5A0', fontSize: 12 }}>Yes</span> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>No</span>}</Td>
                      <Td>{c.suspended ? <span style={{ color: '#f59e0b', fontSize: 12 }}>Suspended</span> : <span style={{ color: '#00E5A0', fontSize: 12 }}>Active</span>}</Td>
                      <Td style={{ color: 'var(--muted)' }}>{fmtDate(c.created_at)}</Td>
                      <Td style={{ color: c.last_active ? 'var(--text2)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtRelative(c.last_active)}</Td>
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
              {displayList.length === 0 && (
                <p style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No results</p>
              )}
            </div>
          </div>
        )}

        {/* ── REVENUE ─── */}
        {tab === 'revenue' && revenue && (() => {
          const momPct: number | null = revenue.mom_growth_pct ?? null;
          const arpu = stats?.totals?.athletes > 0 ? Math.round(revenue.total_cents / stats.totals.athletes) : 0;
          const maxMonthly = Math.max(...(revenue.monthly ?? []).map((m: any) => m.cents), 1);
          return (
          <div>
            {/* Top KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14, marginBottom: 16 }}>
              {[
                { label: 'All-Time Revenue', value: fmtMoney(revenue.total_cents), color: '#00E5A0', sub: `${revenue.purchases.length} transaction${revenue.purchases.length !== 1 ? 's' : ''}` },
                { label: 'This Month', value: fmtMoney(revenue.current_month_cents ?? 0), color: '#00E5A0', sub: `Last month: ${fmtMoney(revenue.last_month_cents ?? 0)}` },
                { label: 'MoM Growth', value: momPct === null ? '—' : `${momPct >= 0 ? '+' : ''}${momPct}%`, color: momPct === null ? 'var(--muted)' : momPct >= 0 ? '#00E5A0' : '#ef4444', sub: 'vs previous month' },
                { label: 'Avg. Sale', value: revenue.purchases.length ? fmtMoney(Math.round(revenue.total_cents / revenue.purchases.length)) : '—', color: '#fff', sub: 'per transaction' },
                { label: 'ARPU', value: arpu > 0 ? fmtMoney(arpu) : '—', color: '#60a5fa', sub: 'avg revenue per athlete' },
                { label: 'Best Month', value: revenue.best_month?.cents > 0 ? fmtMoney(revenue.best_month.cents) : '—', color: '#fbbf24', sub: revenue.best_month?.month ?? '—' },
              ].map(c => (
                <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 16px' }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{c.label}</p>
                  <p style={{ fontSize: 24, fontWeight: 700, color: c.color, fontFamily: 'monospace', margin: 0 }}>{c.value}</p>
                  {c.sub && <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{c.sub}</p>}
                </div>
              ))}
            </div>

            {/* Monthly bar chart */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Monthly Revenue — Last 12 Months</p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 100 }}>
                {(revenue.monthly ?? []).map((m: any) => {
                  const isCurrentMonth = m.month === new Date().toISOString().slice(0, 7);
                  const h = Math.max(4, Math.round((m.cents / maxMonthly) * 88));
                  return (
                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center' }}>{m.cents > 0 ? fmtMoney(m.cents) : ''}</span>
                      <div style={{ width: '100%', height: h, background: isCurrentMonth ? '#00E5A0' : m.cents > 0 ? 'rgba(0,229,160,0.45)' : 'var(--border)', borderRadius: 3 }} />
                      <span style={{ fontSize: 9, color: isCurrentMonth ? '#00E5A0' : 'var(--muted)', whiteSpace: 'nowrap', fontWeight: isCurrentMonth ? 700 : 400 }}>{m.month.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Plans + Coaches side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* By plan */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <p style={{ fontSize: 13, fontWeight: 600, padding: '14px 18px', borderBottom: '1px solid var(--border)', margin: 0 }}>Revenue by Plan</p>
                {(revenue.by_plan ?? []).length === 0
                  ? <p style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No data</p>
                  : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><Th>Plan</Th><Th>Sales</Th><Th>Avg</Th><Th>Total</Th></tr></thead>
                      <tbody>
                        {revenue.by_plan.map((p: any) => (
                          <tr key={p.title}>
                            <Td style={{ fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</Td>
                            <Td style={{ color: 'var(--muted)' }}>{p.count}</Td>
                            <Td style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>{fmtMoney(p.avg_cents)}</Td>
                            <Td style={{ color: '#00E5A0', fontFamily: 'monospace' }}>{fmtMoney(p.cents)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                }
              </div>

              {/* By coach */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <p style={{ fontSize: 13, fontWeight: 600, padding: '14px 18px', borderBottom: '1px solid var(--border)', margin: 0 }}>Revenue by Coach</p>
                {(revenue.by_coach ?? []).length === 0
                  ? <p style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No data</p>
                  : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                }
              </div>
            </div>

            {/* All transactions */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>All Transactions</p>
                <button onClick={exportCsv} style={{ fontSize: 12, padding: '5px 12px', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', borderRadius: 7, color: '#00E5A0', cursor: 'pointer', fontWeight: 600 }}>Export CSV</button>
              </div>
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
          );
        })()}

        {/* ── BANS ─── */}
        {tab === 'bans' && <BansTab bans={bans} setBans={setBans} af={af} />}

        {/* ── ACTIVITY ─── */}
        {tab === 'activity' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['all', 'athlete', 'coach'] as const).map(f => (
                  <button key={f} onClick={() => setActivityFilter(f)}
                    style={{ padding: '5px 14px', fontSize: 12, fontWeight: activityFilter === f ? 600 : 400, background: activityFilter === f ? '#00E5A0' : 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, color: activityFilter === f ? '#000' : 'var(--muted)', cursor: 'pointer', textTransform: 'capitalize' }}>
                    {f === 'all' ? 'All' : f === 'athlete' ? '🏃 Athletes' : '🎓 Coaches'}
                  </button>
                ))}
              </div>
              <button onClick={() => af('/api/admin/activity-feed?limit=100').then(setActivity)}
                style={{ fontSize: 12, padding: '6px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer' }}>
                Refresh
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {filteredActivity.map((e: any, i: number) => {
                const cfg: Record<string, { icon: string; color: string; label: string; dot: string }> = {
                  athlete_signup:  { icon: '🏃', color: '#00E5A0', label: 'Athlete signed up',  dot: '#00E5A0' },
                  coach_signup:    { icon: '🎓', color: '#60a5fa', label: 'Coach signed up',    dot: '#60a5fa' },
                  community_post:  { icon: '💬', color: '#a78bfa', label: 'Community post',     dot: '#a78bfa' },
                  plan_generated:  { icon: '📋', color: '#f59e0b', label: 'Plan generated',     dot: '#f59e0b' },
                  plan_purchase:   { icon: '💳', color: '#00E5A0', label: 'Plan purchased',     dot: '#00E5A0' },
                  user_suspended:  { icon: '⛔', color: '#ef4444', label: 'User suspended',     dot: '#ef4444' },
                  user_deleted:    { icon: '🗑️', color: '#ef4444', label: 'User deleted',      dot: '#ef4444' },
                };
                const c = cfg[e.type] ?? { icon: '•', color: 'var(--muted)', label: e.type, dot: '#52525b' };
                const diff = Date.now() - new Date(e.ts).getTime();
                const mins = Math.floor(diff / 60000);
                const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
                const isFirst = i === 0; const isLast = i === filteredActivity.length - 1;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${c.dot}`, borderRadius: isFirst && isLast ? 12 : isFirst ? '12px 12px 0 0' : isLast ? '0 0 12px 12px' : 0 }}>
                    <span style={{ fontSize: 17 }}>{c.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: c.color }}>{c.label}</span>
                      {e.meta && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{e.meta}</span>}
                      <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label || '—'}</p>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', paddingTop: 2 }}>{rel}</span>
                  </div>
                );
              })}
              {filteredActivity.length === 0 && <p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No activity yet</p>}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
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
          <thead><tr><Th>Email</Th><Th>Reason</Th><Th>Banned By</Th><Th>Banned At</Th><Th>&nbsp;</Th></tr></thead>
          <tbody>
            {bans.map(b => (
              <tr key={b.id}>
                <Td style={{ fontFamily: 'monospace', fontSize: 12 }}>{b.email}</Td>
                <Td style={{ color: 'var(--muted)' }}>{b.reason || '—'}</Td>
                <Td style={{ color: 'var(--muted)', fontSize: 12 }}>Admin</Td>
                <Td style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(b.banned_at)}</Td>
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
