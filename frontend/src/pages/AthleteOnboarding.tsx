import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input, Textarea } from '../components/ui';

const EVENT_OPTIONS = ['800m', '1500m', 'Mile', '3000m', '5K', '10K', 'Half Marathon', 'Marathon', 'Steeplechase', 'Cross Country'];

const FITNESS_LEVELS = [
  { id: 'beginner', label: 'Beginner', desc: 'Just getting started or returning after a long break' },
  { id: 'intermediate', label: 'Intermediate', desc: 'Training consistently, looking to improve' },
  { id: 'competitive', label: 'Competitive', desc: 'Racing regularly, chasing personal bests' },
  { id: 'elite', label: 'Elite', desc: 'High performance, serious about podiums' },
];

const GOAL_OPTIONS = ['Get Faster', 'Build Endurance', 'Lose Weight', 'Stay Healthy', 'Compete Seriously'];

const CHALLENGE_OPTIONS = ['Consistency', 'Recovery', 'Speed', 'Endurance', 'Motivation'];

const STEPS = [
  { n: 1, label: 'Connect Strava' },
  { n: 2, label: 'Sport Profile' },
  { n: 3, label: 'Join Team' },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={[
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
              s.n < current ? 'bg-brand-600 border-brand-600 text-white' :
              s.n === current ? 'bg-brand-500 border-brand-500 text-white shadow-glow-sm' :
              'bg-[var(--surface2)] border-[var(--border)] text-[var(--muted)]',
            ].join(' ')}>
              {s.n < current ? '✓' : s.n}
            </div>
            <span className={`text-xs mt-1.5 font-medium whitespace-nowrap ${s.n === current ? 'text-brand-400' : 'text-[var(--muted)]'}`}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 mb-5 transition-colors ${s.n < current ? 'bg-brand-600' : 'bg-[var(--border)]'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function Shell({ step, children, onBack, onNext, nextLabel = 'Continue →', nextDisabled = false, nextLoading = false, onSkip }: {
  step: number; children: React.ReactNode;
  onBack?: () => void; onNext: () => void;
  nextLabel?: string; nextDisabled?: boolean; nextLoading?: boolean;
  onSkip?: () => void;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)] relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: 'linear-gradient(var(--green) 1px, transparent 1px), linear-gradient(90deg, var(--green) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] rounded-full bg-brand-500/8 blur-[80px] pointer-events-none" />

      <div className="relative z-10 max-w-xl mx-auto px-6 py-12">
        <div className="text-center mb-8 fade-up">
          <Link to="/" className="font-display font-black text-2xl text-brand-400 tracking-tighter">LAKTIC</Link>
          <p className="text-sm text-[var(--muted)] mt-1">Getting started — Step {step} of {STEPS.length}</p>
        </div>

        <StepIndicator current={step} />

        <div className="fade-up-1">{children}</div>

        <div className="flex items-center justify-between mt-8">
          <div>{onBack && <Button variant="ghost" onClick={onBack}>← Back</Button>}</div>
          <div className="flex items-center gap-3">
            {onSkip && <Button variant="ghost" onClick={onSkip}>Skip for now</Button>}
            <Button variant="primary" onClick={onNext} disabled={nextDisabled} loading={nextLoading} size="lg">
              {nextLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Chip selector (multi or single) ──────────────────────────────────────────
function ChipGroup({ options, selected, onToggle, multi = false }: {
  options: string[]; selected: string | string[];
  onToggle: (val: string) => void; multi?: boolean;
}) {
  const isSelected = (v: string) => multi
    ? (selected as string[]).includes(v)
    : selected === v;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onToggle(opt)}
          className="px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
          style={{
            borderColor: isSelected(opt) ? 'var(--color-accent)' : 'var(--border)',
            background: isSelected(opt) ? 'rgba(0,229,160,0.12)' : 'transparent',
            color: isSelected(opt) ? 'var(--color-accent)' : 'var(--muted)',
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── Day pill selector ─────────────────────────────────────────────────────────
function DayPills({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2">
      {[2, 3, 4, 5, 6].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="w-11 h-11 rounded-xl text-sm font-bold border transition-all"
          style={{
            borderColor: value === n ? 'var(--color-accent)' : 'var(--border)',
            background: value === n ? 'rgba(0,229,160,0.12)' : 'var(--surface)',
            color: value === n ? 'var(--color-accent)' : 'var(--muted)',
            boxShadow: value === n ? '0 0 0 1px rgba(0,229,160,0.3)' : 'none',
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ── Fitness level card grid ───────────────────────────────────────────────────
function FitnessCards({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {FITNESS_LEVELS.map(level => {
        const active = value === level.id;
        return (
          <button
            key={level.id}
            type="button"
            onClick={() => onChange(level.id)}
            className="text-left p-4 rounded-xl border transition-all"
            style={{
              borderColor: active ? 'var(--color-accent)' : 'var(--border)',
              background: active ? 'rgba(0,229,160,0.08)' : 'var(--surface)',
              boxShadow: active ? '0 0 0 1px rgba(0,229,160,0.25)' : 'none',
            }}
          >
            <div className="text-sm font-semibold mb-1" style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-primary, #fff)' }}>
              {level.label}
            </div>
            <div className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              {level.desc}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Target race option cards ──────────────────────────────────────────────────
function RaceOptionCards({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { id: 'yes', label: 'Yes — I have a specific race', desc: 'Tell us the details for a fully personalized plan' },
    { id: 'no', label: 'No — just building fitness', desc: 'We\'ll build a progressive base fitness plan' },
    { id: 'notsure', label: 'Not sure yet', desc: 'Start with a general plan and add a race later' },
  ];
  return (
    <div className="flex flex-col gap-2">
      {opts.map(opt => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className="text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3"
            style={{
              borderColor: active ? 'var(--color-accent)' : 'var(--border)',
              background: active ? 'rgba(0,229,160,0.08)' : 'var(--surface)',
              boxShadow: active ? '0 0 0 1px rgba(0,229,160,0.25)' : 'none',
            }}
          >
            <div
              className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
              style={{ borderColor: active ? 'var(--color-accent)' : 'var(--border)' }}
            >
              {active && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-accent)' }} />}
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-primary, #fff)' }}>{opt.label}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{opt.desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function AthleteOnboarding() {
  const nav = useNavigate();
  const { profile, session, setAuth } = useAuthStore();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  // Step 1 — Connect Strava
  const [connectingStrava, setConnectingStrava] = useState(false);
  const [stravaConnected, setStravaConnected] = useState(false);

  // Step 2 — Sport Profile
  const [events, setEvents] = useState<string[]>(profile?.primary_events || []);
  const [fitnessLevel, setFitnessLevel] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState('');
  const [trainingDays, setTrainingDays] = useState<number | null>(null);
  const [biggestChallenge, setBiggestChallenge] = useState('');
  const [injuryNotes, setInjuryNotes] = useState('');
  const [targetRaceOption, setTargetRaceOption] = useState('');
  const [targetRaceName, setTargetRaceName] = useState('');
  const [targetRaceDate, setTargetRaceDate] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Step 3 — Join team
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<{ teamName: string } | null>(null);

  // Detect ?strava=connected redirect from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname);
      setStravaConnected(true);
    }
  }, []);

  const next = () => { setError(''); setStep(s => s + 1); };
  const back = () => { setError(''); setStep(s => s - 1); };

  const renderError = () => error ? (
    <div className="mb-4 text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">{error}</div>
  ) : null;

  // ── Step 1: Connect Strava ─────────────────────────────────────────────────
  const connectStrava = async () => {
    setConnectingStrava(true);
    try {
      const data = await apiFetch('/api/strava/auth');
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message || 'Failed to start Strava connection');
      setConnectingStrava(false);
    }
  };

  // ── Step 2: Save profile ───────────────────────────────────────────────────
  const saveProfile = async () => {
    setSavingPrefs(true); setError('');
    try {
      const updated = await apiFetch('/api/athlete/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          primary_events: events,
          fitness_level: fitnessLevel || null,
          primary_goal: primaryGoal || null,
          training_days_per_week: trainingDays ?? null,
          biggest_challenge: biggestChallenge || null,
          injury_notes: injuryNotes.trim() || null,
          has_target_race: targetRaceOption === 'yes',
          target_race_name: targetRaceOption === 'yes' ? (targetRaceName.trim() || null) : null,
          target_race_date: targetRaceOption === 'yes' ? (targetRaceDate || null) : null,
        }),
      });
      setAuth(session, 'athlete', { ...profile, ...updated });
      next();
    } catch (e: any) { setError(e.message || 'Failed to save profile'); }
    finally { setSavingPrefs(false); }
  };

  // ── Step 3: Join team ──────────────────────────────────────────────────────
  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError('Enter an invite code'); return; }
    setError(''); setJoining(true);
    try {
      const result = await apiFetch(`/api/athlete/join/${trimmed}`, { method: 'POST' });
      setJoined({ teamName: result.team.name });
    } catch (e: any) { setError(e.message || 'Invalid invite code'); }
    finally { setJoining(false); }
  };

  const finish = async () => {
    try {
      await apiFetch('/api/athlete/profile', {
        method: 'PATCH',
        body: JSON.stringify({ onboarding_completed: true }),
      });
    } catch { /* non-blocking */ }
    nav('/athlete/dashboard');
  };

  // ── Renders ────────────────────────────────────────────────────────────────

  if (step === 1) return (
    <Shell step={1} onNext={next} onSkip={next}>
      <h2 className="font-display text-xl font-bold mb-1">Connect Strava</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Connecting Strava lets your coaching bot see your actual runs and automatically adapt your plan based on how training is going.
      </p>
      {renderError()}

      {stravaConnected ? (
        <div className="bg-[var(--surface)] border border-brand-700/30 rounded-2xl p-6 flex flex-col items-center gap-4 shadow-card">
          <div className="w-12 h-12 rounded-full bg-brand-900/40 border border-brand-700/30 flex items-center justify-center">
            <span className="text-brand-400 text-xl font-bold">✓</span>
          </div>
          <div className="text-center">
            <h3 className="font-semibold text-brand-400">Strava connected!</h3>
            <p className="text-sm text-[var(--muted)] mt-1">
              Your runs will sync automatically. Click Continue to finish setup.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5 shadow-card">
          <div className="flex flex-col gap-3">
            {[
              'Auto-sync every run you log',
              'Bot compares planned vs actual workouts',
              'Intensity adjusts based on your fatigue',
            ].map(text => (
              <div key={text} className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                <span className="text-sm text-[var(--muted)]">{text}</span>
              </div>
            ))}
          </div>

          <Button variant="primary" size="lg" loading={connectingStrava} onClick={connectStrava} className="w-full">
            Connect Strava Account
          </Button>

          <p className="text-xs text-[var(--muted)] text-center">
            Strava API access may take 1–2 weeks to approve. You can still use Laktic while waiting.
          </p>
        </div>
      )}
    </Shell>
  );

  if (step === 2) return (
    <Shell
      step={2}
      onBack={back}
      onNext={saveProfile}
      nextLoading={savingPrefs}
      onSkip={next}
    >
      <h2 className="font-display text-xl font-bold mb-1">Your Sport Profile</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Help your coaching bot understand who you are. The more you share, the more personalized your plan.
      </p>
      {renderError()}

      <div className="flex flex-col gap-6">

        {/* Primary Events */}
        <div>
          <SectionLabel>Primary events</SectionLabel>
          <ChipGroup
            options={EVENT_OPTIONS}
            selected={events}
            multi
            onToggle={e => setEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])}
          />
        </div>

        {/* Fitness Level */}
        <div>
          <SectionLabel>Current fitness level</SectionLabel>
          <FitnessCards value={fitnessLevel} onChange={setFitnessLevel} />
        </div>

        {/* Primary Goal */}
        <div>
          <SectionLabel>Primary goal</SectionLabel>
          <ChipGroup
            options={GOAL_OPTIONS}
            selected={primaryGoal}
            onToggle={v => setPrimaryGoal(prev => prev === v ? '' : v)}
          />
        </div>

        {/* Training Days */}
        <div>
          <SectionLabel>Days per week available to train</SectionLabel>
          <DayPills value={trainingDays} onChange={setTrainingDays} />
        </div>

        {/* Biggest Challenge */}
        <div>
          <SectionLabel>Biggest challenge right now</SectionLabel>
          <ChipGroup
            options={CHALLENGE_OPTIONS}
            selected={biggestChallenge}
            onToggle={v => setBiggestChallenge(prev => prev === v ? '' : v)}
          />
        </div>

        {/* Injury Notes */}
        <div>
          <SectionLabel>Injuries or physical limitations? <span className="normal-case font-normal">(optional)</span></SectionLabel>
          <Textarea
            value={injuryNotes}
            onChange={e => setInjuryNotes(e.target.value)}
            rows={2}
            placeholder="e.g. left knee tendinitis, lower back tightness — leave blank if none"
          />
        </div>

        {/* Target Race */}
        <div>
          <SectionLabel>Target race or event coming up?</SectionLabel>
          <RaceOptionCards value={targetRaceOption} onChange={setTargetRaceOption} />
          {targetRaceOption === 'yes' && (
            <div className="mt-3 flex flex-col gap-3 pl-1">
              <Input
                label="Race name"
                value={targetRaceName}
                onChange={e => setTargetRaceName(e.target.value)}
                placeholder="e.g. Boston Marathon 2026"
              />
              <Input
                label="Race date"
                type="date"
                value={targetRaceDate}
                onChange={e => setTargetRaceDate(e.target.value)}
              />
            </div>
          )}
        </div>

      </div>
    </Shell>
  );

  if (step === 3) return (
    <Shell
      step={3}
      onBack={back}
      onNext={joined ? finish : handleJoin}
      nextLabel={joined ? 'Go to Dashboard →' : 'Join Team'}
      nextDisabled={!joined && !code.trim()}
      nextLoading={joining}
      onSkip={finish}
    >
      <h2 className="font-display text-xl font-bold mb-1">Join Your Coach's Team</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        If your coach gave you an invite code, enter it here. You'll be automatically connected to their coaching bot.
        You can also skip and browse bots independently.
      </p>
      {renderError()}

      {joined ? (
        <div className="bg-[var(--surface)] border border-brand-700/30 rounded-2xl p-6 flex flex-col items-center gap-4 shadow-card">
          <div className="w-12 h-12 rounded-full bg-brand-900/40 border border-brand-700/30 flex items-center justify-center">
            <span className="text-brand-400 text-xl">✓</span>
          </div>
          <div className="text-center">
            <h3 className="font-display font-semibold">Joined {joined.teamName}!</h3>
            <p className="text-sm text-[var(--muted)] mt-1">
              You're connected to your team's coaching bot. Click "Go to Dashboard" to get your plan.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4 shadow-card">
          <Input
            label="Invite Code"
            placeholder="e.g. AB3XK9QZ"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            style={{ textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', fontSize: '1.1rem' }}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
        </div>
      )}
    </Shell>
  );

  return null;
}
