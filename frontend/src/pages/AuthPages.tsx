import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input, Card, Spinner } from '../components/ui';

// ── Landing ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: '⚡',
    title: 'AI-Powered Plans',
    desc: 'GPT-4o generates a full season plan from your coach\'s philosophy — tailored to your race calendar and fitness.',
  },
  {
    icon: '🎯',
    title: '14-Day Coaching',
    desc: 'Chat with your bot anytime. It adapts your next two weeks of training without touching the rest of your season.',
  },
  {
    icon: '📊',
    title: 'Strava Connected',
    desc: 'Every run you log syncs automatically. The AI tracks compliance and adjusts intensity when you\'re ahead or behind.',
  },
];

export function Landing() {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.07]" style={{
        backgroundImage: 'linear-gradient(var(--green) 1px, transparent 1px), linear-gradient(90deg, var(--green) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      {/* Top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-brand-500/10 blur-[100px] pointer-events-none" />
      {/* Bottom glow */}
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] rounded-full bg-brand-600/8 blur-[80px] pointer-events-none" />

      {/* Nav bar */}
      <div className="relative z-10 flex items-center justify-between px-8 pt-6">
        <span className="font-display font-black text-xl text-brand-400 tracking-tighter">LAKTIC</span>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/login/coach" className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">Coach login</Link>
          <Link to="/login/athlete">
            <Button variant="secondary" size="sm">Athlete login</Button>
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-12 fade-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-brand-700/40 bg-brand-900/30 text-brand-400 text-xs font-medium mb-7">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
          Now in early access
        </div>

        <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter leading-[1.1] mb-5 max-w-2xl">
          <span className="text-gradient">AI coaching</span>
          <br />
          <span className="text-[var(--text)]">built on your</span>
          <br />
          <span className="text-[var(--text)]">coach's method.</span>
        </h1>

        <p className="text-[var(--muted)] text-base max-w-lg leading-relaxed mb-9">
          Coaches upload their philosophy once. Every athlete gets a personalized season plan, adaptive workouts, and a coaching bot — available 24/7.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-sm">
          <Link to="/register/athlete" className="flex-1">
            <Button variant="primary" className="w-full" size="xl">
              Get My Plan →
            </Button>
          </Link>
          <Link to="/register/coach" className="flex-1">
            <Button variant="secondary" className="w-full" size="xl">
              I'm a Coach
            </Button>
          </Link>
        </div>

        <p className="text-xs text-[var(--muted)] mt-4">Free to start · No credit card required</p>
      </div>

      {/* Stats strip */}
      <div className="relative z-10 max-w-3xl mx-auto px-6 mb-16 fade-up-1">
        <div className="grid grid-cols-3 divide-x divide-[var(--border)] border border-[var(--border)] rounded-2xl bg-[var(--surface)]/60 backdrop-blur-sm shadow-card">
          {[
            { value: '14-day', label: 'AI coaching window' },
            { value: 'GPT-4o', label: 'Powered by' },
            { value: '100%', label: 'Coach-voice plans' },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center py-5 px-4">
              <span className="font-display font-bold text-xl text-brand-400">{s.value}</span>
              <span className="text-xs text-[var(--muted)] mt-1">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature cards */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 pb-20 fade-up-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-[var(--surface)]/80 border border-[var(--border)] rounded-2xl p-6 hover:border-[var(--border2)] transition-colors shadow-card">
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-display font-semibold text-sm mb-2">{f.title}</h3>
              <p className="text-xs text-[var(--muted)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Coach Register ───────────────────────────────────────────────────────────
export function CoachRegister() {
  const nav = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const [form, setForm] = useState({ name: '', email: '', password: '', school_or_org: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setError(''); setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signUp({ email: form.email, password: form.password });
      if (signErr || !data.session) throw new Error(signErr?.message || 'Sign up failed');
      const profile = await apiFetch('/api/coach/profile', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, school_or_org: form.school_or_org })
      });
      setAuth(data.session, 'coach', profile);
      nav('/coach/onboarding');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return <AuthForm title="Create Coach Account" subtitle="Set up your coaching bot once. Athletes train autonomously." error={error}>
    <Input label="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Coach Jane Smith" />
    <Input label="School / Organization (optional)" value={form.school_or_org} onChange={e => setForm(f => ({ ...f, school_or_org: e.target.value }))} placeholder="State University XC" />
    <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="coach@example.com" />
    <Input label="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
    <Button onClick={handle} loading={loading} className="w-full" size="lg">Create Coach Account</Button>
    <p className="text-center text-sm text-[var(--muted)]">Already have an account? <Link to="/login/coach" className="text-brand-400 hover:underline">Sign in</Link></p>
  </AuthForm>;
}

// ── Athlete Register ─────────────────────────────────────────────────────────
const EVENT_OPTIONS = ['800m', '1500m', 'Mile', '3000m', '5K', '10K', 'Half Marathon', 'Marathon', 'Steeplechase', 'Cross Country'];

export function AthleteRegister() {
  const nav = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const [form, setForm] = useState({ name: '', email: '', password: '', weekly_volume_miles: '20', pr_mile: '', pr_5k: '' });
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleEvent = (e: string) => setEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);

  const handle = async () => {
    setError(''); setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signUp({ email: form.email, password: form.password });
      if (signErr || !data.session) throw new Error(signErr?.message || 'Sign up failed');
      const profile = await apiFetch('/api/athlete/profile', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, weekly_volume_miles: parseFloat(form.weekly_volume_miles), primary_events: events, pr_mile: form.pr_mile, pr_5k: form.pr_5k })
      });
      setAuth(data.session, 'athlete', profile);
      nav('/athlete/onboarding');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return <AuthForm title="Create Athlete Account" subtitle="Find your coach bot. Get a personalized season plan." error={error}>
    <Input label="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" />
    <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
    <Input label="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
    <div>
      <label className="text-sm font-medium text-[var(--muted)] block mb-2">Primary events</label>
      <div className="flex flex-wrap gap-2">
        {EVENT_OPTIONS.map(e => (
          <button key={e} onClick={() => toggleEvent(e)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${events.includes(e) ? 'bg-brand-600 border-brand-500 text-white' : 'border-[var(--border)] text-[var(--muted)] hover:border-brand-500'}`}>
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
    <Button onClick={handle} loading={loading} className="w-full" size="lg">Create Athlete Account</Button>
    <p className="text-center text-sm text-[var(--muted)]">Already have an account? <Link to="/login/athlete" className="text-brand-400 hover:underline">Sign in</Link></p>
  </AuthForm>;
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

  return <AuthForm title="Coach Sign In" subtitle="Welcome back. Your bot is coaching athletes right now." error={error}>
    <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="coach@example.com" />
    <Input label="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
    <div className="flex justify-end -mt-2">
      <Link to="/reset-password" className="text-xs text-[var(--muted)] hover:text-brand-400 transition-colors">Forgot password?</Link>
    </div>
    <Button onClick={handle} loading={loading} className="w-full" size="lg">Sign In</Button>
    <p className="text-center text-sm text-[var(--muted)]">No account? <Link to="/register/coach" className="text-brand-400 hover:underline">Register</Link></p>
  </AuthForm>;
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

  return <AuthForm title="Athlete Sign In" subtitle="Your personalized training plan is waiting." error={error}>
    <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
    <Input label="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
    <div className="flex justify-end -mt-2">
      <Link to="/reset-password" className="text-xs text-[var(--muted)] hover:text-brand-400 transition-colors">Forgot password?</Link>
    </div>
    <Button onClick={handle} loading={loading} className="w-full" size="lg">Sign In</Button>
    <p className="text-center text-sm text-[var(--muted)]">No account? <Link to="/register/athlete" className="text-brand-400 hover:underline">Register</Link></p>
  </AuthForm>;
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
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md fade-up text-center">
          <Link to="/" className="font-display font-black text-3xl text-brand-400 tracking-tighter">LAKTIC</Link>
          <div className="mt-8 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 shadow-card-lg">
            <div className="w-12 h-12 rounded-full bg-brand-900/40 border border-brand-700/30 flex items-center justify-center mx-auto mb-4">
              <span className="text-brand-400 text-xl">✓</span>
            </div>
            <h2 className="font-display font-semibold text-lg mb-2">Check your email</h2>
            <p className="text-sm text-[var(--muted)]">We sent a password reset link to <strong className="text-[var(--text)]">{email}</strong>. Click the link to set a new password.</p>
            <Link to="/" className="inline-block mt-6 text-sm text-brand-400 hover:underline">← Back to home</Link>
          </div>
        </div>
      </div>
    );
  }

  return <AuthForm title="Reset Password" subtitle="Enter your email and we'll send you a reset link." error={error}>
    <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
    <Button onClick={handle} loading={loading} disabled={!email} className="w-full" size="lg">Send Reset Link</Button>
    <p className="text-center text-sm text-[var(--muted)]">
      <Link to="/login/coach" className="text-brand-400 hover:underline">Coach login</Link>
      {' · '}
      <Link to="/login/athlete" className="text-brand-400 hover:underline">Athlete login</Link>
    </p>
  </AuthForm>;
}

// ── Password Reset Confirm ────────────────────────────────────────────────────
export function PasswordResetConfirm() {
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
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
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md fade-up text-center">
          <Link to="/" className="font-display font-black text-3xl text-brand-400 tracking-tighter">LAKTIC</Link>
          <div className="mt-8 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 shadow-card-lg">
            <div className="w-12 h-12 rounded-full bg-brand-900/40 border border-brand-700/30 flex items-center justify-center mx-auto mb-4">
              <span className="text-brand-400 text-xl">✓</span>
            </div>
            <h2 className="font-display font-semibold text-lg mb-2">Password updated</h2>
            <p className="text-sm text-[var(--muted)]">Redirecting you to login…</p>
          </div>
        </div>
      </div>
    );
  }

  return <AuthForm title="Set New Password" subtitle="Choose a strong password for your account." error={error}>
    <Input label="New password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoFocus />
    <Input label="Confirm password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" />
    <Button onClick={handle} loading={loading} disabled={!password || !confirm} className="w-full" size="lg">Update Password</Button>
  </AuthForm>;
}

// ── Shared Auth Form wrapper ──────────────────────────────────────────────────
function AuthForm({ title, subtitle, error, children }: { title: string; subtitle: string; error: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md fade-up">
        <div className="text-center mb-8">
          <Link to="/" className="font-display font-black text-3xl text-brand-400 tracking-tighter">LAKTIC</Link>
          <h1 className="font-display text-xl font-semibold mt-3">{title}</h1>
          <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>
        </div>
        <Card>
          <div className="flex flex-col gap-4">
            {error && <div className="text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">{error}</div>}
            {children}
          </div>
        </Card>
      </div>
    </div>
  );
}
