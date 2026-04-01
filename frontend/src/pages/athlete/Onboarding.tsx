import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { apiFetch } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingData {
  // Step 1
  name: string;
  // Step 2
  age: string;
  gender: string;
  // Step 3
  experience: string;
  // Step 4
  runnerType: string;
  // Step 5
  distances: string[];
  // Step 6
  seasonStatus: string;
  // Step 7
  trainingDays: number | null;
  weeklyMileage: string;
  // Step 8
  fitnessRating: number;
  // Step 9
  prMile: string;
  pr5k: string;
  pr10k: string;
  prHalf: string;
  prMarathon: string;
  // Step 10
  heightFt: string;
  heightIn: string;
  weight: string;
  sleep: string;
  // Step 11
  hasInjuries: boolean | null;
  injuryNotes: string;
  // Step 12
  hasGoalRace: boolean | null;
  raceName: string;
  raceDate: string;
  raceDistance: string;
  goalTime: string;
  // Step 13
  biggestChallenge: string;
  // Step 14
  email: string;
  password: string;
  confirmPassword: string;
}

const EMPTY: OnboardingData = {
  name: '', age: '', gender: '',
  experience: '', runnerType: '',
  distances: [],
  seasonStatus: '',
  trainingDays: null, weeklyMileage: '',
  fitnessRating: 5,
  prMile: '', pr5k: '', pr10k: '', prHalf: '', prMarathon: '',
  heightFt: '', heightIn: '', weight: '', sleep: '',
  hasInjuries: null, injuryNotes: '',
  hasGoalRace: null, raceName: '', raceDate: '', raceDistance: '', goalTime: '',
  biggestChallenge: '',
  email: '', password: '', confirmPassword: '',
};

const TOTAL_STEPS = 14;

// ── Shared components ─────────────────────────────────────────────────────────

