import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Navbar, Card, Button, Spinner, Badge } from '../components/ui';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, ResponsiveContainer,
} from 'recharts';

interface LoadPoint {
  date: string;
  atl: number;
  ctl: number;
  tsb: number;
  load: number;
}

interface WeeklyPoint {
  week: string;
  km: number;
  minutes: number;
  count: number;
}

const TSB_COLORS = {
  atl: '#f97316',
  ctl: '#22c55e',
  tsb: '#3b82f6',
};

export function AnalyticsDashboard() {
  const { profile, role } = useAuthStore();
  const [loads, setLoads] = useState<LoadPoint[]>([]);
  const [weekly, setWeekly] = useState<WeeklyPoint[]>([]);
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'atl_ctl' | 'tsb' | 'weekly'>('atl_ctl');
  const logout = async () => { const { supabase } = await import('../lib/supabaseClient'); await supabase.auth.signOut(); useAuthStore.getState().clearAuth(); };

  useEffect(() => {
    Promise.all([
      apiFetch('/api/training-analytics/loads'),
      apiFetch('/api/training-analytics/weekly'),
    ]).then(([loadsRes, weeklyRes]) => {
      setLoads(loadsRes.loads ?? []);
      setIsPro(loadsRes.is_pro ?? false);
      setWeekly(weeklyRes);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Show only last 90 data points for chart readability
  const chartData = loads.slice(-90);

  const latest = loads[loads.length - 1];

  const formatDate = (d: string) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const tsbStatus = latest
    ? latest.tsb > 10 ? { label: 'Fresh', color: 'green' as const }
    : latest.tsb > -10 ? { label: 'Neutral', color: 'gray' as const }
    : latest.tsb > -30 ? { label: 'Tired', color: 'amber' as const }
    : { label: 'Very Tired', color: 'red' as const }
    : null;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role={role ?? 'athlete'} name={profile?.name} onLogout={logout} />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Training Analytics</h1>
            <p className="text-sm text-[var(--muted)] mt-1">ATL · CTL · TSB — Banister impulse-response model</p>
          </div>
          {!isPro && (
            <Link to="/athlete/pro">
              <Button variant="primary" size="sm">Upgrade to Pro for full history</Button>
            </Link>
          )}
        </div>

        {!isPro && (
          <div className="mb-6 bg-amber-950/30 border border-amber-800/40 rounded-xl p-4 text-sm text-amber-300">
            Free tier shows last 30 days. <Link to="/athlete/pro" className="underline font-medium">Upgrade to Pro</Link> for full 12-month history.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : loads.length === 0 ? (
          <Card><p className="text-center text-[var(--muted)] py-8">No activity data yet. Log activities to see your training load metrics.</p></Card>
        ) : (
          <>
            {/* Summary cards */}
            {latest && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                  <p className="text-xs text-[var(--muted)] mb-1">ATL (Fatigue)</p>
                  <p className="text-2xl font-bold text-orange-400">{latest.atl}</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                  <p className="text-xs text-[var(--muted)] mb-1">CTL (Fitness)</p>
                  <p className="text-2xl font-bold text-green-400">{latest.ctl}</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                  <p className="text-xs text-[var(--muted)] mb-1">TSB (Form)</p>
                  <p className={`text-2xl font-bold ${latest.tsb >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{latest.tsb > 0 ? '+' : ''}{latest.tsb}</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                  <p className="text-xs text-[var(--muted)] mb-1">Status</p>
                  {tsbStatus && <Badge label={tsbStatus.label} color={tsbStatus.color} />}
                </div>
              </div>
            )}

            {/* View toggle */}
            <div className="flex gap-2 mb-4">
              {(['atl_ctl','tsb','weekly'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${view === v ? 'bg-brand-600 border-brand-500 text-white' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'}`}
                >
                  {v === 'atl_ctl' ? 'ATL / CTL' : v === 'tsb' ? 'TSB Form' : 'Weekly Volume'}
                </button>
              ))}
            </div>

            <Card>
              <ResponsiveContainer width="100%" height={320}>
                {view === 'atl_ctl' ? (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      labelFormatter={(d: any) => formatDate(d as string)}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="atl" stroke={TSB_COLORS.atl} dot={false} name="ATL (Fatigue)" strokeWidth={2} />
                    <Line type="monotone" dataKey="ctl" stroke={TSB_COLORS.ctl} dot={false} name="CTL (Fitness)" strokeWidth={2} />
                  </LineChart>
                ) : view === 'tsb' ? (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      labelFormatter={(d: any) => formatDate(d as string)}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="tsb" stroke={TSB_COLORS.tsb} dot={false} name="TSB (Form)" strokeWidth={2} />
                  </LineChart>
                ) : (
                  <BarChart data={weekly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="week" tickFormatter={formatDate} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, name: any) => [name === 'km' ? `${v.toFixed(1)} km` : `${v} min`, name === 'km' ? 'Distance' : 'Duration']}
                      labelFormatter={(d: any) => formatDate(d as string)}
                    />
                    <Legend />
                    <Bar dataKey="km" fill="#22c55e" name="Distance (km)" radius={[3,3,0,0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </Card>

            <div className="mt-4 text-xs text-[var(--muted)] space-y-1">
              <p><strong className="text-orange-400">ATL</strong> (Acute Training Load) — 7-day fatigue. High ATL = tired.</p>
              <p><strong className="text-green-400">CTL</strong> (Chronic Training Load) — 42-day fitness. Higher CTL = more fit.</p>
              <p><strong className="text-blue-400">TSB</strong> (Training Stress Balance) = CTL − ATL. Positive = fresh, ready to race.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
