import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Card, Badge, Button, ReadinessRing, ProgressBar, Spinner, StatCard } from '../components/ui';
import { ArrowRight, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ReadinessData {
  score: number;
  label: string;
  recommended_intensity: string;
  explanation: string;
  logged: boolean;
}

interface WorkoutDay {
  day: string;
  title: string;
  phase: string;
  distance_miles?: number;
  description?: string;
}

interface PredictionData {
  distance: string;
  predicted_time: string;
  trend?: 'up' | 'down' | 'flat';
}

interface RaceEntry {
  id: string;
  race_name: string;
  race_date: string;
  distance: string;
}

interface CommunityPost {
  id: string;
  body: string;
  created_at: string;
  kudo_count: number;
  athlete_profiles: { name: string } | null;
  coach_profiles: { name: string } | null;
}

interface SeasonSummary {
  current_week: number;
  total_weeks: number;
  phase: string;
  compliance_pct: number;
}

const DISTANCES = ['5K', '10K', 'Half', 'Full'];

const PHASE_COLOR: Record<string, string> = {
  base: 'text-[var(--color-text-tertiary)]',
  build: 'text-blue-400',
  sharpening: 'text-purple-400',
  taper: 'text-amber-400',
  race: 'text-[var(--color-accent)]',
  recovery: 'text-[var(--color-text-tertiary)]',
};

function daysUntil(dateStr: string) {
  const d = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  return d;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function AthleteDashboard() {
  const nav = useNavigate();
  const { profile, clearAuth } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [season, setSeason] = useState<SeasonSummary | null>(null);
  const [todayWorkouts, setTodayWorkouts] = useState<WorkoutDay[]>([]);
  const [predictions, setPredictions] = useState<PredictionData[]>([]);
  const [races, setRaces] = useState<RaceEntry[]>([]);
  const [feed, setFeed] = useState<CommunityPost[]>([]);
  const [selectedDist, setSelectedDist] = useState(0);

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    Promise.allSettled([
      apiFetch('/api/recovery/today').then(d => setReadiness(d)).catch(() => {}),
      apiFetch('/api/athlete/season').then(d => {
        if (!d?.season) { nav('/athlete/browse', { replace: true }); return; }
        const s = d.season;
        setSeason({ current_week: s.current_week ?? 1, total_weeks: s.total_weeks ?? 16, phase: s.phase ?? 'base', compliance_pct: s.compliance_pct ?? 0 });
      }).catch(() => nav('/athlete/browse', { replace: true })),
      apiFetch('/api/predictions').then(d => {
        const list: PredictionData[] = (d ?? []).map((p: any) => ({ distance: p.distance, predicted_time: p.predicted_time, trend: p.trend }));
        setPredictions(list);
      }).catch(() => {}),
      apiFetch('/api/athlete/races').then(d => {
        const upcoming = (d ?? []).filter((r: any) => new Date(r.race_date) > new Date()).slice(0, 3);
        setRaces(upcoming);
      }).catch(() => {}),
      apiFetch('/api/community/feed?page=1').then(d => setFeed((d?.posts ?? []).slice(0, 5))).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const readinessScore = readiness?.logged ? readiness.score : null;
  const selectedPred = predictions[selectedDist];

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div className="p-6 md:p-8">
        {/* Header */}
        <div className="mb-8 fade-up">
          <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {profile?.name?.split(' ')[0]}.
          </h1>
        </div>

        {/* 3-column grid */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.5fr)_minmax(0,3fr)_minmax(0,1.5fr)] gap-6">

          {/* ── LEFT COLUMN ── */}
          <div className="flex flex-col gap-5 fade-up-1">

            {/* Daily Readiness */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card" style={{ background: 'linear-gradient(135deg, var(--color-bg-secondary) 0%, rgba(0,229,160,0.04) 100%)' }}>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-4">Daily Readiness</p>
              <div className="flex items-center gap-6">
                {readinessScore !== null ? (
                  <ReadinessRing score={readinessScore} size={96} />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-24 h-24 rounded-full bg-[var(--color-bg-tertiary)] border-2 border-dashed border-[var(--color-border-light)] flex items-center justify-center">
                      <span className="font-mono text-2xl text-[var(--color-text-tertiary)]">--</span>
                    </div>
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">Not logged</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {readiness?.logged ? (
                    <>
                      <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
                        {readiness.recommended_intensity === 'rest' ? 'Rest day' : `${readiness.recommended_intensity.charAt(0).toUpperCase() + readiness.recommended_intensity.slice(1)} effort`}
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">{readiness.explanation}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">Log your readiness</p>
                      <p className="text-xs text-[var(--color-text-tertiary)] mb-3">Tell us how you feel to get a personalized intensity recommendation.</p>
                      <Link to="/athlete/dashboard">
                        <Button variant="primary" size="sm">Log Readiness</Button>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Season progress */}
            {season && (
              <Card title="Active Plan">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">Week {season.current_week} of {season.total_weeks}</p>
                    <p className={`text-xs font-medium capitalize mt-0.5 ${PHASE_COLOR[season.phase] || 'text-[var(--color-text-tertiary)]'}`}>{season.phase} phase</p>
                  </div>
                  <span className="font-mono text-[var(--color-accent)] text-sm">{Math.round((season.current_week / season.total_weeks) * 100)}%</span>
                </div>
                <ProgressBar value={season.current_week} max={season.total_weeks} className="mb-4" />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Compliance: <span className="font-mono text-[var(--color-text-primary)]">{season.compliance_pct ?? '--'}%</span>
                  </p>
                  <Link to="/athlete/plan" className="flex items-center gap-1 text-xs text-[var(--color-accent)] font-medium hover:opacity-80 transition-opacity">
                    View plan <ChevronRight size={12} />
                  </Link>
                </div>
              </Card>
            )}

            {/* Quick links */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Chat with Bot', href: '/athlete/chat', desc: 'Ask anything' },
                { label: 'Log Activity',  href: '/athlete/activities', desc: 'Record workout' },
                { label: 'Race Calendar', href: '/athlete/races', desc: 'Events & goals' },
                { label: 'Nutrition',     href: '/athlete/nutrition', desc: 'Track intake' },
              ].map(l => (
                <a key={l.href} href={l.href}
                  className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-light)] rounded-card p-4 transition-all duration-150 hover:-translate-y-px group"
                >
                  <p className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors">{l.label}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{l.desc}</p>
                </a>
              ))}
            </div>
          </div>

          {/* ── CENTER COLUMN — Community Feed ── */}
          <div className="flex flex-col gap-5 fade-up-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Community</p>
              <Link to="/community">
                <Button variant="ghost" size="sm">See all <ChevronRight size={12} /></Button>
              </Link>
            </div>

            {/* Create post bar */}
            <Link to="/community">
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card px-4 py-3 flex items-center gap-3 hover:border-[var(--color-border-light)] transition-all duration-150 cursor-pointer group">
                <div className="w-7 h-7 rounded-full bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/20 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-semibold text-[var(--color-accent)]">{profile?.name?.charAt(0)}</span>
                </div>
                <span className="text-sm text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)] transition-colors">Share a workout, race result, or update...</span>
              </div>
            </Link>

            {/* Feed posts */}
            {feed.length === 0 ? (
              <Card>
                <p className="text-center text-[var(--color-text-tertiary)] text-sm py-8">No community posts yet. Be the first to share!</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {feed.map(post => (
                  <div key={post.id} className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-4 hover:border-[var(--color-border-light)] transition-all duration-150">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-semibold text-[var(--color-text-secondary)]">
                            {(post.athlete_profiles?.name ?? post.coach_profiles?.name ?? '?').charAt(0)}
                          </span>
                        </div>
                        <p className="text-[13px] font-medium text-[var(--color-text-primary)] leading-tight">
                          {post.athlete_profiles?.name ?? post.coach_profiles?.name ?? 'Unknown'}
                        </p>
                      </div>
                      <span className="text-[11px] text-[var(--color-text-tertiary)] shrink-0">{formatTime(post.created_at)}</span>
                    </div>
                    <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">{post.body}</p>
                    {post.kudo_count > 0 && (
                      <p className="text-[11px] text-[var(--color-text-tertiary)] mt-2">{post.kudo_count} kudos</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="flex flex-col gap-5 fade-up-3">

            {/* Performance Predictions */}
            {predictions.length > 0 && (
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card">
                <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-4">Performance</p>
                <div className="flex gap-1.5 mb-4">
                  {DISTANCES.map((d, i) => (
                    <button key={d} onClick={() => setSelectedDist(i)}
                      className={`flex-1 py-1.5 rounded-pill text-[11px] font-semibold transition-all duration-150 ${selectedDist === i ? 'bg-[var(--color-accent)] text-black' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}
                    >{d}</button>
                  ))}
                </div>
                {selectedPred ? (
                  <div className="text-center">
                    <p className="font-mono text-3xl font-medium text-[var(--color-text-primary)] leading-none mb-1">{selectedPred.predicted_time}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mb-2">predicted {DISTANCES[selectedDist]}</p>
                    {selectedPred.trend && (
                      <div className={`inline-flex items-center gap-1 text-xs font-medium ${selectedPred.trend === 'up' ? 'text-[var(--color-accent)]' : selectedPred.trend === 'down' ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-tertiary)]'}`}>
                        {selectedPred.trend === 'up' ? <TrendingUp size={12} /> : selectedPred.trend === 'down' ? <TrendingDown size={12} /> : <Minus size={12} />}
                        {selectedPred.trend === 'up' ? 'Improving' : selectedPred.trend === 'down' ? 'Declining' : 'Stable'}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-xs text-[var(--color-text-tertiary)] py-2">No prediction yet</p>
                )}
                <Link to="/athlete/progress" className="flex items-center justify-center gap-1 text-xs text-[var(--color-accent)] font-medium mt-4 hover:opacity-80">
                  Full analytics <ArrowRight size={11} />
                </Link>
              </div>
            )}

            {/* Upcoming Races */}
            {races.length > 0 && (
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card">
                <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-4">Upcoming Races</p>
                <div className="flex flex-col gap-3">
                  {races.map(race => {
                    const days = daysUntil(race.race_date);
                    return (
                      <div key={race.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{race.race_name}</p>
                          <p className="text-[11px] text-[var(--color-text-tertiary)]">{race.distance}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm font-medium text-[var(--color-accent)]">{days}d</p>
                          <p className="text-[10px] text-[var(--color-text-tertiary)]">away</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Link to="/athlete/races" className="flex items-center justify-center gap-1 text-xs text-[var(--color-accent)] font-medium mt-4 hover:opacity-80">
                  All races <ArrowRight size={11} />
                </Link>
              </div>
            )}

            {/* Analytics snippet */}
            <Link to="/athlete/analytics">
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card hover:border-[var(--color-border-light)] hover:-translate-y-px transition-all duration-150 group">
                <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Training Load</p>
                <p className="text-sm text-[var(--color-text-secondary)] mb-3">View ATL · CTL · TSB trends and weekly volume charts.</p>
                <div className="flex items-center gap-1 text-xs text-[var(--color-accent)] font-medium group-hover:gap-2 transition-all">
                  Open analytics <ArrowRight size={11} />
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