function Pill({
  label, selected, onClick,
}: {
  label: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '12px 22px',
        borderRadius: '100px',
        border: selected ? '2px solid #00E5A0' : '2px solid rgba(255,255,255,0.12)',
        background: selected ? 'rgba(0,229,160,0.1)' : 'transparent',
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
    >
      {label}
    </button>
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
      style={{
        ...INPUT_STYLE,
        resize: 'vertical',
        minHeight: '120px',
        ...props.style,
      }}
      onFocus={e => { e.currentTarget.style.borderColor = '#00E5A0'; }}
      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
    />
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

// ── Shell (layout wrapper for each step) ──────────────────────────────────────

function Shell({
  step, children, onBack, onNext,
  nextLabel = 'Continue', nextDisabled = false, nextLoading = false,
  onSkip,
}: {
  step: number;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  onSkip?: () => void;
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', fontFamily: "'DM Sans', sans-serif", color: 'white', position: 'relative', overflow: 'hidden' }}>
      {/* Grid bg */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,229,160,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,160,1) 1px, transparent 1px)', backgroundSize: '54px 54px', opacity: 0.025 }} />
      <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,229,160,0.06) 0%, transparent 68%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '560px', margin: '0 auto', padding: 'clamp(24px, 4vw, 48px) 24px' }}>
        {/* Top nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '7px 14px', color: 'rgba(255,255,255,0.5)', fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'DM Sans', sans-serif" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
            >← Back</button>
          ) : (
            <Link to="/" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '17px', color: '#00E5A0', textDecoration: 'none' }}>Laktic</Link>
          )}
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>{step < TOTAL_STEPS ? `Step ${step} of ${TOTAL_STEPS}` : ''}</span>
        </div>

        {/* Progress bar */}
        <ProgressBar current={step} total={TOTAL_STEPS} />

        {/* Content */}
        <div style={{ marginTop: '40px' }}>
          {children}
        </div>

        {/* Bottom actions */}
        <div style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || nextLoading}
            style={{
              width: '100%',
              padding: '15px',
              background: nextDisabled ? 'rgba(0,229,160,0.3)' : '#00E5A0',
              color: nextDisabled ? 'rgba(0,0,0,0.4)' : '#000',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: nextDisabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={e => { if (!nextDisabled) e.currentTarget.style.background = '#00cc8f'; }}
            onMouseLeave={e => { if (!nextDisabled) e.currentTarget.style.background = '#00E5A0'; }}
          >
            {nextLoading ? 'Creating your account…' : nextLabel}
          </button>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '14px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", padding: '4px', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
            >Skip for now</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 15 — Meet Pace splash ────────────────────────────────────────────────

function MeetPaceSplash() {
  const nav = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => nav('/athlete/dashboard'), 3000);
    return () => clearTimeout(t);
  }, [nav]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", color: 'white', textAlign: 'center', padding: '24px' }}>
      {/* Grid bg */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(0,229,160,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,160,1) 1px, transparent 1px)', backgroundSize: '54px 54px', opacity: 0.03 }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '700px', height: '700px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,229,160,0.08) 0%, transparent 68%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: '#00E5A0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px', fontSize: '32px', fontWeight: 800, color: '#000' }}>
          P
        </div>
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '16px' }}>
          Meet <span style={{ color: '#00E5A0' }}>Pace.</span>
        </h1>
        <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.55)', marginBottom: '8px', maxWidth: '400px' }}>
          Your personal running coach. Built around you.
        </p>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.28)', marginBottom: '40px' }}>
          Generating your personalized training plan...
        </p>

        {/* Animated dots */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: '8px', height: '8px', borderRadius: '50%', background: '#00E5A0',
                animation: `lk-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes lk-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

// ── Main Onboarding component ─────────────────────────────────────────────────

export function Onboarding() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(EMPTY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fading, setFading] = useState(false);
  const setAuth = useAuthStore(s => s.setAuth);
  const nav = useNavigate();

  const set = (patch: Partial<OnboardingData>) => setData(d => ({ ...d, ...patch }));

  const transition = (fn: () => void) => {
    setFading(true);
    setTimeout(() => { fn(); setFading(false); }, 220);
  };

  const next = () => transition(() => setStep(s => s + 1));
  const back = () => transition(() => setStep(s => s - 1));

  // ── Account creation (step 14) ───────────────────────────────────────────
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

      // Email confirmation pending
      if (authData.user && !authData.session) {
        nav('/signup/confirm', { state: { email: data.email, name: data.name } });
        return;
      }

      if (!authData.session) { setError('Sign up failed. Please try again.'); return; }

      // Create profile
      const profile = await apiFetch('/api/athlete/profile', {
        method: 'POST',
        body: JSON.stringify({ name: data.name, role: 'athlete' }),
      });

      setAuth(authData.session, 'athlete', profile);

      // Patch with all onboarding data
      const patch: Record<string, unknown> = { onboarding_completed: true };
      if (data.experience) patch.experience_level = data.experience;
      if (data.runnerType) patch.primary_goal = data.runnerType;
      if (data.distances.length) patch.primary_events = data.distances;
      if (data.seasonStatus) patch.fitness_level = data.seasonStatus;
      if (data.trainingDays) patch.training_days_per_week = data.trainingDays;
      if (data.weeklyMileage) patch.weekly_volume_miles = parseFloat(data.weeklyMileage) || null;
      if (data.prMile) patch.pr_mile = data.prMile;
      if (data.pr5k) patch.pr_5k = data.pr5k;
      if (data.pr10k) patch.pr_10k = data.pr10k;
      if (data.prHalf) patch.pr_half_marathon = data.prHalf;
      if (data.prMarathon) patch.pr_marathon = data.prMarathon;
      if (data.injuryNotes || data.hasInjuries) patch.injury_notes = data.hasInjuries ? (data.injuryNotes || 'Yes') : null;
      if (data.hasGoalRace !== null) patch.has_target_race = data.hasGoalRace;
      if (data.raceName) patch.target_race_name = data.raceName;
      if (data.raceDate) patch.target_race_date = data.raceDate;
      if (data.biggestChallenge) patch.biggest_challenge = data.biggestChallenge;

      await apiFetch('/api/athlete/profile', { method: 'PATCH', body: JSON.stringify(patch) });

      // Advance to meet Pace splash
      transition(() => setStep(15));
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 15 splash ───────────────────────────────────────────────────────
  if (step === 15) return <MeetPaceSplash />;

  // ── Step content ─────────────────────────────────────────────────────────
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
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            What's your first name?
          </label>
          <StyledInput
            type="text"
            placeholder="Your first name"
            value={data.name}
            onChange={e => set({ name: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter' && data.name.trim()) next(); }}
            autoFocus
          />
        </Shell>
      );

      // STEP 2 — Age + Gender
      case 2: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={!data.age}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '36px' }}>
            How old are you, <span style={{ color: '#00E5A0' }}>{data.name}</span>?
          </h2>
          <StyledInput
            type="number"
            placeholder="Age"
            value={data.age}
            onChange={e => set({ age: e.target.value })}
            style={{ marginBottom: '32px', maxWidth: '160px' }}
          />
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Gender
          </label>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {['Male', 'Female', 'Prefer not to say'].map(g => (
              <Pill key={g} label={g} selected={data.gender === g} onClick={() => set({ gender: g })} />
            ))}
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
              { value: 'beginner', label: 'Just started' },
              { value: 'less_than_1_year', label: 'Less than 1 year' },
              { value: '1_to_3_years', label: '1 to 3 years' },
              { value: '3_plus_years', label: '3 or more years' },
            ].map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => set({ experience: o.value })}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: data.experience === o.value ? '2px solid #00E5A0' : '2px solid rgba(255,255,255,0.1)',
                  background: data.experience === o.value ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.03)',
                  color: data.experience === o.value ? '#00E5A0' : 'rgba(255,255,255,0.75)',
                  fontSize: '16px',
                  fontWeight: data.experience === o.value ? 600 : 400,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >{o.label}</button>
            ))}
          </div>
        </Shell>
      );

      // STEP 4 — Runner Type
      case 4: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={!data.runnerType}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '36px' }}>
            What best describes your running right now?
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { value: 'fitness', label: 'I run for fitness' },
              { value: 'racing', label: 'I compete in races' },
              { value: 'team', label: 'I run on a team' },
              { value: 'returning', label: 'I\'m returning from a break' },
            ].map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => set({ runnerType: o.value })}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: data.runnerType === o.value ? '2px solid #00E5A0' : '2px solid rgba(255,255,255,0.1)',
                  background: data.runnerType === o.value ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.03)',
                  color: data.runnerType === o.value ? '#00E5A0' : 'rgba(255,255,255,0.75)',
                  fontSize: '16px',
                  fontWeight: data.runnerType === o.value ? 600 : 400,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >{o.label}</button>
            ))}
          </div>
        </Shell>
      );

      // STEP 5 — Distances (multi-select)
      case 5: {
        const toggleDist = (d: string) => set({
          distances: data.distances.includes(d)
            ? data.distances.filter(x => x !== d)
            : [...data.distances, d],
        });
        return (
          <Shell step={step} onBack={back} onNext={next} nextDisabled={data.distances.length === 0}>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
              What distances do you run?
            </h2>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px' }}>Select all that apply.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {['5K', '10K', 'Half Marathon', 'Marathon', 'Track', 'Cross Country', 'Other'].map(d => (
                <Pill key={d} label={d} selected={data.distances.includes(d)} onClick={() => toggleDist(d)} />
              ))}
            </div>
          </Shell>
        );
      }

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
              <button
                key={o.value}
                type="button"
                onClick={() => set({ seasonStatus: o.value })}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: data.seasonStatus === o.value ? '2px solid #00E5A0' : '2px solid rgba(255,255,255,0.1)',
                  background: data.seasonStatus === o.value ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.03)',
                  color: data.seasonStatus === o.value ? '#00E5A0' : 'rgba(255,255,255,0.75)',
                  fontSize: '16px',
                  fontWeight: data.seasonStatus === o.value ? 600 : 400,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >{o.label}</button>
            ))}
          </div>
        </Shell>
      );

      // STEP 7 — Schedule
      case 7: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={data.trainingDays === null}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '36px' }}>
            How many days a week can you train?
          </h2>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '36px', flexWrap: 'wrap' }}>
            {[3, 4, 5, 6, 7].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => set({ trainingDays: d })}
                style={{
                  width: '60px', height: '60px',
                  borderRadius: '12px',
                  border: data.trainingDays === d ? '2px solid #00E5A0' : '2px solid rgba(255,255,255,0.1)',
                  background: data.trainingDays === d ? 'rgba(0,229,160,0.1)' : 'rgba(255,255,255,0.03)',
                  color: data.trainingDays === d ? '#00E5A0' : 'rgba(255,255,255,0.75)',
                  fontSize: '20px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: "'DM Mono', monospace",
                }}
              >{d}</button>
            ))}
          </div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Current weekly mileage
          </label>
          <div style={{ position: 'relative', maxWidth: '200px' }}>
            <StyledInput
              type="number"
              placeholder="0"
              value={data.weeklyMileage}
              onChange={e => set({ weeklyMileage: e.target.value })}
            />
            <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>miles/week</span>
          </div>
        </Shell>
      );

      // STEP 8 — Fitness Rating
      case 8: {
        const rating = data.fitnessRating;
        return (
          <Shell step={step} onBack={back} onNext={next}>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
              How would you rate your current fitness?
            </h2>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '40px' }}>Be honest — it helps us set the right starting point.</p>

            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: 'clamp(48px, 8vw, 72px)', fontWeight: 800, color: '#00E5A0', fontFamily: "'DM Mono', monospace" }}>{rating}</span>
              <span style={{ fontSize: '24px', color: 'rgba(255,255,255,0.25)', fontFamily: "'DM Mono', monospace" }}>/10</span>
            </div>

            <input
              type="range"
              min={1} max={10} step={1}
              value={rating}
              onChange={e => set({ fitnessRating: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: '#00E5A0', marginBottom: '12px', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Just getting started</span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Peak fitness</span>
            </div>
          </Shell>
        );
      }

      // STEP 9 — PRs (optional)
      case 9: return (
        <Shell step={step} onBack={back} onNext={next} onSkip={next}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            Got any personal records?
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px' }}>Optional — skip if you're just starting out.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { label: 'Mile', key: 'prMile' as const, placeholder: '5:30' },
              { label: '5K', key: 'pr5k' as const, placeholder: '22:30' },
              { label: '10K', key: 'pr10k' as const, placeholder: '46:00' },
              { label: 'Half Marathon', key: 'prHalf' as const, placeholder: '1:45:00' },
              { label: 'Marathon', key: 'prMarathon' as const, placeholder: '3:45:00' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</label>
                <StyledInput
                  type="text"
                  placeholder={f.placeholder}
                  value={data[f.key]}
                  onChange={e => set({ [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </Shell>
      );

      // STEP 10 — Body stats
      case 10: return (
        <Shell step={step} onBack={back} onNext={next} onSkip={next}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            A little about your body.
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px' }}>This helps personalize your training load.</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Height (ft)</label>
              <StyledInput type="number" placeholder="5" value={data.heightFt} onChange={e => set({ heightFt: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Height (in)</label>
              <StyledInput type="number" placeholder="8" value={data.heightIn} onChange={e => set({ heightIn: e.target.value })} />
            </div>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Weight (lbs)</label>
            <StyledInput type="number" placeholder="155" value={data.weight} onChange={e => set({ weight: e.target.value })} style={{ maxWidth: '160px' }} />
          </div>

          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            How much sleep do you average per night?
          </label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {['Less than 6hrs', '6–7hrs', '7–8hrs', '8+ hrs'].map(s => (
              <Pill key={s} label={s} selected={data.sleep === s} onClick={() => set({ sleep: s })} />
            ))}
          </div>
        </Shell>
      );

      // STEP 11 — Injuries
      case 11: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={data.hasInjuries === null}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '36px' }}>
            Any current injuries or pain we should know about?
          </h2>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
            <Pill label="Yes" selected={data.hasInjuries === true} onClick={() => set({ hasInjuries: true })} />
            <Pill label="No" selected={data.hasInjuries === false} onClick={() => set({ hasInjuries: false, injuryNotes: '' })} />
          </div>
          {data.hasInjuries && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Tell us more — we'll build around it
              </label>
              <StyledTextarea
                placeholder="e.g. Left knee pain when running downhill, IT band tightness..."
                value={data.injuryNotes}
                onChange={e => set({ injuryNotes: e.target.value })}
              />
            </div>
          )}
        </Shell>
      );

      // STEP 12 — Goal Race
      case 12: return (
        <Shell step={step} onBack={back} onNext={next} nextDisabled={data.hasGoalRace === null}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '36px' }}>
            Do you have a goal race coming up?
          </h2>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
            <Pill label="Yes" selected={data.hasGoalRace === true} onClick={() => set({ hasGoalRace: true })} />
            <Pill label="No" selected={data.hasGoalRace === false} onClick={() => set({ hasGoalRace: false, raceName: '', raceDate: '', raceDistance: '', goalTime: '' })} />
          </div>
          {data.hasGoalRace && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Race name</label>
                <StyledInput type="text" placeholder="e.g. Boston Marathon" value={data.raceName} onChange={e => set({ raceName: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Race date</label>
                <StyledInput type="date" value={data.raceDate} onChange={e => set({ raceDate: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Distance</label>
                <select
                  value={data.raceDistance}
                  onChange={e => set({ raceDistance: e.target.value })}
                  style={{ ...INPUT_STYLE }}
                >
                  <option value="">Select distance</option>
                  {['5K', '10K', 'Half Marathon', 'Full Marathon', 'Other'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Goal time (optional)</label>
                <StyledInput type="text" placeholder="1:45:00" value={data.goalTime} onChange={e => set({ goalTime: e.target.value })} />
              </div>
            </div>
          )}
        </Shell>
      );

      // STEP 13 — Biggest Challenge
      case 13: return (
        <Shell step={step} onBack={back} onNext={next} onSkip={next}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            What's your biggest challenge right now?
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', marginBottom: '28px' }}>The more specific, the better we can help.</p>
          <StyledTextarea
            placeholder="e.g. I always burn out in the last mile, I struggle to stay consistent, I get injured a lot..."
            value={data.biggestChallenge}
            onChange={e => set({ biggestChallenge: e.target.value })}
          />
        </Shell>
      );

      // STEP 14 — Account Creation
      case 14: return (
        <Shell step={step} onBack={back} onNext={createAccount} nextLabel="Create Account" nextDisabled={!data.email || !data.password || data.password !== data.confirmPassword} nextLoading={loading}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '12px' }}>
            Almost done.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.45)', marginBottom: '32px' }}>Create your account to save your plan.</p>

          {error && (
            <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', color: '#f87171' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
              <StyledInput type="email" placeholder="you@example.com" value={data.email} onChange={e => set({ email: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
              <StyledInput type="password" placeholder="Minimum 8 characters" value={data.password} onChange={e => set({ password: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confirm Password</label>
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
