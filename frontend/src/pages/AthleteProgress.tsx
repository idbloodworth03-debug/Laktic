import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Card, Badge, Spinner, Alert } from '../components/ui';

const API_BASE = import.meta.env.VITE_API_URL as string || 'http://localhost:3001';

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
              style={{
                height: `${Math.max((d.value / maxVal) * 100, 2)}%`,
                background: `linear-gradient(to top, #00b87a, #00E5A0)`,
                opacity: d.value > 0 ? 1 : 0.2,
              }}
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
                <div
                  className="w-full rounded-t min-h-[2px]"
                  style={{
                    height: `${pct}%`,
                    background: 'linear-gradient(to top, #b45309, #f59e0b)',
                  }}
                  title={`${d.label}: ${formatPace(d.seconds)}`}
                />
              )}
              <div className="text-[9px] text-[var(--color-text-tertiary)] truncate w-full text-center leading-tight">{d.label}</div>
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
  type RecentActivity = {
    date: string;
    name: string;
    distance_miles: number;
    duration_minutes: number;
    pace: string | null;
  };

  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [ytd, setYtd] = useState<YTD | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [races, setRaces] = useState<RaceResult[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const loadData = () => {
    setLoading(true);
    setError('');
    Promise.all([
      apiFetch('/api/athlete/progress/weekly?weeks=12'),
      apiFetch('/api/athlete/races/results')
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
  };

  useEffect(() => { loadData(); }, []);

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
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--color-text-primary)]">Training Progress</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Weekly volume, pace trends, and race results</p>
          </div>
          <div className="flex gap-2">
            <Link to="/athlete/plan"><Button variant="ghost" size="sm">Plan</Button></Link>
            <Link to="/athlete/races"><Button variant="ghost" size="sm">Races</Button></Link>
            <Link to="/athlete/runs"><Button variant="ghost" size="sm">Runs</Button></Link>
            <Button variant="secondary" size="sm" onClick={loadData} loading={loading}>Refresh</Button>
            <Button variant="secondary" size="sm" onClick={downloadReport}>Download Report</Button>
          </div>
        </div>

        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')} /></div>}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          <div className="flex flex-col gap-5 fade-up-1">

            {/* YTD + Streak Banner */}
            {(ytd || streak > 0) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ytd && (
                  <>
                    <StatBox label="Year-to-Date Miles" value={`${ytd.total_miles} mi`} accent />
                    <StatBox label="Runs This Year" value={String(ytd.total_runs)} />
                    <StatBox label="Hours This Year" value={`${ytd.total_hours} hr`} />
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

            {currentWeek && (
              <Card title="This Week">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatBox label="Distance" value={`${currentWeek.total_distance_miles.toFixed(1)} mi`} accent />
                  <StatBox label="Runs" value={String(currentWeek.run_count)} />
                  <StatBox label="Avg Pace" value={currentWeek.avg_pace_per_mile || '--'} />
                  <StatBox label="Longest Run" value={currentWeek.longest_run_miles > 0 ? `${currentWeek.longest_run_miles} mi` : '--'} />
                </div>
                {currentWeek.compliance_pct !== null && (
                  <div className="mt-4 flex items-center gap-3">
                    <div className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wide shrink-0">Plan Compliance</div>
                    <div className="flex-1 h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          currentWeek.compliance_pct >= 80 ? 'bg-gradient-to-r from-[#00b87a] to-[#00E5A0]'
                          : currentWeek.compliance_pct >= 50 ? 'bg-gradient-to-r from-amber-700 to-amber-500'
                          : 'bg-gradient-to-r from-red-800 to-red-500'}`}
                        style={{ width: `${currentWeek.compliance_pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-[var(--color-text-primary)] shrink-0">{currentWeek.compliance_pct}%</span>
                  </div>
                )}
              </Card>
            )}

            {volumeData.length > 0 && volumeData.some(d => d.value > 0) && (
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
                        <div className="text-xs text-[var(--color-text-tertiary)]">
                          {new Date(act.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
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
                  <p className="text-sm text-[var(--color-text-tertiary)] mb-5 leading-relaxed">
                    No activity data yet. Connect Strava or log activities to see your progress here.
                  </p>
                  <Link to="/athlete/activities"><Button>View Activities</Button></Link>
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
