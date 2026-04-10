import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { apiFetch } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import {
  classifyAthleteTier, derivePaceBands, deriveEventPaces,
  type AthleteTier, type PaceBands, type EventPaces,
} from '../../utils/paceCalculator';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingData {
  name: string;
  age: string;
  gender: string;
  experience: string;
  runnerTypes: string[];      // multi-select
  distances: string[];
  seasonStatus: string;
  trainingDays: number | null;
  weeklyMileage: string;
  fitnessRating: number;
  pr800m: string;
  pr1500m: string;
  prMile: string;
  pr5k: string;
  pr10k: string;
  prHalf: string;
  prMarathon: string;
  heightFt: string;
  heightIn: string;
  weight: string;
  sleep: string;
  hasInjuries: boolean | null;
  injuryNotes: string;
  hasGoalRace: boolean | null;
  raceName: string;
  raceDate: string;
  raceDistance: string;
  goalTime: string;
  seasonStartDate: string;
  seasonEndDate: string;
  biggestChallenges: string[]; // multi-select
  planType: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const EMPTY: OnboardingData = {
  name: '', age: '', gender: '',
  experience: '',
  runnerTypes: [],
  distances: [],
  seasonStatus: '',
  trainingDays: null, weeklyMileage: '',
  fitnessRating: 5,
  pr800m: '', pr1500m: '', prMile: '', pr5k: '', pr10k: '', prHalf: '', prMarathon: '',
  heightFt: '', heightIn: '', weight: '', sleep: '',
  hasInjuries: null, injuryNotes: '',
  hasGoalRace: null, raceName: '', raceDate: '', raceDistance: '', goalTime: '',
  seasonStartDate: '', seasonEndDate: '',
  biggestChallenges: [],
  planType: '',
  email: '', password: '', confirmPassword: '',
};

const TOTAL_STEPS = 16;

// ── Plan selection helpers ────────────────────────────────────────────────────

interface PlanCardPreviewRow { day: string; workout: string; pace?: string; }
interface PlanCardConfig {
  value: string;
  label: string;
  desc: string;
  preview: PlanCardPreviewRow[];
  phase: string;
  phaseColor: string;
}

function buildPlanCards(
  tier: AthleteTier,
  raceDate: string,
  bands: PaceBands,
  events: EventPaces,
): PlanCardConfig[] {
  const weeksToRace = raceDate
    ? (new Date(raceDate + 'T00:00:00Z').getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
    : null;

  if (tier === 'advanced') {
    return [
      {
        value: 'base_phase',
        label: 'Base Phase',
        desc: 'Full coach param system, base phase. Aerobic foundation with structured bridge work.',
        preview: [
          { day: 'Mon', workout: 'Progressive tempo', pace: bands.needs_aerobic_pr ? undefined : bands.LT1 },
          { day: 'Thu', workout: '60-sec hills' },
          { day: 'Sat', workout: 'Long run · Easy' },
        ],
        phase: 'Base',
        phaseColor: '#00E5A0',
      },
      {
        value: 'pre_competition',
        label: 'Pre-Competition',
        desc: 'Trim aerobic volume, add rhythm. Mile-pace 300s, threshold combos, event sharpening.',
        preview: [
          { day: 'Mon', workout: 'Tempo + 400s at 3K', pace: bands.needs_aerobic_pr ? undefined : bands.LT2 },
          { day: 'Thu', workout: 'Mile-pace 300s', pace: events.mile_pace ?? undefined },
          { day: 'Sat', workout: 'Long run · Easy' },
        ],
        phase: 'Pre-Competition',
        phaseColor: '#f59e0b',
      },
      {
        value: 'competition_sharp',
        label: 'Competition Sharp',
        desc: 'Race feel, goal pace work, low cost high quality. Peak sharpness for race day.',
        preview: [
          { day: 'Mon', workout: '800-600 sets + 150s' },
          { day: 'Thu', workout: 'Goal pace tune-up', pace: events.pace_1500 ?? events.mile_pace ?? undefined },
          { day: 'Sat', workout: 'Long run · Easy' },
        ],
        phase: 'Competition',
        phaseColor: '#00E5A0',
      },
    ];
  }

  // intermediate
  return [
    {
      value: 'aerobic_foundation',
      label: 'Aerobic Foundation',
      desc: 'Build your aerobic engine. Tempo runs, threshold work, long runs. No event-specific work yet.',
      preview: [
        { day: 'Mon', workout: 'Tempo run', pace: bands.needs_aerobic_pr ? undefined : bands.LT2 },
        { day: 'Thu', workout: 'Threshold 1000s' },
        { day: 'Sat', workout: 'Long run · Easy' },
      ],
      phase: 'Base',
      phaseColor: '#00E5A0',
    },
    {
      value: 'race_development',
      label: 'Race Development',
      desc: 'Event-specific sharpening alongside aerobic work. Mile-pace reps, tempo, race rhythm.',
      preview: [
        { day: 'Mon', workout: 'Progressive tempo' },
        { day: 'Thu', workout: 'Mile-pace 300s', pace: events.mile_pace ?? undefined },
        { day: 'Sat', workout: 'Long run · Easy' },
      ],
      phase: 'Pre-Competition',
      phaseColor: '#f59e0b',
    },
    {
      value: 'balanced_build',
      label: 'Balanced Build',
      desc: 'A mix of aerobic base and event rhythm. Good if you want variety without specializing yet.',
      preview: [
        { day: 'Mon', workout: 'Threshold 1000s' },
        { day: 'Thu', workout: 'Base 400s at 5K pace' },
        { day: 'Sat', workout: 'Long run · Easy' },
      ],
      phase: 'Base',
      phaseColor: '#00E5A0',
    },
  ];
}

// ── Shared components ─────────────────────────────────────────────────────────

function Pill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '11px 20px',
        borderRadius: '100px',
        border: selected ? '2px solid #00E5A0' : '2px solid rgba(255,255,255,0.12)',
        background: selected ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.03)',
        color: selected ? '#00E5A0' : 'rgba(255,255,255,0.65)',
        fontSize: '15px',
        fontWeight: selected ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontFamily: "'DM Sans', sans-serif",
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
          e.currentTarget.style.color = 'white';
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
        }
      }}
    >{label}</button>
  );
}

