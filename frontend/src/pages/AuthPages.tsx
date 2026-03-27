import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input, Card, Spinner } from '../components/ui';

// ── Landing ──────────────────────────────────────────────────────────────────
export function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(var(--green) 1px, transparent 1px), linear-gradient(90deg, var(--green) 1px, transparent 1px)',
        backgroundSize: '48px 48px'
      }} />
      {/* Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-brand-500/5 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-md w-full fade-up">
        <div className="text-center">
          <div className="font-display font-black text-5xl text-brand-400 tracking-tighter mb-2">LAKTIC</div>
          <div className="text-[var(--muted)] text-lg font-light">Train Smarter. Go Laktic.</div>
        </div>

        <div className="text-center text-sm text-[var(--muted)] max-w-sm">
          AI-powered training plans built on your coach's philosophy. Personalized. Autonomous. Always on.
        </div>

        <div className="flex flex-col gap-3 w-full">
          <Link to="/register/coach" className="w-full">
            <Button variant="secondary" className="w-full" size="lg">
              <span className="text-blue-400">◈</span> I am a Coach
            </Button>
          </Link>
          <Link to="/register/athlete" className="w-full">
            <Button variant="primary" className="w-full" size="lg">
              <span>▷</span> I am an Athlete
            </Button>
          </Link>
        </div>

        <div className="text-xs text-[var(--muted)] flex gap-4">
          <Link to="/login/coach" className="hover:text-[var(--text)] transition-colors">Coach login</Link>
          <span>·</span>
          <Link to="/login/athlete" className="hover:text-[var(--text)] transition-colors">Athlete login</Link>
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
      nav('/athlete/join');
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
    <Button onClick={handle} loading={loading} className="w-full" size="lg">Sign In</Button>
    <p className="text-center text-sm text-[var(--muted)]">
      <Link to="/forgot-password" className="text-brand-400 hover:underline">Forgot password?</Link>
      {' · '}
      No account? <Link to="/register/coach" className="text-brand-400 hover:underline">Register</Link>
    </p>
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
    <Button onClick={handle} loading={loading} className="w-full" size="lg">Sign In</Button>
    <p className="text-center text-sm text-[var(--muted)]">
      <Link to="/forgot-password" className="text-brand-400 hover:underline">Forgot password?</Link>
      {' · '}
      No account? <Link to="/register/athlete" className="text-brand-400 hover:underline">Register</Link>
    </p>
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
