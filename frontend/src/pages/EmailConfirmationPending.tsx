import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface ConfirmState {
  email: string;
  name: string;
}

const RESEND_DELAY = 30;

export function EmailConfirmationPending() {
  const location = useLocation();
  const nav = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const state = (location.state ?? {}) as Partial<ConfirmState>;

  const email = state.email ?? '';

  const [resendCountdown, setResendCountdown] = useState(RESEND_DELAY);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancedRef = useRef(false);

  const advance = async (session: import('@supabase/supabase-js').Session) => {
    if (advancedRef.current) return;
    advancedRef.current = true;

    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const { role, profile } = await apiFetch('/api/me');
      setAuth(session, role, profile);
      nav('/athlete/dashboard', { replace: true });
    } catch {
      // Profile not yet created — create a minimal one then proceed
      try {
        const profile = await apiFetch('/api/athlete/profile', {
          method: 'POST',
          body: JSON.stringify({ name: state.name ?? 'Athlete' }),
        });
        setAuth(session, 'athlete', profile);
        nav('/athlete/dashboard', { replace: true });
      } catch {
        nav('/athlete/dashboard', { replace: true });
      }
    }
  };

  // Primary: onAuthStateChange fires when email is confirmed in the same browser
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
          await advance(session);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // Fallback: poll getSession every 3s (catches same-browser confirmation)
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await advance(session);
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Resend countdown
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const handleResend = async () => {
    if (resendCountdown > 0 || !email) return;
    setResending(true);
    setResendMsg('');
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      setResendMsg('Email resent! Check your inbox.');
      setResendCountdown(RESEND_DELAY);
    } catch {
      setResendMsg('Could not resend. Please wait and try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      {/* Nav */}
      <div className="flex items-center justify-between px-8 pt-6">
        <Link
          to="/"
          className="font-sans font-semibold text-[17px] tracking-tight"
          style={{ color: 'var(--color-accent)' }}
        >
          Laktic
        </Link>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-6">

          {/* Icon */}
          <div
            className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: 'rgba(0,229,160,0.08)',
              border: '1px solid rgba(0,229,160,0.2)',
            }}
          >
            <Mail
              size={40}
              strokeWidth={1.5}
              style={{ color: 'var(--color-accent)' }}
            />
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h1
              className="font-display text-3xl font-bold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Check your email
            </h1>
            <p style={{ color: 'var(--color-text-tertiary)' }} className="text-sm leading-relaxed">
              We sent a confirmation link to{' '}
              {email ? (
                <strong style={{ color: 'var(--color-text-secondary)' }}>{email}</strong>
              ) : (
                'your email address'
              )}
              .<br />
              Click the link to activate your account.
            </p>
          </div>

          {/* Status indicator */}
          <div
            className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
              style={{ background: 'var(--color-accent)' }}
            />
            Waiting for email confirmation… Once confirmed, this page will update automatically.
          </div>

          {/* Resend */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCountdown > 0 || resending}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {resending
                ? 'Sending…'
                : resendCountdown > 0
                ? `Resend email (${resendCountdown}s)`
                : 'Resend confirmation email'}
            </button>
            {resendMsg && (
              <p className="text-xs" style={{ color: 'var(--color-accent)' }}>{resendMsg}</p>
            )}
          </div>

          {/* Back link */}
          <Link
            to="/athlete/signup"
            className="text-sm hover:underline block"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Wrong email? Go back
          </Link>

        </div>
      </div>

      {/* Footer hint */}
      <div className="px-8 pb-6 text-center">
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Didn't receive it? Check your spam folder or{' '}
          <a href="mailto:support@laktic.com" style={{ color: 'var(--color-accent)' }} className="hover:underline">
            contact support
          </a>
          .
        </p>
      </div>
    </div>
  );
}