function OptionCard({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        padding: '16px 20px',
        borderRadius: '12px',
        border: selected ? '2px solid #00E5A0' : '2px solid rgba(255,255,255,0.1)',
        background: selected ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.03)',
        color: selected ? '#00E5A0' : 'rgba(255,255,255,0.75)',
        fontSize: '16px',
        fontWeight: selected ? 600 : 400,
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >{label}</button>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '10px',
  color: 'white',
  fontSize: '16px',
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
  transition: 'border-color 0.2s',
};

function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ ...INPUT_STYLE, ...props.style }}
      onFocus={e => { e.currentTarget.style.borderColor = '#00E5A0'; }}
      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
    />
  );
}

function StyledTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: '120px', ...props.style }}
      onFocus={e => { e.currentTarget.style.borderColor = '#00E5A0'; }}
      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
    />
  );
}

function HelperText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '8px' }}>{children}</p>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </label>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>Step {current} of {total}</span>
        <span style={{ fontSize: '13px', color: '#00E5A0', fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '100px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#00E5A0', borderRadius: '100px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function Shell({
  step, children, onBack, onNext,
  nextLabel = 'Continue', nextDisabled = false, nextLoading = false,
  onSkip, skipLabel = 'Skip for now',
}: {
  step: number;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', fontFamily: "'DM Sans', sans-serif", color: 'white', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,229,160,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,160,1) 1px, transparent 1px)', backgroundSize: '54px 54px', opacity: 0.025 }} />
      <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,229,160,0.06) 0%, transparent 68%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '560px', margin: '0 auto', padding: 'clamp(24px, 4vw, 48px) 24px' }}>
        {/* Top nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          {onBack ? (
            <button type="button" onClick={onBack}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '7px 14px', color: 'rgba(255,255,255,0.5)', fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'DM Sans', sans-serif" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
            >← Back</button>
          ) : (
            <Link to="/" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '17px', color: '#00E5A0', textDecoration: 'none' }}>Laktic</Link>
          )}
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>{step <= TOTAL_STEPS ? `Step ${step} of ${TOTAL_STEPS}` : ''}</span>
        </div>

        <ProgressBar current={Math.min(step, TOTAL_STEPS)} total={TOTAL_STEPS} />

        <div style={{ marginTop: '40px' }}>{children}</div>

        <div style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button type="button" onClick={onNext} disabled={nextDisabled || nextLoading}
            style={{
              width: '100%', padding: '15px',
              background: nextDisabled ? 'rgba(0,229,160,0.3)' : '#00E5A0',
              color: nextDisabled ? 'rgba(0,0,0,0.4)' : '#000',
              border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 700,
              cursor: nextDisabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={e => { if (!nextDisabled) e.currentTarget.style.background = '#00cc8f'; }}
            onMouseLeave={e => { if (!nextDisabled) e.currentTarget.style.background = '#00E5A0'; }}
          >
            {nextLoading ? 'Creating your account…' : nextLabel}
          </button>
          {onSkip && (
            <button type="button" onClick={onSkip}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '14px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", padding: '4px', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
            >{skipLabel}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 15 — Meet Pace splash ────────────────────────────────────────────────

export function MeetPaceSplash() {
  const nav = useNavigate();
  useEffect(() => {
    // Clear confirmation gate and mark onboarding complete
    localStorage.removeItem('laktic_awaiting_confirmation');
    apiFetch('/api/athlete/profile', { method: 'PATCH', body: JSON.stringify({ onboarding_completed: true }) }).catch(() => {});

    // Trigger plan generation — wait up to 25s then redirect regardless
    const redirectTimer = setTimeout(() => nav('/athlete/dashboard', { replace: true }), 25000);

    (async () => {
      // Force a session refresh so the token is valid even if we just came from email confirmation
      const { data: { session } } = await supabase.auth.refreshSession();
      console.log('[MeetPace] session after refresh:', session ? 'ok' : 'null');
      console.log('[MeetPace] calling plan generation...');
      try {
        const storedPlanType = sessionStorage.getItem('laktic_plan_type');
        sessionStorage.removeItem('laktic_plan_type');
        await apiFetch('/api/athlete/season/generate', {
          method: 'POST',
          body: storedPlanType ? JSON.stringify({ plan_type: storedPlanType }) : undefined,
        });
        console.log('[MeetPace] plan generation succeeded');
      } catch (e: any) {
        console.error('[MeetPace] plan generation error:', e?.message);
        // "Season already exists" is fine — continue to dashboard
      }
      clearTimeout(redirectTimer);
      nav('/athlete/dashboard', { replace: true });
    })();

    return () => clearTimeout(redirectTimer);
  }, [nav]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", color: 'white', textAlign: 'center', padding: '24px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,229,160,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,160,1) 1px, transparent 1px)', backgroundSize: '54px 54px', opacity: 0.03 }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '700px', height: '700px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,229,160,0.08) 0%, transparent 68%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: '#00E5A0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px', fontSize: '32px', fontWeight: 800, color: '#000' }}>P</div>
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '16px' }}>
          Meet <span style={{ color: '#00E5A0' }}>Pace.</span>
        </h1>
        <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.55)', marginBottom: '8px', maxWidth: '400px' }}>Your personal running coach. Built around you.</p>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.28)', marginBottom: '40px' }}>Generating your personalized training plan...</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00E5A0', animation: `lk-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
          ))}
        </div>
      </div>
      <style>{`@keyframes lk-dot { 0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }`}</style>
    </div>
  );
}

// ── Strava connect step (post email-confirmation) ─────────────────────────────

export function StravaConnectStep() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const profile = useAuthStore(s => s.profile);
  const setAuth = useAuthStore(s => s.setAuth);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState(
    searchParams.get('strava_error') ? 'Strava connection failed. Please try again or skip for now.' : ''
  );
  // Guard against double-initiation from re-renders or StrictMode double-effect
  const initiatedRef = useRef(false);

  // Load profile + apply onboarding patch when arriving from email confirmation
  // (advance() in EmailConfirmationPending sets minimal auth with no profile)
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSessionReady(true); return; }

      let currentProfile = profile;
      if (!currentProfile) {
        try {
          const me = await apiFetch('/api/me');
          setAuth(session, me.role, me.profile);
          currentProfile = me.profile;
        } catch {
          // Profile doesn't exist yet — will be auto-created by requireAthlete middleware
        }
      }

      // Apply full onboarding patch saved before email redirect (same-tab sessionStorage)
      const savedStr = sessionStorage.getItem('laktic_onboarding');
      const saved = savedStr ? JSON.parse(savedStr) : null;
      if (saved?.patch) {
        try {
          await apiFetch('/api/athlete/profile', {
            method: 'PATCH',
            body: JSON.stringify(saved.patch),
          });
        } catch {}
        sessionStorage.removeItem('laktic_onboarding');
      }

      setSessionReady(true);
    })();
  }, []);

  const connectStrava = async () => {
    if (initiatedRef.current) return;

    // Get a fresh session at click time — never rely on store state
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data: refreshData } = await supabase.auth.refreshSession();
      session = refreshData.session;
    }
    if (!session) {
      setError('Session expired — please sign in again.');
      return;
    }

    // Use profile from store if loaded; otherwise fetch it now
    let athleteId = profile?.id;
    if (!athleteId) {
      try {
        const me = await apiFetch('/api/me');
        setAuth(session, me.role, me.profile);
        athleteId = me.profile?.id;
      } catch {}
    }
    if (!athleteId) {
      initiatedRef.current = false;
      setError('Could not load your profile. Please refresh the page.');
      return;
    }

    initiatedRef.current = true;
    setLoading(true);
    setError('');
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    // Full browser navigation — backend redirects directly to Strava's OAuth page
    window.location.href = `${apiUrl}/api/strava/auth?athleteId=${athleteId}`;
  };

  const skip = () => nav('/signup/meet-pace', { replace: true });

  if (!sessionReady) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ animation: 'lk-spin 1s linear infinite' }}>
          <circle cx="16" cy="16" r="12" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
          <path d="M16 4a12 12 0 0 1 12 12" stroke="#00E5A0" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", color: 'white', textAlign: 'center', padding: '24px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,229,160,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,160,1) 1px, transparent 1px)', backgroundSize: '54px 54px', opacity: 0.03 }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(252,82,0,0.06) 0%, transparent 68%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '420px', width: '100%' }}>
        {/* Logos */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '40px' }}>
          {/* Strava S icon */}
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#FC5200', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M12 3l-4 7h3L7 17l8-9h-4L12 3z" fill="white" />
            </svg>
          </div>
          <div style={{ width: '20px', height: '2px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px' }} />
          {/* Pace P icon */}
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#00E5A0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: 800, color: '#000' }}>P</div>
        </div>

        <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '16px', lineHeight: 1.15 }}>
          Connect your runs.
        </h1>
        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.55)', marginBottom: '40px', lineHeight: 1.6, maxWidth: '360px', margin: '0 auto 40px' }}>
          Link Strava to sync your activities automatically. Your plan adapts based on what you actually run.
        </p>

        {/* Connect button */}
        <button
          type="button"
          onClick={connectStrava}
          disabled={loading}
          style={{
            width: '100%',
            padding: '18px 24px',
            borderRadius: '14px',
            background: loading ? 'rgba(252,82,0,0.7)' : '#FC5200',
            border: 'none',
            color: 'white',
            fontSize: '17px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            marginBottom: '16px',
            fontFamily: "'DM Sans', sans-serif",
            letterSpacing: '-0.01em',
          }}
        >
          {loading ? (
            <>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ animation: 'lk-spin 1s linear infinite' }}>
                <circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
                <path d="M10 2a8 8 0 0 1 8 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Connecting…
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M12 3l-4 7h3L7 17l8-9h-4L12 3z" fill="white" />
              </svg>
              Connect Strava
            </>
          )}
        </button>

        {error && (
          <p style={{ fontSize: '13px', color: '#f87171', marginBottom: '16px' }}>{error}</p>
        )}

        {/* Skip */}
        <button
          type="button"
          onClick={skip}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            fontSize: '15px',
            cursor: 'pointer',
            padding: '8px',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Skip for now →
        </button>

        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', marginTop: '20px' }}>
          You can always connect Strava later in your settings
        </p>
      </div>

      <style>{`
        @keyframes lk-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Toggle for yes/no questions ───────────────────────────────────────────────

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', gap: '12px' }}>
      <Pill label="Yes" selected={value === true} onClick={() => onChange(true)} />
      <Pill label="No" selected={value === false} onClick={() => onChange(false)} />
    </div>
  );
}

// ── Main Onboarding ───────────────────────────────────────────────────────────

export function Onboarding() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(EMPTY);
  const [error, setError] = useState('');
  const [pr5kError, setPr5kError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fading, setFading] = useState(false);
  const setAuth = useAuthStore(s => s.setAuth);
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  // FIX 3 — email confirmation inline state
  const [showConfirmationScreen, setShowConfirmationScreen] = useState(false);
  const [confirmChecking, setConfirmChecking] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [confirmResendCountdown, setConfirmResendCountdown] = useState(0);
  const [confirmResending, setConfirmResending] = useState(false);
  const [confirmResendMsg, setConfirmResendMsg] = useState('');
  const advancedConfirmRef = useRef(false);

  // If already completed onboarding, skip straight to dashboard.
  // Only fires when a real session exists — apiFetch redirects unauthenticated
  // users so it must never be called here for brand-new visitors.
  useEffect(() => {
    if (searchParams.get('step') === 'meetpace') return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      apiFetch('/api/athlete/profile').then((profile: any) => {
        if (profile?.onboarding_completed) nav('/athlete/dashboard', { replace: true });
      }).catch(() => {});
    });
  }, [nav]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL-driven step jumps (used by Strava callback and "Wrong email? Go back")
  useEffect(() => {
    const stepParam = searchParams.get('step');
    if (stepParam === 'meetpace') {
      // Arriving from Strava OAuth callback — skip directly to Meet Pace
      setStep(17);
    } else if (stepParam === '16') {
      // Returning from email confirmation ("Wrong email? Go back")
      const backup = localStorage.getItem('laktic_onboarding_form_backup');
      if (backup) {
        try {
          const restored: OnboardingData = JSON.parse(backup);
          // Clear passwords so user must re-enter; restore everything else
          setData({ ...restored, email: '', password: '', confirmPassword: '' });
        } catch {}
      }
      setStep(16);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<OnboardingData>) => setData(d => ({ ...d, ...patch }));

  // Auto-select recommended plan card when arriving at step 15
  useEffect(() => {
    if (step !== 15 || data.planType) return;
    const athleteRec: Record<string, unknown> = {
      fitness_rating: data.fitnessRating,
      experience_level: data.experience,
      current_weekly_mileage: parseFloat(data.weeklyMileage) || 0,
      pr_5k: data.pr5k || undefined,
      pr_mile: data.prMile || undefined,
      pr_800m: data.pr800m || undefined,
      pr_1500m: data.pr1500m || undefined,
      target_race_date: data.raceDate || undefined,
    };
    const tier = classifyAthleteTier(athleteRec);
    const bands = derivePaceBands(athleteRec);
    const events = deriveEventPaces(athleteRec);
    const weeksToRace = data.raceDate
      ? (new Date(data.raceDate + 'T00:00:00Z').getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
      : null;
    const recIdx = weeksToRace === null ? 0 : weeksToRace > 12 ? 0 : weeksToRace >= 6 ? 1 : 2;
    const cards = buildPlanCards(tier, data.raceDate, bands, events);
    setData(d => ({ ...d, planType: cards[Math.min(recIdx, cards.length - 1)].value }));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleArr = <K extends keyof OnboardingData>(key: K, val: string) => {
    setData(d => {
      const arr = d[key] as string[];
      return { ...d, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  };

  const transition = (fn: () => void) => {
    setFading(true);
    setTimeout(() => { fn(); setFading(false); window.scrollTo(0, 0); }, 220);
  };

  const next = () => transition(() => setStep(s => s + 1));
  const back = () => transition(() => setStep(s => s - 1));

  const nextStep9 = () => {
    if (!data.pr5k.trim()) {
      setPr5kError("Please enter your 5K time to continue. If you don't have one, enter your best estimate.");
      return;
    }
    setPr5kError('');
    next();
  };

  // FIX 4 — advance after confirmed: refresh + profile load with retry + patch
  const advanceAfterConfirm = async (session: import('@supabase/supabase-js').Session) => {
    if (advancedConfirmRef.current) return;
    advancedConfirmRef.current = true;

    sessionStorage.removeItem('laktic_pending_email');
    sessionStorage.removeItem('laktic_pending_password');

    try {
      await supabase.auth.refreshSession();
      await new Promise<void>(r => setTimeout(r, 500));

      // Fetch profile with up to 3 retries
      let profile: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          profile = await apiFetch('/api/athlete/profile');
          if (profile) break;
        } catch {}
        if (attempt < 2) await new Promise<void>(r => setTimeout(r, 1000));
      }

      // Still null — try creating a basic profile row
      if (!profile) {
        const onboardingStr = sessionStorage.getItem('laktic_onboarding');
        const fallbackName = onboardingStr
          ? (JSON.parse(onboardingStr).name as string | undefined) ?? data.name
          : data.name || (session.user.email?.split('@')[0] ?? 'Athlete');
        try {
          profile = await apiFetch('/api/athlete/profile', {
            method: 'POST',
            body: JSON.stringify({ name: fallbackName }),
          });
        } catch {
          // May already exist — try one last GET
          try { profile = await apiFetch('/api/athlete/profile'); } catch {}
        }
      }

      if (!profile) {
        setConfirmError('Could not load your profile. Please refresh the page and try again.');
        advancedConfirmRef.current = false;
        return;
      }

      setAuth(session, 'athlete', profile);

      // Apply the full onboarding patch saved before signup
      const onboardingStr = sessionStorage.getItem('laktic_onboarding');
      if (onboardingStr) {
        try {
          const { patch } = JSON.parse(onboardingStr) as { patch?: Record<string, unknown> };
          if (patch) {
            await apiFetch('/api/athlete/profile', { method: 'PATCH', body: JSON.stringify(patch) });
          }
        } catch {}
        sessionStorage.removeItem('laktic_onboarding');
      }

      nav('/signup/strava', { replace: true });
    } catch {
      setConfirmError('Something went wrong. Please try again.');
      advancedConfirmRef.current = false;
    }
  };

  // FIX 3 — onAuthStateChange auto-advance when confirmation screen is showing
  useEffect(() => {
    if (!showConfirmationScreen) return;

    // Check already-confirmed session immediately (Supabase email confirm disabled)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email_confirmed_at) advanceAfterConfirm(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email_confirmed_at) advanceAfterConfirm(session);
    });
    return () => subscription.unsubscribe();
  }, [showConfirmationScreen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resend countdown tick
  useEffect(() => {
    if (!showConfirmationScreen || confirmResendCountdown <= 0) return;
    const t = setTimeout(() => setConfirmResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [showConfirmationScreen, confirmResendCountdown]);

  const handleManualConfirmCheck = async () => {
    setConfirmChecking(true);
    setConfirmError('');
    try {
      const { data: refreshData } = await supabase.auth.refreshSession();
      if (refreshData.session?.user?.email_confirmed_at) {
        await advanceAfterConfirm(refreshData.session);
        return;
      }

      const pendingEmail = sessionStorage.getItem('laktic_pending_email');
      const pendingPassword = sessionStorage.getItem('laktic_pending_password');
      if (pendingEmail && pendingPassword) {
        const { data: signInData } = await supabase.auth.signInWithPassword({
          email: pendingEmail,
          password: pendingPassword,
        });
        if (signInData.session?.user?.email_confirmed_at) {
          await advanceAfterConfirm(signInData.session);
          return;
        }
      }

      setConfirmError("Your email isn't confirmed yet. Check your inbox and click the link.");
    } catch {
      setConfirmError("Your email isn't confirmed yet. Check your inbox and click the link.");
    } finally {
      setConfirmChecking(false);
    }
  };

  const handleConfirmResend = async () => {
    if (confirmResendCountdown > 0 || !data.email) return;
    setConfirmResending(true);
    setConfirmResendMsg('');
    try {
      const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: data.email });
      if (resendErr) throw resendErr;
      setConfirmResendMsg('Email resent. Check your inbox.');
      setConfirmResendCountdown(30);
    } catch {
      setConfirmResendMsg('Could not resend. Please wait and try again.');
    } finally {
      setConfirmResending(false);
    }
  };

  // ── Account creation ──────────────────────────────────────────────────────
  const createAccount = async () => {
    setError('');
    if (!data.email.trim()) { setError('Email is required.'); return; }
    if (data.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (data.password !== data.confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const { data: authData, error: signErr } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          emailRedirectTo: `${import.meta.env.VITE_APP_URL ?? 'https://www.laktic.com'}/auth/callback`,
          data: { name: data.name, role: 'athlete' },
        },
      });

      if (signErr) { setError(signErr.message || 'Sign up failed. Please try again.'); return; }
      if (!authData.user) { setError('Sign up failed. Please try again.'); return; }

      // Store credentials temporarily so EmailConfirmationPending can sign in fresh
      // after cross-device confirmation (where no refresh token exists on this browser).
      // Cleared immediately after successful sign-in in EmailConfirmationPending.
      sessionStorage.setItem('laktic_pending_email', data.email.trim());
      sessionStorage.setItem('laktic_pending_password', data.password);

      // Build full patch payload — needed whether we have a session or not.
      // onboarding_completed is NOT set here — MeetPaceSplash sets it after plan generation,
      // so the Strava callback can't accidentally detect it and redirect to dashboard early.
      const patch: Record<string, unknown> = {};
      if (data.age) patch.age = parseInt(data.age) || null;
      if (data.gender) patch.gender = data.gender;
      if (data.experience) patch.experience_level = data.experience;
      if (data.runnerTypes.length) patch.runner_types = data.runnerTypes;
      if (data.distances.length) patch.primary_events = data.distances;
      if (data.seasonStatus) patch.fitness_level = data.seasonStatus;
      if (data.trainingDays) patch.training_days_per_week = data.trainingDays;
      if (data.weeklyMileage) patch.weekly_volume_miles = parseFloat(data.weeklyMileage) || null;
      if (data.weeklyMileage) patch.current_weekly_mileage = parseFloat(data.weeklyMileage) || null;
      patch.fitness_rating = data.fitnessRating;
      if (data.pr800m) patch.pr_800m = data.pr800m;
      if (data.pr1500m) patch.pr_1500m = data.pr1500m;
      if (data.prMile) patch.pr_mile = data.prMile;
      if (data.pr5k) patch.pr_5k = data.pr5k;
      if (data.heightFt) patch.height_ft = parseInt(data.heightFt) || null;
      if (data.heightIn) patch.height_in = parseInt(data.heightIn) || null;
      if (data.weight) patch.weight_lbs = parseFloat(data.weight) || null;
      if (data.sleep) patch.sleep_average = data.sleep;
      if (data.hasInjuries !== null) patch.injury_notes = data.hasInjuries ? (data.injuryNotes || 'Yes') : null;
      if (data.hasGoalRace !== null) patch.has_target_race = data.hasGoalRace;
      if (data.raceName) patch.target_race_name = data.raceName;
      if (data.raceDate) patch.target_race_date = data.raceDate;
      if (data.goalTime) patch.goal_time = data.goalTime;
      if (data.raceDistance) patch.target_race_distance = data.raceDistance;
      if (data.biggestChallenges.length) patch.biggest_challenges = data.biggestChallenges;
      if (data.seasonStartDate) patch.season_start_date = data.seasonStartDate;
      if (data.seasonEndDate) patch.season_end_date = data.seasonEndDate;

      // Save plan type for MeetPaceSplash to pass to plan generation
      if (data.planType) sessionStorage.setItem('laktic_plan_type', data.planType);

      // Save onboarding data — advanceAfterConfirm applies the patch after confirmation
      sessionStorage.setItem('laktic_onboarding', JSON.stringify({ name: data.name, patch }));

      // Save form answers (no passwords) so "Wrong email? Go back" can restore them
      localStorage.setItem('laktic_onboarding_form_backup', JSON.stringify({ ...data, password: '', confirmPassword: '' }));

      // Block dashboard until MeetPaceSplash clears this flag
      localStorage.setItem('laktic_awaiting_confirmation', 'true');

      // FIX 3 — always show confirmation screen inline; never skip past it
      advancedConfirmRef.current = false;
      setConfirmResendCountdown(30);
      setConfirmError('');
      setShowConfirmationScreen(true);
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // FIX 3 — inline email confirmation screen
  if (showConfirmationScreen) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", color: 'white', padding: '24px' }}>
        <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>

          <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00E5A0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>

          <h1 style={{ fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 700, letterSpacing: '-0.025em', marginBottom: '12px' }}>
            Check your email
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: '32px' }}>
            We sent a confirmation link to{' '}
            {data.email ? (
              <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{data.email}</strong>
            ) : (
              'your email address'
            )}
            .<br />Click the link to activate your account.
          </p>

          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00E5A0', flexShrink: 0, animation: 'pulse 2s infinite' }} />
            Waiting for confirmation — this page updates automatically.
          </div>

          <button
            type="button"
            onClick={handleManualConfirmCheck}
            disabled={confirmChecking}
            style={{ width: '100%', padding: '16px', borderRadius: '12px', background: confirmChecking ? 'rgba(0,229,160,0.7)' : '#00E5A0', color: '#000', fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em', border: 'none', cursor: confirmChecking ? 'not-allowed' : 'pointer', marginBottom: '12px', opacity: confirmChecking ? 0.7 : 1 }}
          >
            {confirmChecking ? 'Checking...' : "I've Confirmed My Email"}
          </button>

          {confirmError && (
            <p style={{ fontSize: '14px', color: '#f87171', marginBottom: '16px' }}>{confirmError}</p>
          )}

          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>
            Didn't get the email?{' '}
            <button
              type="button"
              onClick={handleConfirmResend}
              disabled={confirmResendCountdown > 0 || confirmResending}
              style={{ color: '#00E5A0', background: 'none', border: 'none', cursor: confirmResendCountdown > 0 || confirmResending ? 'not-allowed' : 'pointer', opacity: confirmResendCountdown > 0 || confirmResending ? 0.5 : 1, fontSize: '13px' }}
            >
              {confirmResending
                ? 'sending...'
                : confirmResendCountdown > 0
                ? `resend in ${confirmResendCountdown}s`
                : 'resend email'}
            </button>
          </p>

          {confirmResendMsg && (
            <p style={{ fontSize: '13px', color: '#00E5A0', marginBottom: '8px' }}>{confirmResendMsg}</p>
          )}

          <button
            type="button"
            onClick={() => { setShowConfirmationScreen(false); setStep(16); advancedConfirmRef.current = false; }}
            style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '8px' }}
          >
            Wrong email? Go back
          </button>
        </div>
      </div>
    );
  }

  // ── Step 17 splash ────────────────────────────────────────────────────────
  if (step === 17) return <MeetPaceSplash />;

  const renderStep = () => {
    switch (step) {

      // STEP 1 — Welcome + Name
      case 1: return (
        <Shell step={step} onNext={next} nextDisabled={!data.name.trim()}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#00E5A0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Welcome</p>
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            Let's build your plan.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.45)', marginBottom: '36px', lineHeight: 1.6 }}>
            Answer a few questions so we can personalize everything for you.
          </p>
          <FieldLabel>What's your first name?</FieldLabel>
          <StyledInput
            type="text" placeholder="Your first name" value={data.name} autoFocus
            onChange={e => set({ name: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter' && data.name.trim()) next(); }}
          />
        </Shell>
      );

      // STEP 2 — Age + Gender
      case 2: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={!data.age}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '36px' }}>
            How old are you, <span style={{ color: '#00E5A0' }}>{data.name}</span>?
          </h2>
          <StyledInput type="number" placeholder="Age" value={data.age} style={{ maxWidth: '160px', marginBottom: '8px' }}
            onChange={e => set({ age: e.target.value })}
          />
          <HelperText>Not sure? Enter 0 and we'll adjust as we learn more about you.</HelperText>
          <div style={{ marginTop: '32px' }}>
            <FieldLabel>Gender</FieldLabel>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {['Male', 'Female', 'Prefer not to say'].map(g => (
                <Pill key={g} label={g} selected={data.gender === g} onClick={() => set({ gender: g })} />
              ))}
            </div>
          </div>
        </Shell>
      );

      // STEP 3 — Running Experience
      case 3: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={!data.experience}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '36px' }}>
            How long have you been running?
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { value: '1_to_3_years', label: '1 to 3 years' },
              { value: '3_plus_years', label: '3 or more years' },
            ].map(o => (
              <OptionCard key={o.value} label={o.label} selected={data.experience === o.value} onClick={() => set({ experience: o.value })} />
            ))}
          </div>
        </Shell>
      );

      // STEP 4 — Runner Type (multi-select)
      case 4: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={data.runnerTypes.length === 0}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            What best describes your running right now?
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px' }}>Select all that apply.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { value: 'fitness', label: 'I run for fitness' },
              { value: 'racing', label: 'I compete in races' },
              { value: 'team', label: 'I run on a team' },
              { value: 'returning', label: 'I\'m returning from a break' },
            ].map(o => (
              <OptionCard
                key={o.value} label={o.label}
                selected={data.runnerTypes.includes(o.value)}
                onClick={() => toggleArr('runnerTypes', o.value)}
              />
            ))}
          </div>
        </Shell>
      );

      // STEP 5 — Distances (multi-select)
      case 5: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={data.distances.length === 0}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            What distances do you run?
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px' }}>Select all that apply.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {[
              { label: '800m',  value: '800m'  },
              { label: 'Mile',  value: 'mile'  },
              { label: '1500m', value: '1500m' },
              { label: '3000m', value: '3000m' },
              { label: '5K',    value: '5k'    },
              { label: '10K',   value: '10k'   },
              { label: 'Other', value: 'other' },
            ].map(d => (
              <Pill key={d.value} label={d.label} selected={data.distances.includes(d.value)} onClick={() => toggleArr('distances', d.value)} />
            ))}
          </div>
        </Shell>
      );

      // STEP 6 — Season Status
      case 6: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={!data.seasonStatus}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '36px' }}>
            Where are you in your training right now?
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { value: 'competing', label: 'Currently competing' },
              { value: 'base', label: 'Building my base' },
              { value: 'off_season', label: 'Off season' },
              { value: 'returning_injury', label: 'Returning from injury' },
            ].map(o => (
              <OptionCard key={o.value} label={o.label} selected={data.seasonStatus === o.value} onClick={() => set({ seasonStatus: o.value })} />
            ))}
          </div>
        </Shell>
      );

      // STEP 7 — Schedule (mandatory)
      case 7: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={data.trainingDays === null}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '36px' }}>
            How many days a week can you train?
          </h2>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5, 6, 7].map(d => (
              <button key={d} type="button" onClick={() => set({ trainingDays: d })}
                style={{
                  width: '54px', height: '54px', borderRadius: '12px',
                  border: data.trainingDays === d ? '2px solid #00E5A0' : '2px solid rgba(255,255,255,0.1)',
                  background: data.trainingDays === d ? 'rgba(0,229,160,0.1)' : 'rgba(255,255,255,0.03)',
                  color: data.trainingDays === d ? '#00E5A0' : 'rgba(255,255,255,0.75)',
                  fontSize: '20px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                  fontFamily: "'DM Mono', monospace",
                }}
              >{d}</button>
            ))}
          </div>
          <div style={{ marginTop: '36px' }}>
            <FieldLabel>Current weekly mileage</FieldLabel>
            <div style={{ position: 'relative', maxWidth: '220px' }}>
              <StyledInput type="number" placeholder="0" value={data.weeklyMileage}
                onChange={e => set({ weeklyMileage: e.target.value })}
              />
              <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>mi/week</span>
            </div>
            <HelperText>Not sure? Enter 0 and we'll adjust as we learn more about you.</HelperText>
          </div>
        </Shell>
      );

      // STEP 8 — Fitness Rating (mandatory)
      case 8: return (
        <Shell step={step} onBack={back} onNext={next}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            How would you rate your current fitness?
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '40px' }}>Be honest — it helps us set the right starting point.</p>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: 'clamp(48px, 8vw, 72px)', fontWeight: 800, color: '#00E5A0', fontFamily: "'DM Mono', monospace" }}>{data.fitnessRating}</span>
            <span style={{ fontSize: '24px', color: 'rgba(255,255,255,0.25)', fontFamily: "'DM Mono', monospace" }}>/10</span>
          </div>
          <input type="range" min={1} max={10} step={1} value={data.fitnessRating}
            onChange={e => set({ fitnessRating: parseInt(e.target.value) })}
            style={{ width: '100%', accentColor: '#00E5A0', marginBottom: '12px', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Just getting started</span>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Peak fitness</span>
          </div>
          <HelperText>Not sure? Enter 5 and we'll adjust as we learn more about you.</HelperText>
        </Shell>
      );

      // STEP 9 — PRs (5K required)
      case 9: return (
        <Shell step={step} onBack={back} onNext={nextStep9}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            Got any personal records?
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px' }}>Your 5K time is required — all others are optional.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <FieldLabel>800m</FieldLabel>
              <StyledInput type="text" placeholder="2:10" value={data.pr800m}
                onChange={e => set({ pr800m: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>Mile</FieldLabel>
              <StyledInput type="text" placeholder="5:30" value={data.prMile}
                onChange={e => set({ prMile: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel><span>5K <span style={{ color: '#ef4444' }}>*</span></span></FieldLabel>
              <StyledInput type="text" placeholder="22:30" value={data.pr5k}
                onChange={e => { set({ pr5k: e.target.value }); if (e.target.value.trim()) setPr5kError(''); }}
              />
              {pr5kError
                ? <p style={{ fontSize: '13px', color: '#ef4444', marginTop: '6px' }}>{pr5kError}</p>
                : <HelperText>Required — used to calculate your training paces</HelperText>
              }
            </div>
            <div>
              <FieldLabel>10K</FieldLabel>
              <StyledInput type="text" placeholder="48:00" value={data.pr10k}
                onChange={e => set({ pr10k: e.target.value })}
              />
            </div>
          </div>
        </Shell>
      );

      // STEP 10 — Training Profile (mandatory)
      case 10: return (
        <Shell step={step} onBack={back} onNext={next}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            Your Training Profile.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.45)', marginBottom: '32px' }}>
            This helps us build a plan that fits your body and your life.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '8px' }}>
            <div>
              <FieldLabel>Height (ft)</FieldLabel>
              <StyledInput type="number" placeholder="5" value={data.heightFt} onChange={e => set({ heightFt: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Height (in)</FieldLabel>
              <StyledInput type="number" placeholder="8" value={data.heightIn} onChange={e => set({ heightIn: e.target.value })} />
            </div>
          </div>
          <HelperText>Not sure? Enter 0 and we'll adjust as we learn more about you.</HelperText>
          <div style={{ marginTop: '24px', marginBottom: '8px' }}>
            <FieldLabel>Weight (lbs)</FieldLabel>
            <StyledInput type="number" placeholder="155" value={data.weight} onChange={e => set({ weight: e.target.value })} style={{ maxWidth: '160px' }} />
          </div>
          <HelperText>Not sure? Enter 0 and we'll adjust as we learn more about you.</HelperText>
          <div style={{ marginTop: '28px' }}>
            <FieldLabel>How much sleep do you average per night?</FieldLabel>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {['Less than 6hrs', '6–7hrs', '7–8hrs', '8+ hrs'].map(s => (
                <Pill key={s} label={s} selected={data.sleep === s} onClick={() => set({ sleep: s })} />
              ))}
            </div>
          </div>
        </Shell>
      );

      // STEP 11 — Injuries
      case 11: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={data.hasInjuries === null}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '36px' }}>
            Any current injuries or pain we should know about?
          </h2>
          <div style={{ marginBottom: '28px' }}>
            <YesNo value={data.hasInjuries} onChange={v => set({ hasInjuries: v, injuryNotes: v ? data.injuryNotes : '' })} />
          </div>
          {data.hasInjuries && (
            <div>
              <FieldLabel>Tell us more — we'll build around it</FieldLabel>
              <StyledTextarea
                placeholder="e.g. Left knee pain when running downhill, IT band tightness..."
                value={data.injuryNotes}
                onChange={e => set({ injuryNotes: e.target.value })}
              />
            </div>
          )}
        </Shell>
      );

      // STEP 12 — Goal Race (skip allowed)
      case 12: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={data.hasGoalRace === null} onSkip={next}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '36px' }}>
            Do you have a goal race coming up?
          </h2>
          <div style={{ marginBottom: '28px' }}>
            <YesNo
              value={data.hasGoalRace}
              onChange={v => set({ hasGoalRace: v, raceName: v ? data.raceName : '', raceDate: v ? data.raceDate : '', raceDistance: v ? data.raceDistance : '', goalTime: v ? data.goalTime : '' })}
            />
          </div>
          {data.hasGoalRace && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <FieldLabel>Race name</FieldLabel>
                <StyledInput type="text" placeholder="e.g. Boston Marathon" value={data.raceName} onChange={e => set({ raceName: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Race date</FieldLabel>
                <StyledInput type="date" value={data.raceDate} onChange={e => set({ raceDate: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Distance</FieldLabel>
                <select value={data.raceDistance} onChange={e => set({ raceDistance: e.target.value })} style={{ ...INPUT_STYLE }}>
                  <option value="">Select distance</option>
                  {['800m', '1500m', 'Mile', '3K', '5K', 'Other'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Goal time (optional)</FieldLabel>
                <StyledInput type="text" placeholder="1:45:00" value={data.goalTime} onChange={e => set({ goalTime: e.target.value })} />
              </div>
            </div>
          )}
        </Shell>
      );

      // STEP 13 — Season Window (optional)
      case 13: return (
        <Shell step={step} onBack={back} onNext={next} onSkip={next} skipLabel="Skip for now">
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            When is your season?
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px' }}>
            Optional — helps us plan your training arc across the full season.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <FieldLabel>Season start</FieldLabel>
              <StyledInput type="date" value={data.seasonStartDate} onChange={e => set({ seasonStartDate: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Season end / last goal race</FieldLabel>
              <StyledInput type="date" value={data.seasonEndDate} onChange={e => set({ seasonEndDate: e.target.value })} />
            </div>
          </div>
        </Shell>
      );

      // STEP 14 — Biggest Challenges (multi-select)
      case 14: return (
        <Shell step={step} onBack={back} onNext={next}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            What's your biggest challenge right now?
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px' }}>Select all that apply.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {[
              'Staying consistent', 'Avoiding injury', 'Burning out', 'Pacing myself',
              'Building mileage', 'Race-day nerves', 'Staying motivated',
              'Fitting training in', 'Getting faster', 'Recovery',
            ].map(c => (
              <Pill key={c} label={c} selected={data.biggestChallenges.includes(c)} onClick={() => toggleArr('biggestChallenges', c)} />
            ))}
          </div>
        </Shell>
      );

      // STEP 15 — Plan Selection (data-driven)
      case 15: {
        const athleteRec: Record<string, unknown> = {
          fitness_rating: data.fitnessRating,
          experience_level: data.experience,
          current_weekly_mileage: parseFloat(data.weeklyMileage) || 0,
          pr_5k: data.pr5k || undefined,
          pr_mile: data.prMile || undefined,
          pr_800m: data.pr800m || undefined,
          pr_1500m: data.pr1500m || undefined,
          target_race_date: data.raceDate || undefined,
        };
        const tier15 = classifyAthleteTier(athleteRec);
        const bands15 = derivePaceBands(athleteRec);
        const events15 = deriveEventPaces(athleteRec);
        const weeksToRace15 = data.raceDate
          ? (new Date(data.raceDate + 'T00:00:00Z').getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
          : null;
        const recIdx15 = weeksToRace15 === null ? 0 : weeksToRace15 > 12 ? 0 : weeksToRace15 >= 6 ? 1 : 2;
        const cards15 = buildPlanCards(tier15, data.raceDate, bands15, events15);

        return (
          <Shell step={step} onBack={back} onNext={next} nextDisabled={!data.planType}>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
              What kind of plan do you want?
            </h2>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px' }}>
              Choose the approach that fits where you are right now.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {cards15.map((card, idx) => {
                const isSelected = data.planType === card.value;
                const isRecommended = idx === Math.min(recIdx15, cards15.length - 1);
                return (
                  <button
                    key={card.value}
                    type="button"
                    onClick={() => set({ planType: card.value })}
                    style={{
                      position: 'relative',
                      width: '100%',
                      padding: '16px 20px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid #00E5A0' : '2px solid rgba(255,255,255,0.1)',
                      background: isSelected ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.03)',
                      color: 'white',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {/* Recommended tag */}
                    {isRecommended && (
                      <span style={{
                        position: 'absolute', top: '12px', right: '14px',
                        fontSize: '10px', fontWeight: 600, color: '#00E5A0',
                        background: 'rgba(0,229,160,0.1)', borderRadius: '100px',
                        padding: '3px 8px', letterSpacing: '0.04em',
                        fontFamily: "'DM Sans', sans-serif",
                      }}>
                        Recommended for you
                      </span>
                    )}
                    {/* Title */}
                    <p style={{ fontSize: '15px', fontWeight: 600, color: isSelected ? '#00E5A0' : 'white', marginBottom: '4px', paddingRight: isRecommended ? '148px' : '0' }}>
                      {card.label}
                    </p>
                    {/* Description */}
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginBottom: '10px' }}>
                      {card.desc}
                    </p>
                    {/* Week preview */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '10px' }}>
                      {card.preview.map((row, ri) => (
                        <div key={ri} style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          {row.day && (
                            <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', width: '28px', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {row.day}
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>{row.workout}</span>
                          {row.pace && (
                            <span style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#00E5A0' }}>{row.pace}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Phase badge */}
                    <span style={{
                      display: 'inline-block',
                      fontSize: '10px', fontWeight: 600,
                      color: card.phaseColor,
                      background: `${card.phaseColor}18`,
                      borderRadius: '100px', padding: '2px 8px',
                      letterSpacing: '0.03em',
                    }}>
                      {card.phase}
                    </span>
                  </button>
                );
              })}
            </div>
          </Shell>
        );
      }

      // STEP 16 — Account Creation
      case 16: return (
        <Shell step={step} onBack={back} onNext={createAccount} nextLabel="Create Account"
          nextDisabled={!data.email || !data.password || data.password !== data.confirmPassword}
          nextLoading={loading}
        >
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>Almost done.</h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.45)', marginBottom: '32px' }}>Create your account to save your plan.</p>

          {error && (
            <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', color: '#f87171' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
            <div>
              <FieldLabel>Email</FieldLabel>
              <StyledInput type="email" placeholder="you@example.com" value={data.email} onChange={e => set({ email: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Password</FieldLabel>
              <StyledInput type="password" placeholder="Minimum 8 characters" value={data.password} onChange={e => set({ password: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Confirm Password</FieldLabel>
              <StyledInput type="password" placeholder="••••••••" value={data.confirmPassword} onChange={e => set({ confirmPassword: e.target.value })} />
              {data.confirmPassword && data.password === data.confirmPassword && (
                <p style={{ fontSize: '12px', color: '#00E5A0', marginTop: '6px' }}>Passwords match ✓</p>
              )}
            </div>
          </div>

          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>
            By creating an account you agree to our{' '}
            <Link to="/privacy" target="_blank" style={{ color: 'rgba(0,229,160,0.7)', textDecoration: 'none' }}>Privacy Policy</Link>.
          </p>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.35)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#00E5A0', textDecoration: 'none' }}>Sign in</Link>
          </p>
        </Shell>
      );

      default: return null;
    }
  };

  return (
    <div style={{ opacity: fading ? 0 : 1, transition: 'opacity 0.22s ease' }}>
      {renderStep()}
    </div>
  );
}
