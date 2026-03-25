import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Badge, Spinner, Alert } from '../components/ui';

type AthleteProfile = {
  id: string;
  name: string;
  weekly_volume_miles: number | null;
  primary_events: string | null;
};

type WeeklySummary = {
  id: string;
  week_start: string;
  total_distance_miles: number;
  total_duration_minutes: number;
  run_count: number;
  avg_pace_per_mile: string;
  avg_heartrate: number | null;
  longest_run_miles: number;
  compliance_pct: number | null;
};

type TeamMemberProgress = {
  athlete: AthleteProfile;
  member_status: string;
  latest_week: WeeklySummary | null;
};

type AthleteDetail = {
  profile: AthleteProfile;
  summaries: WeeklySummary[];
  races: any[];
};

function ComplianceBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-[var(--muted)]">--</span>;
  const color = pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'gray';
  return <Badge label={`${pct}%`} color={color} dot />;
}

export function CoachTeamProgress() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [members, setMembers] = useState<TeamMemberProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [athleteDetail, setAthleteDetail] = useState<AthleteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/coach/team/progress')
      .then(setMembers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const viewAthlete = async (athleteId: string) => {
    setSelectedAthlete(athleteId);
    setDetailLoading(true);
    setError('');
    try {
      const detail = await apiFetch(`/api/coach/team/athletes/${athleteId}/progress?weeks=12`);
      setAthleteDetail(detail);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedAthlete(null);
    setAthleteDetail(null);
  };

  return (
    <div className="min-h-screen">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text)]">Team Progress</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Overview of your athletes' training progress</p>
          </div>
          <div className="flex gap-2">
            <Link to="/coach/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>
          </div>
        </div>

        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')} /></div>}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
        ) : selectedAthlete ? (
          /* Athlete Detail View */
          <div className="fade-up">
            <Button variant="ghost" size="sm" onClick={closeDetail} className="mb-5">← Back to Team</Button>
            {detailLoading ? (
              <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
            ) : athleteDetail ? (
              <div className="flex flex-col gap-5">
                <Card>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--surface2)] border border-[var(--border2)] flex items-center justify-center text-sm font-semibold text-brand-400">
                      {athleteDetail.profile.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-[var(--text)]">{athleteDetail.profile.name}</h3>
                      <div className="text-sm text-[var(--muted)]">
                        {athleteDetail.profile.primary_events && <span>{athleteDetail.profile.primary_events}</span>}
                        {athleteDetail.profile.weekly_volume_miles && (
                          <span> · Target {athleteDetail.profile.weekly_volume_miles} mi/wk</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>

                {athleteDetail.summaries.length > 0 && (
                  <Card title="Weekly Summaries">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left">
                            {['Week', 'Miles', 'Runs', 'Avg Pace', 'Avg HR', 'Longest', 'Compliance'].map(h => (
                              <th key={h} className="pb-3 pr-4 text-[10px] text-[var(--muted)] uppercase tracking-wide font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {athleteDetail.summaries.map(s => (
                            <tr key={s.id || s.week_start} className="border-t border-[var(--border)]/60 hover:bg-[var(--surface2)] transition-colors">
                              <td className="py-2.5 pr-4 text-[var(--muted)] text-xs">
                                {new Date(s.week_start + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </td>
                              <td className="py-2.5 pr-4 font-semibold text-[var(--text)]">{s.total_distance_miles.toFixed(1)}</td>
                              <td className="py-2.5 pr-4 text-[var(--text2)]">{s.run_count}</td>
                              <td className="py-2.5 pr-4 text-[var(--text2)]">{s.avg_pace_per_mile || '--'}</td>
                              <td className="py-2.5 pr-4 text-[var(--text2)]">{s.avg_heartrate || '--'}</td>
                              <td className="py-2.5 pr-4 text-[var(--text2)]">{s.longest_run_miles.toFixed(1)}</td>
                              <td className="py-2.5"><ComplianceBadge pct={s.compliance_pct} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {athleteDetail.races.length > 0 && (
                  <Card title="Race Results">
                    <div className="flex flex-col gap-2">
                      {athleteDetail.races.map((r: any) => (
                        <div key={r.id} className={`flex items-center justify-between p-3 rounded-xl border ${
                          r.is_pr ? 'bg-amber-950/20 border-amber-900/40 border-l-2 border-l-amber-500' : 'bg-[var(--surface2)] border-[var(--border)]'
                        }`}>
                          <div className="flex items-center gap-3">
                            {r.is_pr && <Badge label="PR" color="amber" />}
                            <div>
                              <div className="text-sm font-medium text-[var(--text)]">{r.race_name}</div>
                              <div className="text-xs text-[var(--muted)]">{r.distance} · {new Date(r.race_date + 'T00:00:00').toLocaleDateString()}</div>
                            </div>
                          </div>
                          <div className="text-sm font-bold text-brand-400 font-mono">{r.finish_time}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          /* Team Overview */
          <Card className="fade-up-1">
            {members.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  No active team members yet. Athletes need to sync activities for progress data to appear.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      {['Athlete', 'Weekly Miles', 'Compliance', 'Avg Pace', 'Status', ''].map((h, i) => (
                        <th key={i} className="pb-3 pr-4 text-[10px] text-[var(--muted)] uppercase tracking-wide font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => (
                      <tr
                        key={m.athlete.id}
                        className="border-t border-[var(--border)]/60 hover:bg-[var(--surface2)] cursor-pointer transition-colors"
                        onClick={() => viewAthlete(m.athlete.id)}
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[var(--surface2)] border border-[var(--border2)] flex items-center justify-center text-xs font-semibold text-brand-400 shrink-0">
                              {m.athlete.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-[var(--text)]">{m.athlete.name}</div>
                              {m.athlete.primary_events && (
                                <div className="text-xs text-[var(--muted)]">{m.athlete.primary_events}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 font-semibold text-[var(--text)]">
                          {m.latest_week ? `${m.latest_week.total_distance_miles.toFixed(1)}` : '--'}
                        </td>
                        <td className="py-3 pr-4">
                          <ComplianceBadge pct={m.latest_week?.compliance_pct ?? null} />
                        </td>
                        <td className="py-3 pr-4 text-[var(--text2)]">
                          {m.latest_week?.avg_pace_per_mile || '--'}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            label={m.member_status}
                            color={m.member_status === 'active' ? 'green' : m.member_status === 'injured' ? 'amber' : 'gray'}
                            dot
                          />
                        </td>
                        <td className="py-3 text-right">
                          <Button variant="ghost" size="sm">View →</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
