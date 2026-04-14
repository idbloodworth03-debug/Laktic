import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

interface Stats {
  totals: {
    coaches: number;
    athletes: number;
    published_plans: number;
    plan_purchases: number;
    certified_coaches: number;
  };
  last_30_days: {
    new_coaches: number;
    new_athletes: number;
  };
}

interface GrowthPoint {
  date: string;
  coaches: number;
  athletes: number;
}

export default function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<Stats>('/api/admin/stats'),
      apiFetch<GrowthPoint[]>('/api/admin/growth'),
    ])
      .then(([s, g]) => { setStats(s); setGrowth(g); })
      .catch(e => setError(e.message));
  }, []);

  if (error) return <Err msg={error} />;
  if (!stats) return <Loading />;

  const cards = [
    { label: 'Total Athletes', value: stats.totals.athletes, delta: `+${stats.last_30_days.new_athletes} this month` },
    { label: 'Total Coaches', value: stats.totals.coaches, delta: `+${stats.last_30_days.new_coaches} this month` },
    { label: 'Plan Purchases', value: stats.totals.plan_purchases },
    { label: 'Published Plans', value: stats.totals.published_plans },
    { label: 'Certified Coaches', value: stats.totals.certified_coaches },
  ];

  return (
    <div>
      <h1 style={h1}>Overview</h1>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 36 }}>
        {cards.map(c => (
          <div key={c.label} style={card}>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{c.value.toLocaleString()}</div>
            {c.delta && <div style={{ fontSize: 12, color: '#00E5A0', marginTop: 6 }}>{c.delta}</div>}
          </div>
        ))}
      </div>

      {/* Growth chart */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 20 }}>New Signups (last 30 days)</div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={growth} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00E5A0" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#00E5A0" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e1e1e" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 11 }} tickLine={false} axisLine={false}
              tickFormatter={d => d.slice(5)} interval={4} />
            <YAxis tick={{ fill: '#555', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#888', paddingTop: 8 }} />
            <Area type="monotone" dataKey="athletes" name="Athletes" stroke="#00E5A0" fill="url(#ga)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="coaches" name="Coaches" stroke="#60a5fa" fill="url(#gc)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#fff' };
const card: React.CSSProperties = { background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, padding: '20px 22px' };
const Loading = () => <div style={{ color: '#555', fontSize: 14 }}>Loading…</div>;
const Err = ({ msg }: { msg: string }) => (
  <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '12px 16px', fontSize: 14 }}>{msg}</div>
);
