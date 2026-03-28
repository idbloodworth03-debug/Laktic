import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Button, Input, Card, Alert } from '../components/ui';

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md fade-up">
        <div className="text-center mb-8">
          <Link to="/" className="font-display font-black text-3xl text-brand-400 tracking-tighter">LAKTIC</Link>
          <h1 className="font-display text-xl font-semibold mt-3">Reset your password</h1>
          <p className="text-sm text-[var(--muted)] mt-1">We'll send a reset link to your email.</p>
        </div>
        <Card>
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
            <p className="text-center text-sm text-[var(--muted)]">
              Remember it? <Link to="/login/athlete" className="text-brand-400 hover:underline">Sign in</Link>
            </p>
          </div>
        </Card>
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

  // Supabase redirects here with a token in the URL hash.
  // onAuthStateChange fires with event PASSWORD_RECOVERY once the session is set.
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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md fade-up">
        <div className="text-center mb-8">
          <Link to="/" className="font-display font-black text-3xl text-brand-400 tracking-tighter">LAKTIC</Link>
          <h1 className="font-display text-xl font-semibold mt-3">Choose a new password</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Must be at least 8 characters.</p>
        </div>
        <Card>
          <div className="flex flex-col gap-4">
            {!sessionReady && (
              <Alert type="info" message="Verifying your reset link…" />
            )}
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
        </Card>
      </div>
    </div>
  );
}
