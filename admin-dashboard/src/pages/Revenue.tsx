import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

interface Purchase {
  id: string;
  amount_paid_cents: number;
  purchased_at: string;
  plan: {
    title: string;
    price_cents: number;
    coach: { name: string } | null;
  } | null;
}

interface RevenueData {
  purchases: Purchase[];
  total_cents: number;
}

export default function Revenue() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<RevenueData>('/api/admin/revenue')
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  if (error) return <Err msg={error} />;
  if (!data) return <Loading />;

  const purchases = data.purchases ?? [];

  return (
    <div>
      <h1 style={h1}>Revenue</h1>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Revenue" value={fmtCents(data.total_cents)} accent />
        <StatCard label="Transactions" value={String(purchases.length)} />
        <StatCard label="Avg. Sale" value={purchases.length ? fmtCents(Math.round(data.total_cents / purchases.length)) : '—'} />
      </div>

      {/* Table */}
      <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
              {['Plan', 'Coach', 'Amount', 'Date'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#555', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {purchases.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #141414' }}>
                <td style={td}>{p.plan?.title ?? '—'}</td>
                <td style={td}>{p.plan?.coach?.name ?? '—'}</td>
                <td style={{ ...td, color: '#00E5A0', fontFamily: 'monospace' }}>{fmtCents(p.amount_paid_cents)}</td>
                <td style={{ ...td, color: '#555' }}>{fmtDate(p.purchased_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {purchases.length === 0 && (
          <div style={{ padding: '28px', color: '#555', fontSize: 13, textAlign: 'center' }}>No purchases yet</div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, padding: '20px 22px' }}>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent ? '#00E5A0' : '#fff', fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

function fmtCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#fff' };
const td: React.CSSProperties = { padding: '11px 16px', color: '#ccc' };
const Loading = () => <div style={{ color: '#555', fontSize: 14 }}>Loading…</div>;
const Err = ({ msg }: { msg: string }) => (
  <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '12px 16px', fontSize: 14 }}>{msg}</div>
);
