import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input } from '../components/ui';

// ── Landing ──────────────────────────────────────────────────────────────────
const STATS = [
  { value: '14-day', label: 'coaching window' },
  { value: 'GPT-4o', label: 'Powered by' },
  { value: '100%', label: 'Coach-voice plans' },
];

const FEATURES = [
  {
    title: 'Personalized Plans',
    desc: "A full season plan built from your coach's philosophy — tailored to your race calendar and current fitness.",
  },
  {
    title: '14-Day Coaching',
    desc: 'Chat with your bot anytime. It adapts your next two weeks of training without touching the rest of your season.',
  },
  {
    title: 'Strava Connected',
    desc: "Every run you log syncs automatically. Your bot tracks compliance and adjusts intensity when you're ahead or behind.",
  },
];

export function Landing() {
  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      {/* Animated grid background */}
      <div
        className="landing-grid absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-accent) 1px, transparent 1px), linear-gradient(90deg, var(--color-accent) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.06,
        }}
      />

      {/* Subtle glow orb */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none">
        <div
          className="w-[800px] h-[400px] rounded-full blur-[140px]"
          style={{ background: 'var(--color-accent)', opacity: 0.07 }}
        />
      </div>

      {/* Nav bar */}
      <div className="relative z-10 flex items-center justify-between px-8 pt-6">
        <span
          className="font-sans font-semibold text-[17px] tracking-tight"
          style={{ color: 'var(--color-accent)' }}
        >
          Laktic
        </span>
        <div className="flex items-center gap-4 text-sm">
          <Link
            to="/login/coach"
            className="transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={e => ((e.target as HTMLElement).style.color = 'var(--color-accent)')}
            onMouseLeave={e => ((e.target as HTMLElement).style.color = 'var(--color-text-tertiary)')}
          >
            Coach login
          </Link>
          <Link to="/login/athlete">
            <Button variant="secondary" size="sm">
              Athlete login
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero — left-aligned inside a max-width container */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 pt-16 pb-8 max-w-5xl">
        {/* Early access pill */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium mb-8 self-start"
          style={{
            borderColor: 'rgba(0,229,160,0.25)',
            background: 'rgba(0,229,160,0.06)',
            color: 'var(--color-accent)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: 'var(--color-accent)' }}
          />
          Now in early access
        </div>

        <h1
          className="font-sans font-semibold leading-[1.08] mb-6"
          style={{
            fontSize: 'clamp(42px, 6vw, 64px)',
            color: 'var(--color-text-primary)',
          }}
        >
          Train smarter.
          <br />
          <span style={{ color: 'var(--color-accent)' }}>Race faster.</span>
        </h1>

        <p
          className="text-base leading-relaxed mb-10 max-w-xl"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Your coach's philosophy, delivered to every athlete — personalized, adaptive, always on.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/register/athlete">
            <Button
              variant="primary"
              size="xl"
              className="font-semibold"
            >
              Get My Plan
            </Button>
          </Link>
          <Link to="/register/coach">
            <Button variant="secondary" size="xl">
              I'm a Coach
            </Button>
          </Link>
        </div>

        <p className="text-xs mt-4" style={{ color: 'var(--color-text-tertiary)' }}>
          Free to start · No credit card required
        </p>
      </div>

      {/* Stats strip */}
      <div className="relative z-10 max-w-3xl mx-auto w-full px-8 sm:px-16 lg:px-24 mb-12">
        <div
          className="grid grid-cols-3 divide-x divide-[var(--color-border)] rounded-xl"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          {STATS.map(s => (
            <div key={s.label} className="flex flex-col items-center py-5 px-4">
              <span
                className="font-mono font-semibold text-lg"
                style={{ color: 'var(--color-accent)' }}
              >
                {s.value}
              </span>
              <span
                className="text-xs mt-1"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature cards */}
      <div className="relative z-10 max-w-5xl mx-auto w-full px-8 sm:px-16 lg:px-24 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="rounded-xl p-6 transition-colors"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <h3
                className="font-sans font-semibold text-sm mb-2"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {f.title}
              </h3>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Auth Split Layout ─────────────────────────────────────────────────────────
const PANEL_BULLETS = [
  'Personalized season plan from your coach',
  'Adaptive 14-day coaching window',
  'Strava-connected compliance tracking',
];

interface SplitAuthProps {
  title: string;
  subtitle: string;
  error: string;
  children: React.ReactNode;
}

function SplitAuth({ title, subtitle, error, children }: SplitAuthProps) {
  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      {/* Left branding panel — hidden on mobile */}
      <div
        className="hidden md:flex flex-col justify-between w-[40%] min-h-screen px-12 py-12"
        style={{
          background: 'var(--color-bg-primary)',
          borderRight: '1px solid var(--color-border)',
        }}
      >
        {/* Top: wordmark */}
        <Link
          to="/"
          className="font-sans font-semibold text-[17px] tracking-tight"
          style={{ color: 'var(--color-accent)' }}
        >
          Laktic
        </Link>

        {/* Middle: tagline + bullets */}
        <div>
          <p
            className="font-sans font-semibold text-2xl leading-snug mb-8"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Your coach's philosophy.
            <br />
            <span style={{ color: 'var(--color-accent)' }}>Every athlete.</span>
          </p>
          <ul className="flex flex-col gap-4">
            {PANEL_BULLETS.map(b => (
              <li key={b} className="flex items-start gap-3">
                <span
                  className="mt-0.5 text-xs font-bold shrink-0"
                  style={{ color: 'var(--color-accent)' }}
                >
                  +
                </span>
                <span
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {b}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom: footer note */}
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Free to start · No credit card required
        </p>
      </div>

      {/* Right form panel */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 py-12"
        style={{ background: 'var(--color-bg-secondary)' }}
      >
        {/* Mobile wordmark */}
        <Link
          to="/"
          className="md:hidden font-sans font-semibold text-[17px] tracking-tight mb-8"
          style={{ color: 'var(--color-accent)' }}
        >
          Laktic
        </Link>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1
              className="font-sans font-semibold text-xl mb-1"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {title}
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {subtitle}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {error && (
              <div
                className="text-sm rounded-lg px-3 py-2"
                style={{
                  color: 'var(--color-danger, #f87171)',
                  background: 'rgba(248,113,113,0.08)',
                  border: '1px solid rgba(248,113,113,0.2)',
                }}
              >
                {error}
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Coach Register ───────────────────────────────────────────────────────────
export function CoachRegister() {
  const nav = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', school_or_org: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pwTooShort = form.password.length > 0 && form.password.length < 8;
  const confirmMismatch = form.confirmPassword.length > 0 && form.password !== form.confirmPassword;
  const confirmMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword && form.password.length >= 8;
  const canSubmit = !loading && !!form.name && !!form.email && form.password.length >= 8 && form.password === form.confirmPassword;

  const handle = async () => {
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      document.getElementById('coach-confirm-pw')?.focus();
      return;
    }
    setError(''); setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signUp({ email: form.email, password: form.password });
      if (signErr || !data.session) throw new Error(signErr?.message || 'Sign up failed');
      const profile = await apiFetch('/api/coach/profile', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, school_or_org: form.school_or_org }),
      });
      setAuth(data.session, 'coach', profile);
      nav('/coach/onboarding');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <SplitAuth title="Create Coach Account" subtitle="Set up your coaching bot once. Athletes train autonomously." error={error}>
      <Input label="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Coach Jane Smith" />
      <Input label="School / Organization (optional)" value={form.school_or_org} onChange={e => setForm(f => ({ ...f, school_or_org: e.target.value }))} placeholder="State University XC" />
      <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="coach@example.com" />
      <Input
        label="Password"
        type="password"
        value={form.password}
        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
        placeholder="••••••••"
        hint="Minimum 8 characters"
        error={pwTooShort ? 'Password must be at least 8 characters' : undefined}
      />
      <div className="flex flex-col gap-1">
        <Input
          id="coach-confirm-pw"
          label="Confirm password"
          type="password"
          value={form.confirmPassword}
          onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
          placeholder="••••••••"
          error={confirmMismatch ? 'Passwords do not match' : undefined}
        />
        {confirmMatch && (
          <p className="text-xs" style={{ color: 'var(--color-accent)' }}>Passwords match</p>
        )}
      </div>
      <Button onClick={handle} loading={loading} disabled={!canSubmit} className="w-full font-semibold" size="lg">
        Create Coach Account
      </Button>
      <p className="text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        Already have an account?{' '}
        <Link to="/login" className="transition-colors" style={{ color: 'var(--color-accent)' }}>Sign in</Link>
      </p>
      <p className="text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        Are you an athlete?{' '}
        <Link to="/athlete/signup" className="transition-colors" style={{ color: 'var(--color-accent)' }}>Sign up here</Link>
      </p>
    </SplitAuth>
  );
}

// ── Athlete Register ─────────────────────────────────────────────────────────
const EVENT_OPTIONS = ['800m', '1500m', 'Mile', '3000m', '5K', '10K', 'Half Marathon', 'Marathon', 'Steeplechase', 'Cross Country'];

export function AthleteRegister() {
  const nav = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', weekly_volume_miles: '20', pr_mile: '', pr_5k: '' });
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pwTooShort = form.password.length > 0 && form.password.length < 8;
  const confirmMismatch = form.confirmPassword.length > 0 && form.password !== form.confirmPassword;
  const confirmMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword && form.password.length >= 8;
  const canSubmit = !loading && !!form.name && !!form.email && form.password.length >= 8 && form.password === form.confirmPassword;

  const toggleEvent = (e: string) => setEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);

  const handle = async () => {
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      document.getElementById('athlete-confirm-pw')?.focus();
      return;
    }
    setError(''); setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signUp({ email: form.email, password: form.password });
      if (signErr || !data.session) throw new Error(signErr?.message || 'Sign up failed');
      const profile = await apiFetch('/api/athlete/profile', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          weekly_volume_miles: parseFloat(form.weekly_volume_miles) || undefined,
          primary_events: events.length ? events : undefined,
          pr_mile: form.pr_mile || undefined,
          pr_5k: form.pr_5k || undefined,
        }),
      });
      setAuth(data.session, 'athlete', profile);
      nav('/athlete/onboarding');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <SplitAuth title="Create Athlete Account" subtitle="Find your coach bot. Get a personalized season plan." error={error}>
      <Input label="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" />
      <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
      <Input
        label="Password"
        type="password"
        value={form.password}
        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
        placeholder="••••••••"
        hint="Minimum 8 characters"
        error={pwTooShort ? 'Password must be at least 8 characters' : undefined}
      />
      <div className="flex flex-col gap-1">
        <Input
          id="athlete-confirm-pw"
          label="Confirm password"
          type="password"
          value={form.confirmPassword}
          onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
          placeholder="••••••••"
          error={confirmMismatch ? 'Passwords do not match' : undefined}
        />
        {confirmMatch && (
          <p className="text-xs" style={{ color: 'var(--color-accent)' }}>Passwords match</p>
        )}
      </div>
      <div>
        <label
          className="text-[11px] font-semibold uppercase tracking-wider block mb-2"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Primary events
        </label>
        <div className="flex flex-wrap gap-2">
          {EVENT_OPTIONS.map(e => (
            <button
              key={e}
              onClick={() => toggleEvent(e)}
              className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
              style={
                events.includes(e)
                  ? {
                      background: 'var(--color-accent)',
                      borderColor: 'var(--color-accent)',
                      color: '#000',
                    }
                  : {
                      background: 'transparent',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-secondary)',
                    }
              }
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Weekly miles" type="number" value={form.weekly_volume_miles} onChange={e => setForm(f => ({ ...f, weekly_volume_miles: e.target.value }))} />
        <Input label="PR Mile" value={form.pr_mile} onChange={e => setForm(f => ({ ...f, pr_mile: e.target.value }))} placeholder="4:32" />
        <Input label="PR 5K" value={form.pr_5k} onChange={e => setForm(f => ({ ...f, pr_5k: e.target.value }))} placeholder="15:30" />
      </div>
      <Button onClick={handle} loading={loading} disabled={!canSubmit} className="w-full font-semibold" size="lg">
        Create Athlete Account
      </Button>
      <p className="text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        Already have an account?{' '}
        <Link to="/login" className="transition-colors" style={{ color: 'var(--color-accent)' }}>Sign in</Link>
      </p>
      <p className="text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        Are you a coach?{' '}
        <Link to="/coach/signup" className="transition-colors" style={{ color: 'var(--color-accent)' }}>Sign up here</Link>
      </p>
    </SplitAuth>
  );
}

// ── Coach Login ───────────────────────────────────────────────────────────────
export function CoachLogin() {
  const nav = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setError(''); setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (signErr || !data.session) throw new Error(signErr?.message || 'Login failed');
      const me = await apiFetch('/api/me');
      if (me.role !== 'coach') { await supabase.auth.signOut(); throw new Error('This account is not a coach account'); }
      setAuth(data.session, 'coach', me.profile);
      nav('/coach/dashboard');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <SplitAuth title="Coach Sign In" subtitle="Welcome back. Your bot is coaching athletes right now." error={error}>
      <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="coach@example.com" />
      <Input label="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
      <div className="flex justify-end -mt-2">
        <Link
          to="/forgot-password"
          className="text-xs transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={e => ((e.target as HTMLElement).style.color = 'var(--color-accent)')}
          onMouseLeave={e => ((e.target as HTMLElement).style.color = 'var(--color-text-tertiary)')}
        >
          Forgot password?
        </Link>
      </div>
      <Button onClick={handle} loading={loading} className="w-full font-semibold" size="lg">
        Sign In
      </Button>
      <p className="text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        No account?{' '}
        <Link
          to="/register/coach"
          className="transition-colors"
          style={{ color: 'var(--color-accent)' }}
        >
          Register
        </Link>
      </p>
    </SplitAuth>
  );
}

// ── Athlete Login ─────────────────────────────────────────────────────────────
export function AthleteLogin() {
  const nav = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setError(''); setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (signErr || !data.session) throw new Error(signErr?.message || 'Login failed');
      const me = await apiFetch('/api/me');
      if (me.role !== 'athlete') { await supabase.auth.signOut(); throw new Error('This account is not an athlete account'); }
      setAuth(data.session, 'athlete', me.profile);
      // Check for active season
      try {
        const { season } = await apiFetch('/api/athlete/season');
        nav(season ? '/athlete/plan' : '/athlete/browse');
      } catch { nav('/athlete/browse'); }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <SplitAuth title="Athlete Sign In" subtitle="Your personalized training plan is waiting." error={error}>
      <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
      <Input label="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
      <div className="flex justify-end -mt-2">
        <Link
          to="/forgot-password"
          className="text-xs transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={e => ((e.target as HTMLElement).style.color = 'var(--color-accent)')}
          onMouseLeave={e => ((e.target as HTMLElement).style.color = 'var(--color-text-tertiary)')}
        >
          Forgot password?
        </Link>
      </div>
      <Button onClick={handle} loading={loading} className="w-full font-semibold" size="lg">
        Sign In
      </Button>
      <p className="text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        No account?{' '}
        <Link
          to="/register/athlete"
          className="transition-colors"
          style={{ color: 'var(--color-accent)' }}
        >
          Register
        </Link>
      </p>
    </SplitAuth>
  );
}

// ── Password Reset Request ────────────────────────────────────────────────────
export function PasswordResetRequest() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!email) return;
    setError(''); setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password/new`,
      });
      if (err) throw err;
      setSent(true);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (sent) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--color-bg-primary)' }}
      >
        <div className="w-full max-w-sm text-center">
          <Link
            to="/"
            className="font-sans font-semibold text-[17px] tracking-tight"
            style={{ color: 'var(--color-accent)' }}
          >
            Laktic
          </Link>
          <div
            className="mt-8 rounded-xl p-8"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{
                background: 'var(--color-accent-dim)',
                border: '1px solid rgba(0,229,160,0.2)',
              }}
            >
              <span
                className="text-sm font-bold"
                style={{ color: 'var(--color-accent)' }}
              >
                +
              </span>
            </div>
            <h2
              className="font-sans font-semibold text-lg mb-2"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Check your email
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              We sent a password reset link to{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>{email}</strong>. Click the link to set a new password.
            </p>
            <Link
              to="/"
              className="inline-block mt-6 text-sm transition-colors"
              style={{ color: 'var(--color-accent)' }}
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SplitAuth title="Reset Password" subtitle="Enter your email and we'll send you a reset link." error={error}>
      <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
      <Button onClick={handle} loading={loading} disabled={!email} className="w-full font-semibold" size="lg">
        Send Reset Link
      </Button>
      <p className="text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        <Link
          to="/login/coach"
          className="transition-colors"
          style={{ color: 'var(--color-accent)' }}
        >
          Coach login
        </Link>
        {' · '}
        <Link
          to="/login/athlete"
          className="transition-colors"
          style={{ color: 'var(--color-accent)' }}
        >
          Athlete login
        </Link>
      </p>
    </SplitAuth>
  );
}

// ── Password Reset Confirm ────────────────────────────────────────────────────
export function PasswordResetConfirm() {
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const pwTooShort = password.length > 0 && password.length < 8;
  const confirmMismatch = confirm.length > 0 && password !== confirm;
  const confirmMatch = confirm.length > 0 && password === confirm && password.length >= 8;
  const canSubmit = sessionReady && !loading && password.length >= 8 && password === confirm;

  // Supabase delivers the recovery token via URL hash; wait for PASSWORD_RECOVERY
  // event before allowing the user to submit, otherwise updateUser will fail.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setSessionReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handle = async () => {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) {
      setError('Passwords do not match');
      document.getElementById('reset-confirm-pw')?.focus();
      return;
    }
    setError(''); setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      setTimeout(() => nav('/'), 2000);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (done) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--color-bg-primary)' }}
      >
        <div className="w-full max-w-sm text-center">
          <Link
            to="/"
            className="font-sans font-semibold text-[17px] tracking-tight"
            style={{ color: 'var(--color-accent)' }}
          >
            Laktic
          </Link>
          <div
            className="mt-8 rounded-xl p-8"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{
                background: 'var(--color-accent-dim)',
                border: '1px solid rgba(0,229,160,0.2)',
              }}
            >
              <span
                className="text-sm font-bold"
                style={{ color: 'var(--color-accent)' }}
              >
                +
              </span>
            </div>
            <h2
              className="font-sans font-semibold text-lg mb-2"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Password updated
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Redirecting you to login...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SplitAuth title="Set New Password" subtitle="Must be at least 8 characters." error={error}>
      {!sessionReady && (
        <div
          className="text-sm rounded-lg px-3 py-2"
          style={{
            color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
          }}
        >
          Verifying your reset link...
        </div>
      )}
      <Input
        label="New password"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="••••••••"
        disabled={!sessionReady}
        autoFocus
        hint="Minimum 8 characters"
        error={pwTooShort ? 'Password must be at least 8 characters' : undefined}
      />
      <div className="flex flex-col gap-1">
        <Input
          id="reset-confirm-pw"
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="••••••••"
          disabled={!sessionReady}
          error={confirmMismatch ? 'Passwords do not match' : undefined}
        />
        {confirmMatch && (
          <p className="text-xs" style={{ color: 'var(--color-accent)' }}>Passwords match</p>
        )}
      </div>
      <Button onClick={handle} loading={loading} disabled={!canSubmit} className="w-full font-semibold" size="lg">
        Update Password
      </Button>
    </SplitAuth>
  );

}

// ── Unified Login ─────────────────────────────────────────────────────────────
export function UnifiedLogin() {
  const nav = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setError(''); setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (signErr || !data.session) throw new Error(signErr?.message || 'Login failed');
      const me = await apiFetch('/api/me');
      setAuth(data.session, me.role, me.profile);
      if (me.role === 'coach') {
        nav('/coach/dashboard');
      } else if (me.role === 'athlete') {
        try {
          const { season } = await apiFetch('/api/athlete/season');
          nav(season ? '/athlete/plan' : '/athlete/browse');
        } catch { nav('/athlete/browse'); }
      } else {
        throw new Error('Unknown account type. Please contact support.');
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <SplitAuth title="Sign In" subtitle="Welcome back to Laktic." error={error}>
      <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
      <Input label="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
      <div className="flex justify-end -mt-2">
        <Link
          to="/forgot-password"
          className="text-xs transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={e => ((e.target as HTMLElement).style.color = 'var(--color-accent)')}
          onMouseLeave={e => ((e.target as HTMLElement).style.color = 'var(--color-text-tertiary)')}
        >
          Forgot password?
        </Link>
      </div>
      <Button onClick={handle} loading={loading} className="w-full font-semibold" size="lg">
        Sign In
      </Button>
      <p className="text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        New here?{' '}
        <Link to="/coach/signup" className="transition-colors" style={{ color: 'var(--color-accent)' }}>Sign up as a coach</Link>
        {' '}or{' '}
        <Link to="/athlete/signup" className="transition-colors" style={{ color: 'var(--color-accent)' }}>athlete</Link>
      </p>
    </SplitAuth>
  );
}
