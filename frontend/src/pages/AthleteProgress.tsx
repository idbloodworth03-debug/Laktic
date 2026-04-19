import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Card, Badge, Spinner, Alert } from '../components/ui';

const API_BASE = import.meta.env.VITE_API_URL as string || 'http://localhost:3001';

// ── Types ─────────────────────────────────────────────────────────────────────
type WeeklySummary = {
  week_start: string;
  total_distance_miles: number;
  total_duration_minutes: number;
  run_count: number;
  avg_pace_per_mile: string;
  avg_heartrate: number | null;
  longest_run_miles: number;
  intensity_score: number | null;
  compliance_pct: number | null;
};

type YTD = { total_miles: number; total_runs: number; total_hours: number };

type RaceResult = {
  id: string;
  race_name: string;
  race_date: string;
  distance: string;
  finish_time: string;
  pace_per_mile: string | null;
  placement: string | null;
  is_pr: boolean;
  conditions: string | null;
  notes: string | null;
};

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

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: 'week',       label: 'This Week'  },
  { key: 'last-week',  label: 'Last Week'  },
  { key: 'month',      label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: 'year',       label: 'This Year'  },
  { key: 'all',        label: 'All Time'   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function fmtMilesR(m: number)  { return (m / 1609.34).toFixed(2); }
function fmtTimeR(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec}s`;
}
function fmtPaceR(speedMs: number): string {
  if (!speedMs) return '--:--';
  const pps = 1609.34 / speedMs;
  const m = Math.floor(pps / 60);
  const s = Math.round(pps % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parsePace(pace: string): number {
  if (!pace || pace === '--') return 0;
  const parts = pace.split(':');
  if (parts.length !== 2) return 0;
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function formatPace(seconds: number): string {
  if (seconds <= 0) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function weekLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Shared button style ───────────────────────────────────────────────────────
const actionBtnStyle: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  padding: '8px 20px',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
};

// ── Charts ────────────────────────────────────────────────────────────────────
function BarChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div>
      {label && <div className="text-xs text-[var(--color-text-tertiary)] mb-3 font-medium uppercase tracking-wide">{label}</div>}
      <div className="flex items-end gap-1" style={{ height: 120 }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
            <div
              className="w-full rounded-t min-h-[2px] transition-all duration-500"
              style={{ height: `${Math.max((d.value / maxVal) * 100, 2)}%`, background: 'linear-gradient(to top, #00b87a, #00E5A0)', opacity: d.value > 0 ? 1 : 0.2 }}
              title={`${d.label}: ${d.value}`}
            />
            <div className="text-[9px] text-[var(--color-text-tertiary)] truncate w-full text-center leading-tight">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaceTrend({ data }: { data: { label: string; seconds: number }[] }) {
  const valid = data.filter(d => d.seconds > 0);
  if (valid.length === 0) return <div className="text-xs text-[var(--color-text-tertiary)]">No pace data</div>;
  const minS = Math.min(...valid.map(d => d.seconds));
  const maxS = Math.max(...valid.map(d => d.seconds));
  const range = maxS - minS || 60;
  return (
    <div>
      <div className="text-xs text-[var(--color-text-tertiary)] mb-3 font-medium uppercase tracking-wide">Avg Pace / Mile — lower is faster</div>
      <div className="flex items-end gap-1" style={{ height: 80 }}>
        {data.map((d, i) => {
          const pct = d.seconds > 0 ? ((d.seconds - minS) / range) * 75 + 25 : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
              {d.seconds > 0 && (
                <div className="w-full rounded-t min-h-[2px]" style={{ height: `${pct}%`, background: 'linear-gradient(to top, #b45309, #f59e0b)' }} title={`${d.label}: ${formatPace(d.seconds)}`} />
              )}
              <div className="text-[9px] text-[var(--color-text-tertiary)] truncate w-full text-center leading-tight">{d.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Runs sub-view ─────────────────────────────────────────────────────────────
function RunsSection() {
  const nav = useNavigate();
  const [range, setRange]   = useState<DateRange>('week');
  const [runs, setRuns]     = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { after, before } = getRange(range);
    const params = new URLSearchParams({ page: '1', per_page: '200' });
    if (after)  params.set('after', after);
    if (before) params.set('before', before);
    apiFetch(`/api/athlete/activities?${params}`)
      .then(res => {
        if (!cancelled) setRuns((res.activities as Activity[] || []).filter(a => a.activity_type.toLowerCase().includes('run')));
      })
      .catch(() => { if (!cancelled) setRuns([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const stats = useMemo(() => {
    const totalMiles   = runs.reduce((a, r) => a + (r.distance_meters || 0), 0) / 1609.34;
    const avgSpeed     = runs.length > 0 ? runs.reduce((a, r) => a + (r.average_speed || 0), 0) / runs.length : 0;
    const longestMiles = runs.length > 0 ? Math.max(...runs.map(r => r.distance_meters || 0)) / 1609.34 : 0;
    return { totalMiles, totalRuns: runs.length, avgSpeed, longestMiles };
  }, [runs]);

  return (
    <div className="flex flex-col gap-5">
      {/* Date filter + track button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, scrollbarWidth: 'none' }}>
          {DATE_RANGES.map(r => (
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
        <button onClick={() => nav('/athlete/track')} style={{ background: '#00E5A0', color: '#000', border: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
          + Track Run
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SCard label="Total Miles"  value={stats.totalMiles.toFixed(2)}  unit="mi"   accent />
        <SCard label="Total Runs"   value={String(stats.totalRuns)}       unit="runs" />
        <SCard label="Avg Pace"     value={fmtPaceR(stats.avgSpeed)}      unit="/mi"  />
        <SCard label="Longest Run"  value={stats.longestMiles.toFixed(2)} unit="mi"   />
      </div>

      {/* Run list */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><Spinner size="lg" /></div>
      ) : runs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>No runs found for this period.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {runs.map(run => (
            <RunCard key={run.id} run={run} onClick={() => nav(`/athlete/runs/${run.id}`, { state: { activity: run } })} />
          ))}
        </div>
      )}
    </div>
  );
}

function SCard({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent ? 'rgba(0,229,160,0.25)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 14, padding: 16, textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'monospace', color: accent ? '#00E5A0' : 'var(--color-text-primary)', lineHeight: 1 }}>
        {value}<span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.35)', marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  );
}

function RunCard({ run, onClick }: { run: Activity; onClick: () => void }) {
  const hasRoute = !!(run.raw_data?.route_coordinates?.length);
  const date = new Date(run.start_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <button onClick={onClick} style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '3px solid #00E5A0', borderRadius: 14, padding: '14px 16px', outline: 'none', transition: 'border-color 0.15s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{run.name || 'Run'}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{date}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasRoute && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#00E5A0', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 6, padding: '2px 7px', letterSpacing: '0.05em' }}>MAP</span>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <RStat label="Distance" value={`${fmtMilesR(run.distance_meters)} mi`} />
        <RStat label="Pace"     value={`${fmtPaceR(run.average_speed)} /mi`}   />
        <RStat label="Time"     value={fmtTimeR(run.moving_time_seconds)}       />
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

// ── Main Progress Page ────────────────────────────────────────────────────────
export function AthleteProgress() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  type RecentActivity = { date: string; name: string; distance_miles: number; duration_minutes: number; pace: string | null };

  const [activeTab, setActiveTab] = useState<'overview' | 'runs'>('overview');
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [ytd, setYtd]             = useState<YTD | null>(null);
  const [streak, setStreak]       = useState<number>(0);
  const [races, setRaces]         = useState<RaceResult[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      apiFetch('/api/athlete/progress/weekly?weeks=12'),
      apiFetch('/api/athlete/races/results'),
    ])
      .then(([weekly, raceResults]) => {
        setSummaries(weekly.summaries || []);
        setYtd(weekly.ytd || null);
        setStreak(weekly.streak || 0);
        setRecentActivities(weekly.recent_activities || []);
        setRaces(raceResults);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const downloadReport = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${API_BASE}/api/athlete/report.pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to generate report.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'laktic-season-report.pdf'; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || 'Failed to download report.');
    }
  };

  type Period = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'this-year';
  const [period, setPeriod] = useState<Period>('this-week');

  const currentWeek = summaries.length > 0 ? summaries[summaries.length - 1] : null;
  const prs = races.filter(r => r.is_pr);

  const periodLabels: Record<Period, string> = {
    'this-week': 'This Week', 'last-week': 'Last Week',
    'this-month': 'This Month', 'last-month': 'Last Month', 'this-year': 'This Year',
  };

  function getPeriodStats(p: Period): WeeklySummary | null {
    if (summaries.length === 0) return null;
    const sorted = [...summaries].sort((a, b) => b.week_start.localeCompare(a.week_start));
    if (p === 'this-week') return sorted[0] ?? null;
    if (p === 'last-week') return sorted[1] ?? null;
    const now = new Date();
    let filtered: WeeklySummary[];
    if (p === 'this-month') {
      filtered = sorted.filter(s => { const d = new Date(s.week_start + 'T00:00:00Z'); return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth(); });
    } else if (p === 'last-month') {
      const lm = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
      filtered = sorted.filter(s => { const d = new Date(s.week_start + 'T00:00:00Z'); return d.getUTCFullYear() === lm.getUTCFullYear() && d.getUTCMonth() === lm.getUTCMonth(); });
    } else {
      filtered = sorted.filter(s => new Date(s.week_start + 'T00:00:00Z').getUTCFullYear() === now.getUTCFullYear());
    }
    if (filtered.length === 0) return null;
    const totalMiles = filtered.reduce((a, s) => a + s.total_distance_miles, 0);
    const totalRuns  = filtered.reduce((a, s) => a + s.run_count, 0);
    const longestRun = Math.max(...filtered.map(s => s.longest_run_miles));
    const paceWeeks  = filtered.filter(s => parsePace(s.avg_pace_per_mile) > 0);
    const avgPaceSec = paceWeeks.length > 0 ? paceWeeks.reduce((a, s) => a + parsePace(s.avg_pace_per_mile), 0) / paceWeeks.length : 0;
    return {
      week_start: filtered[filtered.length - 1].week_start,
      total_distance_miles: Math.round(totalMiles * 10) / 10,
      total_duration_minutes: filtered.reduce((a, s) => a + s.total_duration_minutes, 0),
      run_count: totalRuns,
      avg_pace_per_mile: avgPaceSec > 0 ? formatPace(avgPaceSec) : '--',
      avg_heartrate: null, longest_run_miles: Math.round(longestRun * 10) / 10,
      intensity_score: null, compliance_pct: null,
    };
  }

  const periodStats = getPeriodStats(period);
  const volumeData  = summaries.map(s => ({ label: weekLabel(s.week_start), value: Math.round(s.total_distance_miles * 10) / 10 }));
  const paceData    = summaries.map(s => ({ label: weekLabel(s.week_start), seconds: parsePace(s.avg_pace_per_mile) }));

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex flex-col items-center mb-6 fade-up gap-4">
          <h1 className="font-display text-2xl font-bold text-[var(--color-text-primary)]">Training Progress</h1>
          <div className="flex gap-2 flex-wrap justify-center">
            <button
              style={{ ...actionBtnStyle, background: activeTab === 'runs' ? '#fff' : '#111', color: activeTab === 'runs' ? '#000' : '#fff' }}
              onClick={() => setActiveTab(activeTab === 'runs' ? 'overview' : 'runs')}
            >
              Runs
            </button>
            <button style={actionBtnStyle} onClick={downloadReport}>
              Download Report
            </button>
          </div>
        </div>

        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')} /></div>}

        {/* Tab content */}
        {activeTab === 'runs' ? (
          <RunsSection />
        ) : loading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          <div className="flex flex-col gap-5 fade-up-1">

            {/* YTD + Streak */}
            {(ytd || streak > 0) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ytd && (
                  <>
                    <StatBox label="Year-to-Date Miles" value={`${ytd.total_miles} mi`} accent />
                    <StatBox label="Runs This Year"     value={String(ytd.total_runs)} />
                    <StatBox label="Hours This Year"    value={`${ytd.total_hours} hr`} />
                  </>
                )}
                {streak > 0 && (
                  <div className="rounded-lg p-3 border" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
                    <div className="text-[10px] text-amber-400 uppercase tracking-wide mb-1">Active Streak</div>
                    <div className="text-lg font-bold font-mono text-amber-300">{streak} {streak === 1 ? 'day' : 'days'} 🔥</div>
                  </div>
                )}
              </div>
            )}

            {/* Period stats card */}
            {(currentWeek || summaries.length > 0) && (
              <Card
                title={periodLabels[period]}
                action={
                  <select
                    value={period}
                    onChange={e => setPeriod(e.target.value as Period)}
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-primary)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
                  >
                    <option value="this-week">This Week</option>
                    <option value="last-week">Last Week</option>
                    <option value="this-month">This Month</option>
                    <option value="last-month">Last Month</option>
                    <option value="this-year">This Year</option>
                  </select>
                }
              >
                {periodStats ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <StatBox label="Distance"    value={`${periodStats.total_distance_miles.toFixed(1)} mi`} accent />
                      <StatBox label="Runs"        value={String(periodStats.run_count)} />
                      <StatBox label="Avg Pace"    value={periodStats.avg_pace_per_mile || '--'} />
                      <StatBox label="Longest Run" value={periodStats.longest_run_miles > 0 ? `${periodStats.longest_run_miles} mi` : '--'} />
                    </div>
                    {periodStats.compliance_pct !== null && (
                      <div className="mt-4 flex items-center gap-3">
                        <div className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wide shrink-0">Plan Compliance</div>
                        <div className="flex-1 h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${periodStats.compliance_pct >= 80 ? 'bg-gradient-to-r from-[#00b87a] to-[#00E5A0]' : periodStats.compliance_pct >= 50 ? 'bg-gradient-to-r from-amber-700 to-amber-500' : 'bg-gradient-to-r from-red-800 to-red-500'}`}
                            style={{ width: `${periodStats.compliance_pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-[var(--color-text-primary)] shrink-0">{periodStats.compliance_pct}%</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-[var(--color-text-tertiary)] py-2">No data for this period.</div>
                )}
              </Card>
            )}

            {volumeData.length > 0 && volumeData.some(d => d.value > 0) && (
              <Card title="Weekly Volume (miles)"><BarChart data={volumeData} label="" /></Card>
            )}

            {paceData.some(d => d.seconds > 0) && (
              <Card title="Pace Trend"><PaceTrend data={paceData} /></Card>
            )}

            {prs.length > 0 && (
              <Card title="Personal Records">
                <div className="flex flex-col gap-2">
                  {prs.map(pr => (
                    <div key={pr.id} className="flex items-center justify-between p-3 bg-[var(--color-bg-tertiary)] rounded-lg border border-[var(--color-border)] border-l-2 border-l-amber-500">
                      <div className="flex items-center gap-3">
                        <Badge label="PR" color="amber" />
                        <div>
                          <div className="text-sm font-medium text-[var(--color-text-primary)]">{pr.race_name}</div>
                          <div className="text-xs text-[var(--color-text-tertiary)]">{pr.distance} · {new Date(pr.race_date + 'T00:00:00').toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="text-sm font-bold text-[var(--color-accent)] font-mono">{pr.finish_time}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {recentActivities.length > 0 && (
              <Card title="Recent Activities">
                <div className="flex flex-col gap-2">
                  {recentActivities.map((act, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--color-border)]/50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">{act.name}</div>
                        <div className="text-xs text-[var(--color-text-tertiary)]">{new Date(act.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                      </div>
                      <div className="flex items-center gap-4 text-sm font-mono shrink-0">
                        <span className="text-[var(--color-accent)] font-bold">{act.distance_miles.toFixed(2)} mi</span>
                        {act.pace && <span className="text-[var(--color-text-tertiary)]">{act.pace}/mi</span>}
                        <span className="text-[var(--color-text-tertiary)]">{act.duration_minutes} min</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {summaries.length === 0 && races.length === 0 && recentActivities.length === 0 && (
              <Card>
                <div className="text-center py-8">
                  <p className="text-sm text-[var(--color-text-tertiary)] mb-5 leading-relaxed">No activity data yet. Connect Strava or log activities to see your progress here.</p>
                  <Link to="/athlete/activities"><button style={actionBtnStyle}>View Activities</button></Link>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function StatBox({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${accent ? 'bg-[var(--color-accent-dim)] border-[var(--color-border)]' : 'bg-[var(--color-bg-tertiary)] border-[var(--color-border)]'}`}>
      <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${accent ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'}`}>{value}</div>
    </div>
  );
}
