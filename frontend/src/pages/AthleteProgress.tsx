import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Badge, Spinner, Alert } from '../components/ui';

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
  return (
    <div>
      <div className="text-xs text-[var(--muted)] mb-2 font-medium">{label}</div>
      <div className="flex items-end gap-1" style={{ height: 120 }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <div
              className="w-full bg-brand-500 rounded-t-sm min-h-[2px] transition-all"
              style={{ height: `${Math.max((d.value / maxVal) * 100, 2)}%` }}
              title={`${d.label}: ${d.value}`}
            />
            <div className="text-[10px] text-[var(--muted)] mt-1 truncate w-full text-center">{d.label}</div>
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

  return (
    <div>
      <div className="text-xs text-[var(--muted)] mb-2 font-medium">Avg Pace / Mile (lower is faster)</div>
      <div className="flex items-end gap-1" style={{ height: 80 }}>
        {data.map((d, i) => {
          const pct = d.seconds > 0 ? ((d.seconds - minS) / range) * 80 + 20 : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              {d.seconds > 0 && (
                <div
                  className="w-full bg-blue-500 rounded-t-sm min-h-[2px]"
                  style={{ height: `${pct}%` }}
                  title={`${d.label}: ${formatPace(d.seconds)}`}
                />
              )}
              <div className="text-[10px] text-[var(--muted)] mt-1 truncate w-full text-center">{d.label}</div>
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
    <div className="min-h-screen">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Training Progress</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Weekly volume, pace trends, and race results</p>
          </div>
          <div className="flex gap-2">
            <Link to="/athlete/plan"><Button variant="ghost" size="sm">Plan</Button></Link>
            <Link to="/athlete/races"><Button variant="ghost" size="sm">Races</Button></Link>
            <Button variant="secondary" size="sm" onClick={recompute} loading={computing}>Refresh Data</Button>
          </div>
        </div>

        {error && <Alert type="error" message={error} onClose={() => setError('')} />}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Current Week Stats */}
            {currentWeek && (
              <Card title="This Week">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatBox label="Distance" value={`${currentWeek.total_distance_miles.toFixed(1)} mi`} />
                  <StatBox label="Runs" value={String(currentWeek.run_count)} />
                  <StatBox label="Avg Pace" value={currentWeek.avg_pace_per_mile || '--'} />
                  <StatBox label="Avg HR" value={currentWeek.avg_heartrate ? `${currentWeek.avg_heartrate} bpm` : '--'} />
                </div>
                {currentWeek.compliance_pct !== null && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="text-xs text-[var(--muted)]">Plan Compliance</div>
                    <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${currentWeek.compliance_pct >= 80 ? 'bg-brand-500' : currentWeek.compliance_pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${currentWeek.compliance_pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium">{currentWeek.compliance_pct}%</span>
                  </div>
                )}
              </Card>
            )}

            {/* Volume Chart */}
            {volumeData.length > 0 && (
              <Card title="Weekly Volume (miles)">
                <BarChart data={volumeData} label="" />
              </Card>
            )}

            {/* Pace Trend */}
            {paceData.some(d => d.seconds > 0) && (
              <Card title="Pace Trend">
                <PaceTrend data={paceData} />
              </Card>
            )}

            {/* PRs */}
            {prs.length > 0 && (
              <Card title="Personal Records">
                <div className="flex flex-col gap-2">
                  {prs.map(pr => (
                    <div key={pr.id} className="flex items-center justify-between p-3 bg-dark-700 rounded-lg border border-[var(--border)]">
                      <div className="flex items-center gap-3">
                        <Badge label="PR" color="amber" />
                        <div>
                          <div className="text-sm font-medium">{pr.race_name}</div>
                          <div className="text-xs text-[var(--muted)]">{pr.distance} &middot; {new Date(pr.race_date + 'T00:00:00').toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-brand-400">{pr.finish_time}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {summaries.length === 0 && races.length === 0 && (
              <Card>
                <div className="text-center py-8">
                  <p className="text-sm text-[var(--muted)] mb-4">No progress data yet. Connect Strava and sync activities, then click Refresh Data.</p>
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

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-dark-700 rounded-lg p-3 border border-[var(--border)]">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className="text-lg font-semibold font-display">{value}</div>
    </div>
  );
}
