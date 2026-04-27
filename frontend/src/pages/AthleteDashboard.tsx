import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, ReadinessRing, ProgressBar, Spinner } from '../components/ui';
import { PaceZonesCard } from '../components/PaceZonesCard';
import { PhaseIndicator } from '../components/PhaseIndicator';
import { RacePredictionsCard } from '../components/RacePredictionsCard';
import { ArrowRight, ChevronRight, TrendingUp, TrendingDown, Minus, X, Play } from 'lucide-react';

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

// DB distance key → display label
const DIST_KEY_TO_LABEL: Record<string, string> = {
  '5K': '5K', '10K': '10K', 'half_marathon': 'Half', 'marathon': 'Full',
};

interface SeasonSummary {
  current_week: number;
  total_weeks: number;
  phase: string;
  compliance_pct: number;
}

const DISTANCES = ['5K', '10K', 'Half', 'Full'];

const PHASE_STYLE: Record<string, { color: string; bg: string }> = {
  base:       { color: 'rgba(255,255,255,0.5)',  bg: 'rgba(255,255,255,0.06)' },
  build:      { color: '#60a5fa',                bg: 'rgba(96,165,250,0.1)'   },
  sharpening: { color: '#a78bfa',                bg: 'rgba(167,139,250,0.1)'  },
  taper:      { color: '#F59E0B',                bg: 'rgba(245,158,11,0.1)'   },
  race:       { color: '#00E5A0',                bg: 'rgba(0,229,160,0.1)'    },
  recovery:   { color: 'rgba(255,255,255,0.5)',  bg: 'rgba(255,255,255,0.06)' },
};

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function Glass({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        background: 'rgba(255,255,255,0.035)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        transition: 'border-color 0.2s ease',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatTile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <Glass style={{ padding: '18px 20px' }}>
      <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8 }}>{label}</p>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 600, color: accent ? '#00E5A0' : '#fff', lineHeight: 1, marginBottom: 4 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>{sub}</p>}
    </Glass>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 14 }}>
      {children}
    </p>
  );
}

