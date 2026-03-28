import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Badge, Spinner, Alert } from '../components/ui';

const API_BASE = import.meta.env.VITE_API_BASE_URL as string || 'http://localhost:3001';

type WeeklySummary = {
  id: string;
  week_start: string;
  total_distance_miles: number;
  total_duration_minutes: number;
  total_elevation_feet: number;
  run_count: number;
  avg_pace_per_mile: string;
  avg_heartrate: number | null;
  longest_run_miles: number;
  intensity_score: number | null;
  compliance_pct: number | null;
};

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

function BarChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const showEvery = data.length >= 10 ? 3 : data.length >= 6 ? 2 : 1;
  return (
    <div style={{ width: '100%', overflowX: 'hidden' }}>
      {label && <div className="text-xs text-[var(--muted)] mb-3 font-medium uppercase tracking-wide">{label}</div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '120px', width: '100%' }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: '2px' }}>
            <div
              style={{
                width: '100%',
                minHeight: '2px',
                borderRadius: '2px 2px 0 0',
                height: `${Math.max((d.value / maxVal) * 100, 2)}%`,
                background: 'linear-gradient(to top, #16a34a, #22c55e)',
                opacity: d.value > 0 ? 1 : 0.2,
                transition: 'height 0.5s',
              }}
              title={`${d.label}: ${d.value}`}
            />
            <div style={{ fontSize: '7px', color: 'var(--muted)', width: '100%', textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
              {i % showEvery === 0 ? d.label : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaceTrend({ data }: { data: { label: string; seconds: number }[] }) {
  const valid = data.filter(d => d.seconds > 0);
  if (valid.length === 0) return <div className="text-xs text-[var(--muted)]">No pace data</div>;

  const minS = Math.min(...valid.map(d => d.seconds));
  const maxS = Math.max(...valid.map(d => d.seconds));
  const range = maxS - minS || 60;

  const showEvery = data.length >= 10 ? 3 : data.length >= 6 ? 2 : 1;
  return (
    <div style={{ width: '100%', overflowX: 'hidden' }}>
      <div className="text-xs text-[var(--muted)] mb-3 font-medium uppercase tracking-wide">Avg Pace / Mile — lower is faster</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '80px', width: '100%' }}>
        {data.map((d, i) => {
          const pct = d.seconds > 0 ? ((d.seconds - minS) / range) * 75 + 25 : 0;
          return (
            <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: '2px' }}>
              {d.seconds > 0 && (
                <div
                  style={{
                    width: '100%',
                    minHeight: '2px',
                    borderRadius: '2px 2px 0 0',
                    height: `${pct}%`,
                    background: 'linear-gradient(to top, #1d4ed8, #60a5fa)',
                  }}
                  title={`${d.label}: ${formatPace(d.seconds)}`}
                />
              )}
              <div style={{ fontSize: '7px', color: 'var(--muted)', width: '100%', textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
                {i % showEvery === 0 ? d.label : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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

export function AthleteProgress() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [races, setRaces] = useState<RaceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState('');
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    Promise.all([
      apiFetch('/api/athlete/progress/weekly?weeks=12'),
      apiFetch('/api/athlete/races/results')
    ])
      .then(([weeklies, raceResults]) => {
        setSummaries(weeklies);
        setRaces(raceResults);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const recompute = async () => {
    setComputing(true);
    setError('');
    try {
      const { summaries: updated } = await apiFetch('/api/athlete/progress/compute', {
        method: 'POST',
        body: JSON.stringify({ weeks: 12 })
      });
      setSummaries(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setComputing(false);
    }
  };

  const downloadReport = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${API_BASE}/api/athlete/report.pdf`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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

  const currentWeek = summaries.length > 0 ? summaries[summaries.length - 1] : null;
  const prs = races.filter(r => r.is_pr);

  const volumeData = summaries.map(s => ({
    label: weekLabel(s.week_start),
    value: Math.round(s.total_distance_miles * 10) / 10
  }));

  const paceData = summaries.map(s => ({
    label: weekLabel(s.week_start),
    seconds: parsePace(s.avg_pace_per_mile)
  }));

  return (
    <div className="min-h-screen overflow-x-hidden">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-6 fade-up">
          <h1 className="font-display font-bold text-[var(--text)]" style={{ fontSize: '1.5rem', lineHeight: '2rem', paddingBottom: '4px' }}>Training Progress</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Weekly volume, pace trends, and race results</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Link to="/athlete/plan"><Button variant="ghost" size="sm">Plan</Button></Link>
            <Link to="/athlete/races"><Button variant="ghost" size="sm">Races</Button></Link>
            <Button variant="secondary" size="sm" onClick={recompute} loading={computing}>Refresh Data</Button>
            <Button variant="secondary" size="sm" onClick={downloadReport}>Download Report</Button>
          </div>
        </div>

        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')} /></div>}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          <div className="flex flex-col gap-5 fade-up-1">
            {currentWeek && (
              <Card title="This Week">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatBox label="Distance" value={`${currentWeek.total_distance_miles.toFixed(1)} mi`} accent />
                  <StatBox label="Runs" value={String(currentWeek.run_count)} />
                  <StatBox label="Avg Pace" value={currentWeek.avg_pace_per_mile || '--'} />
                  <StatBox label="Avg HR" value={currentWeek.avg_heartrate ? `${currentWeek.avg_heartrate} bpm` : '--'} />
                </div>
                {currentWeek.compliance_pct !== null && (
                  <div className="mt-4 flex items-center gap-3">
                    <div className="text-xs text-[var(--muted)] uppercase tracking-wide shrink-0">Plan Compliance</div>
                    <div className="flex-1 h-1.5 bg-[var(--surface2)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          currentWeek.compliance_pct >= 80 ? 'bg-gradient-to-r from-brand-600 to-brand-500'
                          : currentWeek.compliance_pct >= 50 ? 'bg-gradient-to-r from-amber-700 to-amber-500'
                          : 'bg-gradient-to-r from-red-800 to-red-500'}`}
                        style={{ width: `${currentWeek.compliance_pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-[var(--text)] shrink-0">{currentWeek.compliance_pct}%</span>
                  </div>
                )}
              </Card>
            )}

            {volumeData.length > 0 && (
              <Card title="Weekly Volume (miles)">
                <BarChart data={volumeData} label="" />
              </Card>
            )}

            {paceData.some(d => d.seconds > 0) && (
              <Card title="Pace Trend">
                <PaceTrend data={paceData} />
              </Card>
            )}

            {prs.length > 0 && (
              <Card title="Personal Records">
                <div className="flex flex-col gap-2">
                  {prs.map(pr => (
                    <div key={pr.id} className="flex items-center justify-between p-3 bg-[var(--surface2)] rounded-lg border border-[var(--border)] border-l-2 border-l-amber-500">
                      <div className="flex items-center gap-3">
                        <Badge label="PR" color="amber" />
                        <div>
                          <div className="text-sm font-medium text-[var(--text)]">{pr.race_name}</div>
                          <div className="text-xs text-[var(--muted)]">{pr.distance} · {new Date(pr.race_date + 'T00:00:00').toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="text-sm font-bold text-brand-400 font-mono">{pr.finish_time}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {summaries.length === 0 && races.length === 0 && (
              <Card>
                <div className="text-center py-8">
                  <p className="text-sm text-[var(--muted)] mb-5 leading-relaxed">
                    No progress data yet. Connect Strava and sync activities, then click Refresh Data.
                  </p>
                  <Button onClick={recompute} loading={computing}>Compute Weekly Summaries</Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${accent ? 'bg-brand-950/30 border-brand-900/40' : 'bg-[var(--surface2)] border-[var(--border)]'}`}>
      <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-lg font-bold font-display ${accent ? 'text-brand-400' : 'text-[var(--text)]'}`}>{value}</div>
    </div>
  );
}
