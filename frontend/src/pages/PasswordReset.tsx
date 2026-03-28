import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Button, Input, Alert } from '../components/ui';

// ── Forgot Password ──────────────────────────────────────────────────────────
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handle = async () => {
    if (!email.trim()) return;
    setError(''); setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (err) throw err;
      setSent(true);
    } catch (e: any) {
      setError(e.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      {/* Left panel */}
      <div
        className="hidden md:flex flex-col justify-between w-2/5 p-12"
        style={{ background: 'var(--color-bg-secondary)', borderRight: '1px solid var(--color-border)' }}
      >
        <Link
          to="/"
          className="text-2xl font-black tracking-tighter"
          style={{ color: 'var(--color-accent)', fontFamily: "'DM Sans', sans-serif" }}
        >
          LAKTIC
        </Link>
        <div>
          <p className="text-4xl font-bold leading-tight mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Reset your<br /><span style={{ color: 'var(--color-accent)' }}>password.</span>
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            We'll send a link to your inbox. You'll be back to training in 60 seconds.
          </p>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Remember it?{' '}
          <Link to="/login/athlete" style={{ color: 'var(--color-accent)' }} className="hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm fade-up">
          <div className="mb-8 md:hidden text-center">
            <Link
              to="/"
              className="text-2xl font-black tracking-tighter"
              style={{ color: 'var(--color-accent)' }}
            >
              LAKTIC
            </Link>
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            Reset password
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>
            Enter your email to receive a reset link.
          </p>

          <div className="flex flex-col gap-4">
            {sent ? (
              <Alert
                type="success"
                message="Check your email — a password reset link is on its way. You can close this page."
              />
            ) : (
              <>
                {error && <Alert type="error" message={error} onClose={() => setError('')} />}
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handle()}
                  placeholder="you@example.com"
                />
                <Button onClick={handle} loading={loading} disabled={!email.trim()} className="w-full" size="lg">
                  Send reset link
                </Button>
              </>
            )}
            <p className="text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Remember it?{' '}
              <Link to="/login/athlete" style={{ color: 'var(--color-accent)' }} className="hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reset Password ────────────────────────────────────────────────────────────
export function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setSessionReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handle = async () => {
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError(''); setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      nav('/');
    } catch (e: any) {
      setError(e.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <div
        className="hidden md:flex flex-col justify-between w-2/5 p-12"
        style={{ background: 'var(--color-bg-secondary)', borderRight: '1px solid var(--color-border)' }}
      >
        <Link
          to="/"
          className="text-2xl font-black tracking-tighter"
          style={{ color: 'var(--color-accent)' }}
        >
          LAKTIC
        </Link>
        <div>
          <p className="text-4xl font-bold leading-tight mb-4" style={{ color: 'var(--color-text-primary)' }}>
            New<br /><span style={{ color: 'var(--color-accent)' }}>password.</span>
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Must be at least 8 characters.
          </p>
        </div>
        <div />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm fade-up">
          <div className="mb-8 md:hidden text-center">
            <Link to="/" className="text-2xl font-black tracking-tighter" style={{ color: 'var(--color-accent)' }}>
              LAKTIC
            </Link>
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            Choose a new password
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>
            Must be at least 8 characters.
          </p>

          <div className="flex flex-col gap-4">
            {!sessionReady && <Alert type="info" message="Verifying your reset link…" />}
            {error && <Alert type="error" message={error} onClose={() => setError('')} />}
            <Input
              label="New password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={!sessionReady}
            />
            <Input
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handle()}
              placeholder="••••••••"
              disabled={!sessionReady}
            />
            <Button onClick={handle} loading={loading} disabled={!sessionReady || !password} className="w-full" size="lg">
              Update password
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