export function AthleteDashboard() {
  const nav = useNavigate();
  const { profile, clearAuth } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [season, setSeason] = useState<SeasonSummary | null>(null);
  const [predictions, setPredictions] = useState<Record<string, PredictionData>>({});
  const [races, setRaces] = useState<RaceEntry[]>([]);
  const [selectedDist, setSelectedDist] = useState(0);
  const [readinessExpanded, setReadinessExpanded] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    localStorage.getItem('laktic_profile_banner_dismissed') === 'true'
  );

  const [showReadinessModal, setShowReadinessModal] = useState(false);
  const [readinessRating, setReadinessRating] = useState<number | null>(null);
  const [readinessNotes, setReadinessNotes] = useState('');
  const [savingReadiness, setSavingReadiness] = useState(false);
  const [readinessSuccess, setReadinessSuccess] = useState(false);
  const [readinessError, setReadinessError] = useState('');

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

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
        if (!d?.season) return;
        const s = d.season;
        setSeason({ current_week: s.current_week ?? 1, total_weeks: s.total_weeks ?? 16, phase: s.phase ?? 'base', compliance_pct: s.compliance_pct ?? 0 });
        // Extract upcoming races from season's race_calendar (no dedicated /races endpoint)
        const cal: any[] = Array.isArray(s.race_calendar) ? s.race_calendar : [];
        setRaces(
          cal
            .filter((r: any) => r.date && new Date(r.date) > new Date())
            .slice(0, 3)
            .map((r: any, i: number) => ({ id: r.id ?? `${r.name}-${i}`, race_name: r.name, race_date: r.date, distance: r.distance || '' }))
        );
      }).catch(() => {}),
      apiFetch('/api/predictions/my').then(d => {
        const map: Record<string, PredictionData> = {};
        for (const p of d ?? []) {
          const label = DIST_KEY_TO_LABEL[p.distance] ?? p.distance;
          map[label] = {
            distance: label,
            predicted_time: p.predicted_time_formatted ?? '--',
            trend: p.trend === 'improving' ? 'up' : p.trend === 'declining' ? 'down' : 'flat',
          };
        }
        setPredictions(map);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const submitReadiness = async () => {
    if (readinessRating === null) return;
    setSavingReadiness(true);
    setReadinessError('');
    try {
      const factor = Math.ceil(readinessRating / 2);
      await apiFetch('/api/recovery/readiness', { method: 'POST', body: JSON.stringify({ mood: factor, energy: factor, notes: readinessNotes.trim() || null }) });
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
      setReadinessError(err?.message || 'Failed to save readiness. Try again.');
    } finally {
      setSavingReadiness(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const readinessScore = readiness?.score ?? null;
  const selectedPred = predictions[DISTANCES[selectedDist]];
  const weeksToRace = races[0]?.race_date
    ? Math.max(0, Math.round((new Date(races[0].race_date).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)))
    : null;
  const profileIncomplete = !bannerDismissed && (!profile?.pr_5k || !profile?.target_race_date || !(profile as any)?.current_weekly_mileage);

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div style={{ padding: 'clamp(24px, 3vw, 40px)', paddingBottom: 80 }}>

        {/* Header */}
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 style={{ fontSize: 'clamp(22px, 2.5vw, 30px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            {(() => {
              const firstName = profile?.name?.split(' ')[0] ?? '';
              const tod = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';
              return firstName ? `Good ${tod}, ${firstName}.` : `Good ${tod}.`;
            })()}
          </h1>
        </div>

        {/* Profile completion banner */}
        {profileIncomplete && (
          <div className="fade-up" style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 12 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5A0', flexShrink: 0, marginTop: 5 }} />
            <p style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55 }}>
              Complete your profile to get more accurate pace zones and a better plan.{' '}
              <a href="/athlete/settings" style={{ color: '#00E5A0', fontWeight: 600, textDecoration: 'none' }}>Update profile →</a>
            </p>
            <button onClick={() => { localStorage.setItem('laktic_profile_banner_dismissed', 'true'); setBannerDismissed(true); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 2, lineHeight: 1 }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Stat strip */}
        <div className="fade-up-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
          {season && <StatTile label="Season Progress" value={`Wk ${season.current_week}/${season.total_weeks}`} sub={`${Math.round((season.current_week / season.total_weeks) * 100)}% complete`} />}
          {season && <StatTile label="Compliance" value={`${season.compliance_pct ?? '--'}%`} sub="This plan" accent />}
          {races[0] && <StatTile label="Next Race" value={`${daysUntil(races[0].race_date)}d`} sub={races[0].race_name} />}
          {predictions['5K'] && <StatTile label="Predicted 5K" value={predictions['5K'].predicted_time} sub="Current fitness" />}
        </div>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.5fr)', gap: 16, alignItems: 'start' }}
          className="fade-up-2 lk-dash-grid">

          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Readiness */}
            <Glass style={{ padding: '20px 22px', background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(0,229,160,0.04) 100%)' }}>
              <SectionLabel>Daily Readiness</SectionLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
                {readinessScore !== null ? (
                  <ReadinessRing score={readinessScore} size={88} />
                ) : (
                  <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 22, color: 'rgba(255,255,255,0.25)' }}>--</span>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  {readiness ? (
                    <>
                      <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>{readiness.label} Readiness</p>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', lineHeight: 1.65 }}>{readiness.recommendation}</p>
                    </>
                  ) : (
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Computing readiness...</p>
                  )}
                  <button onClick={() => setShowReadinessModal(true)}
                    style={{ marginTop: 10, fontSize: 11, color: '#00E5A0', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 600 }}>
                    + Add today's feel
                  </button>
                </div>
              </div>

              {readiness?.signals && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
                  <button onClick={() => setReadinessExpanded(e => !e)}
                    style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                    What affects this? <span>{readinessExpanded ? '▲' : '▼'}</span>
                  </button>
                  {readinessExpanded && (
                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                      {[
                        { label: 'ATL (acute)',   val: readiness.signals.atl },
                        { label: 'CTL (fitness)', val: readiness.signals.ctl },
                        { label: 'TSB (form)',    val: readiness.signals.tsb },
                        { label: 'Compliance',   val: `${readiness.signals.complianceRate}%` },
                        { label: 'Streak',       val: `${readiness.signals.consecutiveTrainingDays}d` },
                        { label: 'Last run',     val: readiness.signals.daysSinceLastRun < 999 ? `${readiness.signals.daysSinceLastRun}d ago` : '—' },
                      ].map(({ label, val }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{label}</span>
                          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: '#00E5A0' }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Glass>

            {/* Active Plan */}
            {season ? (
              <Glass style={{ padding: '20px 22px' }}>
                <SectionLabel>Active Plan</SectionLabel>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Week {season.current_week} of {season.total_weeks}</p>
                    <span style={{
                      display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, textTransform: 'capitalize',
                      color: PHASE_STYLE[season.phase]?.color ?? '#fff',
                      background: PHASE_STYLE[season.phase]?.bg ?? 'rgba(255,255,255,0.06)',
                    }}>{season.phase} phase</span>
                  </div>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: '#00E5A0' }}>
                    {Math.round((season.current_week / season.total_weeks) * 100)}%
                  </span>
                </div>
                <ProgressBar value={season.current_week} max={season.total_weeks} className="mb-4" />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    Compliance: <span style={{ fontFamily: "'DM Mono',monospace", color: '#fff' }}>{season.compliance_pct ?? '--'}%</span>
                  </span>
                  <Link to="/athlete/plan" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#00E5A0', fontWeight: 600, textDecoration: 'none' }}>
                    View plan <ChevronRight size={12} />
                  </Link>
                </div>
              </Glass>
            ) : (
              <Glass style={{ padding: '20px 22px' }}>
                <SectionLabel>Active Plan</SectionLabel>
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No plan yet</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', marginBottom: 14 }}>Chat with Pace to build your personalized training plan.</p>
                  <Link to="/athlete/chat">
                    <button style={{ padding: '8px 20px', background: '#00E5A0', color: '#000', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, borderRadius: 100, border: 'none', cursor: 'pointer' }}>
                      Get my plan
                    </button>
                  </Link>
                </div>
              </Glass>
            )}

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Log Activity',   href: '/athlete/activities', desc: 'Record workout' },
                { label: 'Race Calendar',  href: '/athlete/races',      desc: 'Events & goals' },
                { label: 'Analytics',      href: '/athlete/analytics',  desc: 'Training load'  },
                { label: 'Chat with Pace', href: '/athlete/chat',       desc: 'Ask anything'   },
              ].map(l => (
                <a key={l.href} href={l.href} style={{ textDecoration: 'none' }}>
                  <Glass style={{ padding: '14px 16px', cursor: 'pointer' }} className="glass-hover">
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{l.label}</p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{l.desc}</p>
                  </Glass>
                </a>
              ))}
            </div>

            {season && <PhaseIndicator phase={season.phase} weeksToRace={weeksToRace} />}
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Performance predictions */}
            {Object.keys(predictions).length > 0 && (
              <Glass style={{ padding: '20px 22px' }}>
                <SectionLabel>Performance</SectionLabel>
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  {DISTANCES.map((d, i) => (
                    <button key={d} onClick={() => setSelectedDist(i)} style={{
                      flex: 1, padding: '6px 0', borderRadius: 100, fontSize: 11, fontWeight: 700,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease',
                      background: selectedDist === i ? '#00E5A0' : 'rgba(255,255,255,0.06)',
                      color: selectedDist === i ? '#000' : 'rgba(255,255,255,0.45)',
                    }}>{d}</button>
                  ))}
                </div>
                {selectedPred ? (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 34, fontWeight: 600, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 6 }}>{selectedPred.predicted_time}</p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>predicted {DISTANCES[selectedDist]}</p>
                    {selectedPred.trend && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                        background: selectedPred.trend === 'up' ? 'rgba(0,229,160,0.1)' : selectedPred.trend === 'down' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)',
                        color: selectedPred.trend === 'up' ? '#00E5A0' : selectedPred.trend === 'down' ? '#ef4444' : 'rgba(255,255,255,0.45)' }}>
                        {selectedPred.trend === 'up' ? <TrendingUp size={12} /> : selectedPred.trend === 'down' ? <TrendingDown size={12} /> : <Minus size={12} />}
                        {selectedPred.trend === 'up' ? 'Improving' : selectedPred.trend === 'down' ? 'Declining' : 'Stable'}
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.28)', padding: '12px 0' }}>No prediction yet</p>
                )}
                <Link to="/athlete/progress" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: '#00E5A0', fontWeight: 600, textDecoration: 'none', marginTop: 16 }}>
                  Full analytics <ArrowRight size={11} />
                </Link>
              </Glass>
            )}

            {/* Upcoming races */}
            {races.length > 0 && (
              <Glass style={{ padding: '20px 22px' }}>
                <SectionLabel>Upcoming Races</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {races.map((race, i) => {
                    const days = daysUntil(race.race_date);
                    return (
                      <div key={race.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: i < races.length - 1 ? 12 : 0, borderBottom: i < races.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{race.race_name}</p>
                          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{race.distance}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 22, fontWeight: 700, color: '#00E5A0', lineHeight: 1 }}>{days}</p>
                          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>days away</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Link to="/athlete/races" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: '#00E5A0', fontWeight: 600, textDecoration: 'none', marginTop: 16 }}>
                  All races <ArrowRight size={11} />
                </Link>
              </Glass>
            )}

            <RacePredictionsCard />
            <PaceZonesCard />

            {/* Analytics link */}
            <Link to="/athlete/analytics" style={{ textDecoration: 'none' }}>
              <Glass style={{ padding: '18px 20px', cursor: 'pointer' }} className="glass-hover">
                <SectionLabel>Training Load</SectionLabel>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 12, lineHeight: 1.6 }}>
                  View ATL · CTL · TSB trends and weekly volume charts.
                </p>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#00E5A0', fontWeight: 600 }}>
                  Open analytics <ArrowRight size={11} />
                </span>
              </Glass>
            </Link>
          </div>
        </div>
      </div>

      {/* Readiness Modal */}
      {showReadinessModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowReadinessModal(false); }}>
          <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 380, boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>How are you feeling?</h2>
              <button onClick={() => { setShowReadinessModal(false); setReadinessError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>Rate your readiness on a 1–10 scale.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 8 }}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => setReadinessRating(n)} style={{
                  height: 40, borderRadius: 100, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  background: readinessRating === n ? '#00E5A0' : 'rgba(255,255,255,0.06)',
                  color: readinessRating === n ? '#000' : 'rgba(255,255,255,0.55)',
                  transform: readinessRating === n ? 'scale(1.08)' : 'none',
                }}>{n}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 20, padding: '0 4px' }}>
              <span>Very tired</span><span>Feeling great</span>
            </div>

            <textarea value={readinessNotes} onChange={e => setReadinessNotes(e.target.value)}
              placeholder="Optional notes (soreness, sleep, stress...)"
              rows={3} style={{
                width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#fff', fontFamily: 'inherit',
                resize: 'none', outline: 'none', marginBottom: 16,
              }} />

            {readinessError && <p style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', marginBottom: 12 }}>{readinessError}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowReadinessModal(false); setReadinessError(''); }}
                style={{ flex: 1, padding: '10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.35)', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={submitReadiness} disabled={readinessRating === null || savingReadiness} style={{
                flex: 1, padding: '10px', borderRadius: 100, fontSize: 13, fontWeight: 700, border: 'none',
                cursor: readinessRating === null ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                background: readinessSuccess ? '#00E5A0' : readinessRating === null ? 'rgba(255,255,255,0.06)' : '#00E5A0',
                color: readinessRating === null ? 'rgba(255,255,255,0.3)' : '#000',
                opacity: savingReadiness ? 0.7 : 1,
              }}>
                {savingReadiness ? 'Saving...' : readinessSuccess ? 'Saved ✓' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Track Run — mobile CTA */}
      <div className="md:hidden" style={{ position: 'fixed', left: 16, right: 16, bottom: 76, zIndex: 30 }}>
        <button onClick={() => nav('/athlete/track')} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '16px', borderRadius: 100, background: '#00E5A0', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontWeight: 700, fontSize: 15, color: '#000',
          boxShadow: '0 4px 24px rgba(0,229,160,0.35)',
        }}>
          <Play size={16} fill="black" />
          Track Run
        </button>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .lk-dash-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppLayout>
  );
}
