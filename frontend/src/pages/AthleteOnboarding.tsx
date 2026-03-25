import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input } from '../components/ui';

const STEPS = [
  { n: 1, label: 'Join Team' },
  { n: 2, label: 'Connect Strava' },
  { n: 3, label: 'Find Coach' },
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

export function AthleteOnboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  // Step 1 — Join team
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<{ teamName: string } | null>(null);

  // Step 2 — Connect Strava
  const [connectingStrava, setConnectingStrava] = useState(false);

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

  const renderError = () => error ? (
    <div className="mb-4 text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">{error}</div>
  ) : null;

  if (step === 1) return (
    <Shell
      step={1}
      onNext={() => { setError(''); setStep(2); }}
      nextLabel={joined ? 'Continue →' : 'Continue →'}
      onSkip={() => { setError(''); setStep(2); }}
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
            <p className="text-sm text-[var(--muted)] mt-1">You're connected to your team's coaching bot.</p>
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
          <Button variant="secondary" onClick={handleJoin} loading={joining} disabled={!code.trim()}>
            Join Team
          </Button>
        </div>
      )}
    </Shell>
  );

  if (step === 2) return (
    <Shell
      step={2}
      onBack={() => { setError(''); setStep(1); }}
      onNext={() => nav('/athlete/browse')}
      nextLabel="Go to Browse Coaches →"
      onSkip={() => nav('/athlete/browse')}
    >
      <h2 className="font-display text-xl font-bold mb-1">Connect Strava</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Connecting Strava lets your coaching bot see your actual runs and automatically adapt your plan based on how training is going.
      </p>
      {renderError()}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5 shadow-card">
        <div className="flex flex-col gap-3">
          {[
            { icon: '📍', text: 'Auto-sync every run you log' },
            { icon: '📊', text: 'Bot compares planned vs actual workouts' },
            { icon: '⚡', text: 'Intensity adjusts based on your fatigue' },
          ].map(f => (
            <div key={f.text} className="flex items-center gap-3">
              <span className="text-xl">{f.icon}</span>
              <span className="text-sm text-[var(--muted)]">{f.text}</span>
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
          Strava API access may take 1-2 weeks to approve. You can still use Laktic while waiting.
        </p>
      </div>
    </Shell>
  );

  return null;
}
