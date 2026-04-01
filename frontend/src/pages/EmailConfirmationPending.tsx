import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
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
  const [confirmError, setConfirmError] = useState('');
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancedRef = useRef(false);

  // Try to obtain a confirmed session. Strategy:
  // 1. refreshSession() — works when this browser has a refresh token (same-device confirmation)
  // 2. signInWithPassword() using creds stored in sessionStorage — works cross-device:
  //    - If email not confirmed yet: Supabase returns error "Email not confirmed" → session null
  //    - If confirmed: Supabase returns a real session
  const tryGetConfirmedSession = async (): Promise<import('@supabase/supabase-js').Session | null> => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.user?.email_confirmed_at) return data.session;
    } catch {}

    const pendingEmail = sessionStorage.getItem('laktic_pending_email');
    const pendingPassword = sessionStorage.getItem('laktic_pending_password');
    if (pendingEmail && pendingPassword) {
      const { data } = await supabase.auth.signInWithPassword({ email: pendingEmail, password: pendingPassword });
      if (data.session?.user?.email_confirmed_at) return data.session;
    }
    return null;
  };

  const advance = (session: import('@supabase/supabase-js').Session) => {
    if (advancedRef.current) return;
    advancedRef.current = true;

    // Clear the temporarily stored credentials now that we have a confirmed session
    sessionStorage.removeItem('laktic_pending_email');
    sessionStorage.removeItem('laktic_pending_password');

    if (pollRef.current) clearInterval(pollRef.current);

    // Set minimal auth state — StravaConnectStep will load the full profile on mount
    // and apply any pending onboarding patch from sessionStorage.
    setAuth(session, 'athlete', null);

    nav('/signup/strava', { replace: true });
  };

  // Primary: onAuthStateChange fires when email is confirmed in the same browser
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user?.email_confirmed_at) {
          advance(session);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // Fallback: poll every 3s — tries refreshSession then signInWithPassword for cross-device detection
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const session = await tryGetConfirmedSession();
        if (session) advance(session);
      } catch {
        // Network error — keep polling silently
      }
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

  const handleManualCheck = async () => {
    setChecking(true);
    setConfirmError('');
    try {
      const session = await tryGetConfirmedSession();
      if (session) {
        advance(session);
      } else {
        setConfirmError("Your email isn't confirmed yet. Check your inbox and click the link.");
      }
    } catch {
      // Even on unexpected errors, show a specific message — never "something went wrong"
      setConfirmError("Your email isn't confirmed yet. Check your inbox and click the link.");
    } finally {
      setChecking(false);
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

          {/* Primary CTA — prominent manual confirm button */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleManualCheck}
              disabled={checking}
              className="w-full py-4 rounded-xl font-semibold text-base transition-all disabled:opacity-60"
              style={{
                background: checking ? 'rgba(0,229,160,0.7)' : '#00E5A0',
                color: '#000',
                fontSize: '17px',
                letterSpacing: '-0.01em',
              }}
            >
              {checking ? 'Checking…' : "I've Confirmed My Email →"}
            </button>

            {confirmError && (
              <p className="text-sm" style={{ color: '#f87171' }}>{confirmError}</p>
            )}
          </div>

          {/* Resend section — secondary */}
          <div className="space-y-1.5">
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Didn't get the email? Check your spam folder or{' '}
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCountdown > 0 || resending}
                className="hover:underline disabled:opacity-50"
                style={{ color: 'var(--color-accent)' }}
              >
                {resending
                  ? 'sending…'
                  : resendCountdown > 0
                  ? `resend in ${resendCountdown}s`
                  : 'resend email'}
              </button>
            </p>
            {resendMsg && (
              <p className="text-xs" style={{ color: 'var(--color-accent)' }}>{resendMsg}</p>
            )}
          </div>

          {/* Back link */}
          <Link
            to="/athlete/signup?step=14"
            className="text-sm hover:underline block"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Wrong email? Go back
          </Link>

        </div>
      </div>
    </div>
  );
}
