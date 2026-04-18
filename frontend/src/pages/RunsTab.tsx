import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { AppLayout, Spinner } from '../components/ui';

interface Activity {
  id: string;
  strava_activity_id: number | null;
  activity_type: string;
  name: string;
  start_date: string;
  distance_meters: number;
  moving_time_seconds: number;
  elapsed_time_seconds: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  total_elevation_gain: number;
  average_speed: number;
  source: string;
  raw_data: { route_coordinates?: Array<{ lat: number; lon: number; ts: number }> } | null;
}

type DateRange = 'week' | 'last-week' | 'month' | 'last-month' | 'year' | 'all';

const RANGES: { key: DateRange; label: string }[] = [
  { key: 'week',      label: 'This Week'  },
  { key: 'last-week', label: 'Last Week'  },
  { key: 'month',     label: 'This Month' },
  { key: 'last-month',label: 'Last Month' },
  { key: 'year',      label: 'This Year'  },
  { key: 'all',       label: 'All Time'   },
];

function getRange(range: DateRange): { after?: string; before?: string } {
  const now = new Date();
  switch (range) {
    case 'week': {
      const d = new Date(now);
      d.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      d.setHours(0, 0, 0, 0);
      return { after: d.toISOString() };
    }
    case 'last-week': {
      const mon = new Date(now);
      mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) - 7);
      mon.setHours(0, 0, 0, 0);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      sun.setHours(23, 59, 59, 999);
      return { after: mon.toISOString(), before: sun.toISOString() };
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { after: d.toISOString() };
    }
    case 'last-month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last  = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { after: first.toISOString(), before: last.toISOString() };
    }
    case 'year': {
      const d = new Date(now.getFullYear(), 0, 1);
      return { after: d.toISOString() };
    }
    default:
      return {};
  }
}

function fmtMiles(m: number)  { return (m / 1609.34).toFixed(2); }
function fmtTime(s: number)   {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec}s`;
}
function fmtPace(speedMs: number): string {
  if (!speedMs) return '--:--';
  const pps = 1609.34 / speedMs;
  const m = Math.floor(pps / 60);
  const s = Math.round(pps % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RunsTab() {
  const { role, profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [range, setRange] = useState<DateRange>('week');
  const [runs, setRuns]   = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { after, before } = getRange(range);
    const params = new URLSearchParams({ page: '1', per_page: '200' });
    if (after)  params.set('after',  after);
    if (before) params.set('before', before);
    apiFetch(`/api/athlete/activities?${params}`)
      .then(res => {
        if (!cancelled) {
          setRuns((res.activities as Activity[] || []).filter(a =>
            a.activity_type.toLowerCase().includes('run')
          ));
        }
      })
      .catch(() => { if (!cancelled) setRuns([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const stats = useMemo(() => {
    const totalMiles  = runs.reduce((a, r) => a + (r.distance_meters || 0), 0) / 1609.34;
    const avgSpeed    = runs.length > 0
      ? runs.reduce((a, r) => a + (r.average_speed || 0), 0) / runs.length
      : 0;
    const longestMiles = runs.length > 0
      ? Math.max(...runs.map(r => r.distance_meters || 0)) / 1609.34
      : 0;
    return { totalMiles, totalRuns: runs.length, avgSpeed, longestMiles };
  }, [runs]);

  return (
    <AppLayout role={role || undefined} name={profile?.name} onLogout={clearAuth}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Runs</h1>
          <button
            onClick={() => nav('/athlete/track')}
            style={{ background: '#00E5A0', color: '#000', border: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            + Track Run
          </button>
        </div>

        {/* Date filter */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 20, scrollbarWidth: 'none' }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12,
                fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                background: range === r.key ? '#00E5A0' : 'rgba(255,255,255,0.06)',
                color:      range === r.key ? '#000'    : 'rgba(255,255,255,0.5)',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          <SCard label="Total Miles"  value={stats.totalMiles.toFixed(2)}  unit="mi"   accent />
          <SCard label="Total Runs"   value={String(stats.totalRuns)}       unit="runs" />
          <SCard label="Avg Pace"     value={fmtPace(stats.avgSpeed)}       unit="/mi"  />
          <SCard label="Longest Run"  value={stats.longestMiles.toFixed(2)} unit="mi"   />
        </div>

        {/* Run list */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <Spinner size="lg" />
          </div>
        ) : runs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>
            No runs found for this period.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {runs.map(run => (
              <RunCard
                key={run.id}
                run={run}
                onClick={() => nav(`/athlete/runs/${run.id}`, { state: { activity: run } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function SCard({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent ? 'rgba(0,229,160,0.25)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 14, padding: '16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'monospace', color: accent ? '#00E5A0' : 'var(--color-text-primary)', lineHeight: 1 }}>
        {value}
        <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.35)', marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  );
}

function RunCard({ run, onClick }: { run: Activity; onClick: () => void }) {
  const hasRoute = !!(run.raw_data?.route_coordinates?.length);
  const date = new Date(run.start_date).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: '3px solid #00E5A0', borderRadius: 14, padding: '14px 16px',
        outline: 'none', transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>
            {run.name || 'Run'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{date}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasRoute && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#00E5A0', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 6, padding: '2px 7px', letterSpacing: '0.05em' }}>
              MAP
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 7px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {run.source}
          </span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <RStat label="Distance" value={`${fmtMiles(run.distance_meters)} mi`} />
        <RStat label="Pace"     value={`${fmtPace(run.average_speed)} /mi`}   />
        <RStat label="Time"     value={fmtTime(run.moving_time_seconds)}       />
      </div>
    </button>
  );
}

function RStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{value}</div>
    </div>
  );
}
