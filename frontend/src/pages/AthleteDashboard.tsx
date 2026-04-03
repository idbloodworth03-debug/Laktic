import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Card, Badge, Button, ReadinessRing, ProgressBar, Spinner, StatCard } from '../components/ui';
import { UserAvatar } from '../components/UserAvatar';
import { PaceZonesCard } from '../components/PaceZonesCard';
import { PhaseIndicator } from '../components/PhaseIndicator';
import { RacePredictionsCard } from '../components/RacePredictionsCard';
import { ArrowRight, ChevronRight, TrendingUp, TrendingDown, Minus, X } from 'lucide-react';

interface ReadinessSignals {
  atl: number;
  ctl: number;
  tsb: number;
  consecutiveTrainingDays: number;
  daysSinceLastRun: number;
  recentPaceDeviation: number | null;
  sleepHours: number | null;
  complianceRate: number;
}

interface ReadinessData {
  score: number;
  label: string;
  color: string;
  recommendation: string;
  signals: ReadinessSignals;
  needsMoreData?: boolean;
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
  comment_count: number;
  athlete_profiles: { name: string; avatar_url?: string | null } | null;
  coach_profiles: { name: string; avatar_url?: string | null } | null;
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

  // Profile completion banner
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    localStorage.getItem('laktic_profile_banner_dismissed') === 'true'
  );
  const dismissBanner = () => {
    localStorage.setItem('laktic_profile_banner_dismissed', 'true');
    setBannerDismissed(true);
  };

  const [readinessExpanded, setReadinessExpanded] = useState(false);

  // Readiness modal state
  const [showReadinessModal, setShowReadinessModal] = useState(false);
  const [readinessRating, setReadinessRating] = useState<number | null>(null);
  const [readinessNotes, setReadinessNotes] = useState('');
  const [savingReadiness, setSavingReadiness] = useState(false);
  const [readinessSuccess, setReadinessSuccess] = useState(false);
  const [readinessError, setReadinessError] = useState('');

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  // After Strava OAuth during onboarding, show MeetPace before the dashboard
  useEffect(() => {
    if (sessionStorage.getItem('laktic_post_strava')) {
      sessionStorage.removeItem('laktic_post_strava');
      nav('/signup/meet-pace', { replace: true });
    }
  }, []);

  useEffect(() => {
    Promise.allSettled([
      apiFetch('/api/athlete/readiness').then(d => setReadiness(d)).catch(() => {}),
      apiFetch('/api/athlete/season').then(d => {
        if (!d?.season) return; // no plan yet — dashboard shows empty state
        const s = d.season;
        setSeason({ current_week: s.current_week ?? 1, total_weeks: s.total_weeks ?? 16, phase: s.phase ?? 'base', compliance_pct: s.compliance_pct ?? 0 });
      }).catch(() => {}),
      apiFetch('/api/predictions').then(d => {
        const list: PredictionData[] = (d ?? []).map((p: any) => ({ distance: p.distance, predicted_time: p.predicted_time, trend: p.trend }));
        setPredictions(list);
      }).catch(() => {}),
      apiFetch('/api/athlete/races').then(d => {
        const upcoming = (d ?? []).filter((r: any) => new Date(r.race_date) > new Date()).slice(0, 3);
        setRaces(upcoming);
      }).catch(() => {}),
      apiFetch('/api/community/feed?page=1&sort=relevance').then(d => setFeed((d?.posts ?? []).slice(0, 3))).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // 30-second community preview refresh
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const d = await apiFetch('/api/community/feed?page=1&sort=relevance');
        setFeed((d?.posts ?? []).slice(0, 3));
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const submitReadiness = async () => {
    if (readinessRating === null) return;
    setSavingReadiness(true);
    setReadinessError('');
    try {
      // Map 1-10 overall feeling to mood/energy (1-5 scale)
      const factor = Math.ceil(readinessRating / 2);
      const payload = {
        mood: factor,
        energy: factor,
        notes: readinessNotes.trim() || null,
      };
      console.log('[readiness] sending payload:', JSON.stringify(payload));
      const data = await apiFetch('/api/recovery/readiness', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      console.log('[readiness] response:', JSON.stringify(data));
      // Guard: only update state if the response has the expected shape
      // Bust cache and refetch computed readiness
      apiFetch('/api/athlete/readiness?bust=1').then(d => setReadiness(d)).catch(() => {});
      setReadinessSuccess(true);
      setTimeout(() => {
        setShowReadinessModal(false);
        setReadinessSuccess(false);
        setReadinessRating(null);
        setReadinessNotes('');
        setReadinessError('');
      }, 1200);
    } catch (err: any) {
      console.error('[readiness submit error]', err);
      setReadinessError(err?.message || 'Failed to save readiness. Try again.');
    } finally {
      setSavingReadiness(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const readinessScore = readiness?.score ?? null;
  const selectedPred = predictions[selectedDist];

  const profileIncomplete = !bannerDismissed && (
    !profile?.pr_5k || !profile?.target_race_date || !(profile as any)?.current_weekly_mileage
  );

  const weeksToRace = races[0]?.race_date
    ? Math.max(0, Math.round((new Date(races[0].race_date).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)))
    : null;

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div className="p-6 md:p-8">
        {/* Header */}
        <div className="mb-8 fade-up">
          <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {(() => {
              const firstName = profile?.name?.split(' ')[0] ?? '';
              const tod = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';
              return firstName ? `Good ${tod}, ${firstName}.` : `Good ${tod}.`;
            })()}
          </h1>
        </div>

        {/* Profile completion banner */}
        {profileIncomplete && (
          <div className="mb-6 flex items-center gap-4 bg-[var(--color-bg-secondary)] border border-[var(--color-accent)]/20 rounded-card px-5 py-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] flex-shrink-0" />
            <p className="flex-1 text-sm text-[var(--color-text-secondary)]">
              Complete your profile to get more accurate pace zones and a better plan.{' '}
              <a href="/athlete/settings" className="text-[var(--color-accent)] font-medium hover:opacity-80 transition-opacity">Update profile →</a>
            </p>
            <button onClick={dismissBanner} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors p-1">
              <X size={14} />
            </button>
          </div>
        )}

        {/* 3-column grid */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.5fr)_minmax(0,3fr)_minmax(0,1.5fr)] gap-6">

          {/* ── LEFT COLUMN ── */}
          <div className="flex flex-col gap-5 fade-up-1">

            {/* Daily Readiness */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card" style={{ background: 'linear-gradient(135deg, var(--color-bg-secondary) 0%, rgba(0,229,160,0.04) 100%)' }}>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-4">Daily Readiness</p>
              <div className="flex items-center gap-6 mb-4">
                {readinessScore !== null ? (
                  <ReadinessRing score={readinessScore} size={96} />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[var(--color-bg-tertiary)] border-2 border-dashed border-[var(--color-border-light)] flex items-center justify-center">
                    <span className="font-mono text-2xl text-[var(--color-text-tertiary)]">--</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {readiness ? (
                    <>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
                        {readiness.label} Readiness
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
                        {readiness.recommendation}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-[var(--color-text-tertiary)]">Computing readiness...</p>
                  )}
                </div>
              </div>

              {/* Expandable signals */}
              {readiness?.signals && (
                <div className="border-t border-[var(--color-border)] pt-3">
                  <button
                    onClick={() => setReadinessExpanded(e => !e)}
                    className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                  >
                    <span>What affects this?</span>
                    <span>{readinessExpanded ? '▲' : '▼'}</span>
                  </button>
                  {readinessExpanded && (
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                      {[
                        { label: 'ATL (acute)', val: readiness.signals.atl },
                        { label: 'CTL (fitness)', val: readiness.signals.ctl },
                        { label: 'TSB (form)', val: readiness.signals.tsb },
                        { label: 'Compliance', val: `${readiness.signals.complianceRate}%` },
                        { label: 'Training streak', val: `${readiness.signals.consecutiveTrainingDays}d` },
                        { label: 'Last run', val: readiness.signals.daysSinceLastRun < 999 ? `${readiness.signals.daysSinceLastRun}d ago` : '—' },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex items-baseline justify-between">
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">{label}</span>
                          <span className="font-mono text-[11px] text-[var(--color-accent)]">{val}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Add feel button */}
              <div className="mt-3 flex justify-end">
                <button onClick={() => setShowReadinessModal(true)}
                  className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors"
                >
                  + Add today's feel
                </button>
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
                { label: 'Chat with Pace', href: '/athlete/chat', desc: 'Your AI running coach' },
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

            {/* Phase indicator */}
            {season && (
              <PhaseIndicator phase={season.phase} weeksToRace={weeksToRace} />
            )}

            {/* Race predictions */}
            <RacePredictionsCard />

            {/* Pace zones */}
            <PaceZonesCard />
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
                <UserAvatar url={(profile as any)?.avatar_url} name={profile?.name || ''} size="sm" />
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
                        <UserAvatar
                          url={post.athlete_profiles?.avatar_url ?? post.coach_profiles?.avatar_url ?? null}
                          name={post.athlete_profiles?.name ?? post.coach_profiles?.name ?? '?'}
                          size="sm"
                        />
                        <p className="text-[13px] font-medium text-[var(--color-text-primary)] leading-tight">
                          {post.athlete_profiles?.name ?? post.coach_profiles?.name ?? 'Unknown'}
                        </p>
                      </div>
                      <span className="text-[11px] text-[var(--color-text-tertiary)] shrink-0">{formatTime(post.created_at)}</span>
                    </div>
                    <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">{post.body}</p>
                    {(post.kudo_count > 0 || post.comment_count > 0) && (
                      <p className="text-[11px] text-[var(--color-text-tertiary)] mt-2">
                        {[
                          post.kudo_count > 0 ? `${post.kudo_count} kudos` : '',
                          post.comment_count > 0 ? `${post.comment_count} comments` : '',
                        ].filter(Boolean).join(' · ')}
                      </p>
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

      {/* ── Readiness Modal ── */}
      {showReadinessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setShowReadinessModal(false); }}>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">How are you feeling today?</h2>
              <button onClick={() => { setShowReadinessModal(false); setReadinessError(''); }} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-5">Rate your overall readiness on a 1–10 scale.</p>

            {/* 1-10 scale */}
            <div className="grid grid-cols-5 gap-2 mb-5">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button
                  key={n}
                  onClick={() => setReadinessRating(n)}
                  className={`h-10 rounded-pill text-sm font-semibold transition-all duration-150 ${readinessRating === n ? 'bg-[var(--color-accent)] text-black scale-105' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-light)]'}`}
                >{n}</button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-[var(--color-text-tertiary)] mb-5 px-1">
              <span>Very tired</span>
              <span>Feeling great</span>
            </div>

            {/* Notes */}
            <textarea
              value={readinessNotes}
              onChange={e => setReadinessNotes(e.target.value)}
              placeholder="Optional notes (soreness, sleep quality, stress...)"
              className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-card px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] resize-none focus:outline-none focus:border-[var(--color-accent)]/50 mb-4"
              rows={3}
            />

            {readinessError && (
              <p className="text-xs text-red-400 mb-3 text-center">{readinessError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowReadinessModal(false); setReadinessError(''); }}
                className="flex-1 py-2 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              >Cancel</button>
              <button
                onClick={submitReadiness}
                disabled={readinessRating === null || savingReadiness}
                className={`flex-1 py-2 rounded-pill text-sm font-semibold transition-all duration-150 ${readinessSuccess ? 'bg-[var(--color-accent)] text-black' : readinessRating === null ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] cursor-not-allowed' : 'bg-[var(--color-accent)] text-black hover:opacity-90'}`}
              >
                {savingReadiness ? 'Saving...' : readinessSuccess ? 'Saved!' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
