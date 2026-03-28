import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input } from '../components/ui';

const EVENT_OPTIONS = ['800m', '1500m', 'Mile', '3000m', '5K', '10K', 'Half Marathon', 'Marathon', 'Steeplechase', 'Cross Country'];

const STEPS = [
  { n: 1, label: 'Connect Strava' },
  { n: 2, label: 'Preferences' },
  { n: 3, label: 'Races' },
  { n: 4, label: 'Join Team' },
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

type Race = { name: string; date: string; is_goal_race: boolean };

export function AthleteOnboarding() {
  const nav = useNavigate();
  const { profile, session, setAuth } = useAuthStore();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  // Step 1 — Connect Strava
  const [connectingStrava, setConnectingStrava] = useState(false);

  // Step 2 — Sport preferences
  const [events, setEvents] = useState<string[]>(profile?.primary_events || []);
  const [weeklyMiles, setWeeklyMiles] = useState(String(profile?.weekly_volume_miles ?? 20));
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Step 3 — Race calendar (collected locally; saved to localStorage so the
  // subscribe flow can pre-populate the season's race calendar later)
  const [races, setRaces] = useState<Race[]>([]);
  const [raceName, setRaceName] = useState('');
  const [raceDate, setRaceDate] = useState('');
  const [isGoal, setIsGoal] = useState(true);

  // Step 4 — Join team
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<{ teamName: string } | null>(null);

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

  // ── Step 2: Save preferences ───────────────────────────────────────────────
  const savePreferences = async () => {
    setSavingPrefs(true); setError('');
    try {
      const updated = await apiFetch('/api/athlete/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          primary_events: events,
          weekly_volume_miles: parseFloat(weeklyMiles) || 20,
        }),
      });
      setAuth(session, 'athlete', { ...profile, ...updated });
      next();
    } catch (e: any) { setError(e.message || 'Failed to save preferences'); }
    finally { setSavingPrefs(false); }
  };

  // ── Step 3: Race calendar helpers ─────────────────────────────────────────
  const addRace = () => {
    if (!raceName.trim() || !raceDate) return;
    setRaces(r => [...r, { name: raceName.trim(), date: raceDate, is_goal_race: isGoal }]);
    setRaceName(''); setRaceDate(''); setIsGoal(true);
  };

  const removeRace = (i: number) => setRaces(r => r.filter((_, idx) => idx !== i));

  const advanceFromRaces = () => {
    // Persist locally so the subscription flow can pre-populate the season
    if (races.length > 0) {
      localStorage.setItem('laktic_pending_races', JSON.stringify(races));
    }
    next();
  };

  // ── Step 4: Join team ──────────────────────────────────────────────────────
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

  const finish = () => nav('/athlete/dashboard');

  // ── Renders ────────────────────────────────────────────────────────────────

  if (step === 1) return (
    <Shell
      step={1}
      onNext={next}
      onSkip={next}
    >
      <h2 className="font-display text-xl font-bold mb-1">Connect Strava</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Connecting Strava lets your coaching bot see your actual runs and automatically adapt your plan based on how training is going.
      </p>
      {renderError()}

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

        <Button
          variant="primary"
          size="lg"
          loading={connectingStrava}
          onClick={connectStrava}
          className="w-full"
        >
          Connect Strava Account
        </Button>

        <p className="text-xs text-[var(--muted)] text-center">
          Strava API access may take 1–2 weeks to approve. You can still use Laktic while waiting.
        </p>
      </div>
    </Shell>
  );

  if (step === 2) return (
    <Shell
      step={2}
      onBack={back}
      onNext={savePreferences}
      nextLoading={savingPrefs}
    >
      <h2 className="font-display text-xl font-bold mb-1">Your Sport Profile</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Confirm your events and weekly mileage. Your coaching bot uses these to calibrate every workout.
      </p>
      {renderError()}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5 shadow-card">
        <div>
          <label className="text-sm font-medium text-[var(--muted)] block mb-2">Primary events</label>
          <div className="flex flex-wrap gap-2">
            {EVENT_OPTIONS.map(e => (
              <button
                key={e}
                onClick={() => setEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  events.includes(e)
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-500'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <Input
          label="Weekly training mileage"
          type="number"
          value={weeklyMiles}
          onChange={e => setWeeklyMiles(e.target.value)}
          placeholder="20"
        />
      </div>
    </Shell>
  );

  if (step === 3) return (
    <Shell
      step={3}
      onBack={back}
      onNext={advanceFromRaces}
      nextLabel={races.length > 0 ? `Continue with ${races.length} race${races.length > 1 ? 's' : ''} →` : 'Continue →'}
      onSkip={next}
    >
      <h2 className="font-display text-xl font-bold mb-1">Your Race Calendar</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Add your upcoming goal races. Your season plan will be periodized around them — peak for goal races, taper before them.
      </p>
      {renderError()}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4 shadow-card">
        {races.length > 0 && (
          <ul className="flex flex-col gap-2 mb-2">
            {races.map((r, i) => (
              <li key={i} className="flex items-center justify-between text-sm border border-[var(--border)] rounded-lg px-3 py-2">
                <span>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-[var(--muted)] ml-2">{r.date}</span>
                  {r.is_goal_race && (
                    <span className="ml-2 text-xs text-brand-400 font-medium">Goal</span>
                  )}
                </span>
                <button
                  onClick={() => removeRace(i)}
                  className="text-[var(--muted)] hover:text-red-400 transition-colors text-xs ml-4"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3">
          <Input
            label="Race name"
            value={raceName}
            onChange={e => setRaceName(e.target.value)}
            placeholder="e.g. Boston Marathon"
            onKeyDown={e => e.key === 'Enter' && addRace()}
          />
          <Input
            label="Race date"
            type="date"
            value={raceDate}
            onChange={e => setRaceDate(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_goal"
              checked={isGoal}
              onChange={e => setIsGoal(e.target.checked)}
              className="accent-brand-500"
            />
            <label htmlFor="is_goal" className="text-sm text-[var(--muted)] cursor-pointer">
              This is a goal race (plan will peak for this event)
            </label>
          </div>
          <Button
            variant="secondary"
            onClick={addRace}
            disabled={!raceName.trim() || !raceDate}
          >
            Add Race
          </Button>
        </div>
      </div>
    </Shell>
  );

  if (step === 4) return (
    <Shell
      step={4}
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
