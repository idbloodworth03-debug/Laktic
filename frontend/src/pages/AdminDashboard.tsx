import { useState, useEffect, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Card, Button, Spinner, Badge } from '../components/ui';

// Wraps apiFetch with the admin secret key header
function adminFetch(path: string, key: string, options: RequestInit = {}) {
  return apiFetch(path, { ...options, headers: { ...(options.headers as Record<string, string> ?? {}), 'x-admin-key': key } });
}

function PasswordGate({ onUnlock }: { onUnlock: (key: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminFetch('/api/admin/stats', value);
      sessionStorage.setItem('admin_key', value);
      onUnlock(value);
    } catch {
      setError('Wrong password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={submit} style={{ width: 320, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '36px 28px' }}>
        <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Admin Dashboard</p>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>Enter your admin password</p>
        <input
          type="password" required value={value} onChange={e => setValue(e.target.value)}
          placeholder="Admin password"
          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', marginBottom: 12 }}
        />
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <Button type="submit" loading={loading} style={{ width: '100%' }}>Unlock</Button>
      </form>
    </div>
  );
}

export function AdminDashboard() {
  const [adminKey, setAdminKey] = useState<string | null>(() => sessionStorage.getItem('admin_key'));
  const [stats, setStats] = useState<any>(null);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [tab, setTab] = useState<'overview' | 'coaches' | 'athletes' | 'revenue' | 'activity'>('overview');
  const [loading, setLoading] = useState(false);

  function af(path: string, opts?: RequestInit) {
    return adminFetch(path, adminKey!, opts);
  }

  useEffect(() => {
    if (!adminKey) return;
    setLoading(true);
    af('/api/admin/stats').then(setStats).finally(() => setLoading(false));
  }, [adminKey]);

  useEffect(() => {
    if (!adminKey) return;
    if (tab === 'coaches') af('/api/admin/coaches').then(setCoaches);
    if (tab === 'athletes') af('/api/admin/athletes').then(setAthletes);
    if (tab === 'revenue') af('/api/admin/revenue').then(setRevenue);
    if (tab === 'activity') af('/api/admin/activity-feed?limit=100').then(setActivity);
  }, [tab, adminKey]);

  if (!adminKey) return <PasswordGate onUnlock={key => setAdminKey(key)} />;
  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>;

  const toggleCertified = async (coach: any) => {
    await af(`/api/admin/coaches/${coach.id}`, { method: 'PATCH', body: JSON.stringify({ certified_coach: !coach.certified_coach }) });
    af('/api/admin/coaches').then(setCoaches);
  };

  const setLicense = async (coach: any, license_type: string) => {
    await af(`/api/admin/coaches/${coach.id}`, { method: 'PATCH', body: JSON.stringify({ license_type }) });
    af('/api/admin/coaches').then(setCoaches);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-xs text-[var(--muted)] mt-1">Platform management</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge label="Admin" color="red" />
            <button onClick={() => { sessionStorage.removeItem('admin_key'); setAdminKey(null); }} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">Lock</button>
          </div>
        </div>

        <div className="flex gap-2 mb-6 border-b border-[var(--border)] pb-4">
          {(['overview', 'coaches', 'athletes', 'revenue', 'activity'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm px-4 py-2 rounded-lg transition-colors capitalize ${tab === t ? 'bg-[var(--green)] text-black font-semibold' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'overview' && stats && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              {[
                { label: 'Total Coaches', value: stats.totals.coaches, color: 'text-blue-400' },
                { label: 'Total Athletes', value: stats.totals.athletes, color: 'text-[#00E5A0]' },
                { label: 'Published Plans', value: stats.totals.published_plans, color: 'text-purple-400' },
                { label: 'Plan Purchases', value: stats.totals.plan_purchases, color: 'text-orange-400' },
                { label: 'Certified Coaches', value: stats.totals.certified_coaches, color: 'text-yellow-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                  <p className={`text-3xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-[var(--muted)] mt-1">{label}</p>
                </div>
              ))}
            </div>
            <Card title="Last 30 Days">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-sm text-[var(--muted)]">New Coaches</p><p className="text-2xl font-bold text-blue-400">{stats.last_30_days.new_coaches}</p></div>
                <div><p className="text-sm text-[var(--muted)]">New Athletes</p><p className="text-2xl font-bold text-[#00E5A0]">{stats.last_30_days.new_athletes}</p></div>
              </div>
            </Card>
          </div>
        )}

        {tab === 'coaches' && (
          <div className="overflow-x-auto">
            <p className="text-sm text-[var(--muted)] mb-4">{coaches.length} coaches</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                <th className="pb-2 pr-4">Name</th><th className="pb-2 pr-4">Username</th>
                <th className="pb-2 pr-4">License</th><th className="pb-2 pr-4">Certified</th>
                <th className="pb-2 pr-4">Joined</th><th className="pb-2">Actions</th>
              </tr></thead>
              <tbody>{coaches.map(c => (
                <tr key={c.id} className="border-b border-[var(--border)] hover:bg-[var(--surface)]">
                  <td className="py-2.5 pr-4 font-medium">{c.name}</td>
                  <td className="py-2.5 pr-4 text-[var(--muted)]">{c.username ?? '—'}</td>
                  <td className="py-2.5 pr-4">
                    <select className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-0.5 text-xs" value={c.license_type} onChange={e => setLicense(c, e.target.value)}>
                      <option value="individual">Individual</option>
                      <option value="team">Team</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </td>
                  <td className="py-2.5 pr-4">
                    <button onClick={() => toggleCertified(c)} className={`text-xs px-2 py-0.5 rounded border transition-colors ${c.certified_coach ? 'bg-green-950/40 border-[rgba(0,229,160,0.35)] text-[#00E5A0]' : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)]'}`}>
                      {c.certified_coach ? 'Certified' : 'Not certified'}
                    </button>
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--muted)]">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="py-2.5">{c.username && <a href={`/coach/${c.username}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#00E5A0] hover:underline">Profile</a>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {tab === 'athletes' && (
          <div className="overflow-x-auto">
            <p className="text-sm text-[var(--muted)] mb-4">{athletes.length} athletes</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                <th className="pb-2 pr-4">Name</th><th className="pb-2 pr-4">Username</th>
                <th className="pb-2 pr-4">Tier</th><th className="pb-2">Joined</th>
              </tr></thead>
              <tbody>{athletes.map(a => (
                <tr key={a.id} className="border-b border-[var(--border)] hover:bg-[var(--surface)]">
                  <td className="py-2.5 pr-4 font-medium">{a.name}</td>
                  <td className="py-2.5 pr-4 text-[var(--muted)]">{a.username ?? '—'}</td>
                  <td className="py-2.5 pr-4"><Badge label={a.subscription_tier ?? 'free'} color={a.subscription_tier === 'pro' ? 'green' : 'gray'} /></td>
                  <td className="py-2.5 text-[var(--muted)]">{new Date(a.created_at).toLocaleDateString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {tab === 'activity' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-[var(--muted)]">{activity.length} recent events</p>
              <button onClick={() => af('/api/admin/activity-feed?limit=100').then(setActivity)} className="text-xs text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] px-3 py-1 rounded-lg">Refresh</button>
            </div>
            <div className="space-y-px">
              {activity.map((e: any, i: number) => {
                const icons: Record<string, string> = { athlete_signup: '🏃', coach_signup: '🎓', community_post: '💬', plan_generated: '📋' };
                const colors: Record<string, string> = { athlete_signup: 'text-[#00E5A0]', coach_signup: 'text-blue-400', community_post: 'text-purple-400', plan_generated: 'text-amber-400' };
                const labels: Record<string, string> = { athlete_signup: 'Athlete signed up', coach_signup: 'Coach signed up', community_post: 'Community post', plan_generated: 'Plan generated' };
                const diff = Date.now() - new Date(e.ts).getTime();
                const mins = Math.floor(diff / 60000);
                const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
                return (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 bg-[var(--surface)] border border-[var(--border)] first:rounded-t-xl last:rounded-b-xl">
                    <span className="text-lg mt-0.5">{icons[e.type] ?? '•'}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-semibold ${colors[e.type] ?? 'text-[var(--muted)]'}`}>{labels[e.type] ?? e.type}</span>
                      {e.meta && <span className="text-xs text-[var(--muted)] ml-2">{e.meta}</span>}
                      <p className="text-sm text-[var(--text2)] truncate mt-0.5">{e.label || '—'}</p>
                    </div>
                    <span className="text-xs text-[var(--muted)] whitespace-nowrap pt-0.5">{rel}</span>
                  </div>
                );
              })}
              {activity.length === 0 && <p className="text-sm text-[var(--muted)] py-8 text-center">No activity yet</p>}
            </div>
          </div>
        )}

        {tab === 'revenue' && revenue && (
          <div>
            <div className="mb-6 bg-[rgba(0,229,160,0.07)] border border-[rgba(0,229,160,0.22)] rounded-xl p-5">
              <p className="text-sm text-[var(--muted)]">Total Revenue</p>
              <p className="text-3xl font-bold text-[#00E5A0]">${(revenue.total_cents / 100).toFixed(2)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="pb-2 pr-4">Plan</th><th className="pb-2 pr-4">Coach</th>
                  <th className="pb-2 pr-4">Amount</th><th className="pb-2">Date</th>
                </tr></thead>
                <tbody>{revenue.purchases.map((p: any) => (
                  <tr key={p.id} className="border-b border-[var(--border)] hover:bg-[var(--surface)]">
                    <td className="py-2.5 pr-4">{p.plan?.title ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-[var(--muted)]">{p.plan?.coach?.name ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-[#00E5A0]">${((p.amount_paid_cents ?? 0) / 100).toFixed(2)}</td>
                    <td className="py-2.5 text-[var(--muted)]">{new Date(p.purchased_at).toLocaleDateString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
