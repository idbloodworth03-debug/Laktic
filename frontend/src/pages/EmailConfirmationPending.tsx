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
  const [confirmError, setConfirmError] = useState('');
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancedRef = useRef(false);

  const advance = async (session: import('@supabase/supabase-js').Session) => {
    if (advancedRef.current) return;
    advancedRef.current = true;

    if (pollRef.current) clearInterval(pollRef.current);

    // Retrieve onboarding data saved by Onboarding.tsx before the email redirect
    const savedStr = sessionStorage.getItem('laktic_onboarding');
    const saved = savedStr ? JSON.parse(savedStr) : null;

    let profile: any = null;

    // Check if profile already exists (e.g. created by AuthCallback in another tab)
    try {
      const me = await apiFetch('/api/me');
      setAuth(session, me.role, me.profile);
      profile = me.profile;
    } catch {
      // Profile doesn't exist yet — create it now
      try {
        const name = saved?.name ?? state.name ?? 'Athlete';
        profile = await apiFetch('/api/athlete/profile', {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        setAuth(session, 'athlete', profile);
      } catch {
        // Profile creation failed (e.g. duplicate — AuthCallback won the race)
        try {
          const me = await apiFetch('/api/me');
          setAuth(session, me.role, me.profile);
          profile = me.profile;
        } catch {}
      }
    }

    // Apply full onboarding data (patch) if saved
    if (saved?.patch && profile) {
      try {
        await apiFetch('/api/athlete/profile', {
          method: 'PATCH',
          body: JSON.stringify(saved.patch),
        });
      } catch {}
      sessionStorage.removeItem('laktic_onboarding');
    }

    // Advance to Strava connect step (not directly to dashboard)
    nav('/signup/strava', { replace: true });
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

  // Fallback: poll every 2s — force refresh from server so cross-device confirmation is detected
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const { data: { session } } = await supabase.auth.refreshSession();
      if (!session) return;
      if (session.user.email_confirmed_at) {
        await advance(session);
      }
    }, 2000);

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
      // refreshSession() forces a round-trip to Supabase — picks up cross-device confirmation
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      if (session?.user?.email_confirmed_at) {
        await advance(session);
      } else {
        setConfirmError("We haven't received your confirmation yet. Check your email and try again.");
      }
    } catch {
      setConfirmError('Something went wrong. Please try again.');
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
            to="/athlete/signup"
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
