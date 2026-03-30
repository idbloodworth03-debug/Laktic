import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface ConfirmState {
  email: string;
  role: 'coach' | 'athlete';
  name: string;
  school_or_org?: string;
  weekly_volume_miles?: number;
  primary_events?: string[];
  pr_mile?: string;
  pr_5k?: string;
}

const RESEND_DELAY = 30;

export function EmailConfirmationPending() {
  const location = useLocation();
  const nav = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const state = (location.state ?? {}) as Partial<ConfirmState>;

  const email = state.email ?? '';
  const role = state.role ?? 'athlete';

  const [resendCountdown, setResendCountdown] = useState(RESEND_DELAY);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-poll: when user confirms in another tab, detect session and proceed
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      clearInterval(pollRef.current!);

      // Profile may already exist (created in /auth/callback tab) or need creating here
      try {
        const { role: existingRole, profile } = await apiFetch('/api/me');
        setAuth(session, existingRole, profile);
        nav(existingRole === 'coach' ? '/coach/onboarding' : '/athlete/onboarding', { replace: true });
        return;
      } catch {
        // No profile yet — create from state metadata
      }

      try {
        let profile: any;
        if (role === 'coach') {
          profile = await apiFetch('/api/coach/profile', {
            method: 'POST',
            body: JSON.stringify({ name: state.name, school_or_org: state.school_or_org }),
          });
          setAuth(session, 'coach', profile);
          nav('/coach/onboarding', { replace: true });
        } else {
          profile = await apiFetch('/api/athlete/profile', {
            method: 'POST',
            body: JSON.stringify({
              name: state.name,
              weekly_volume_miles: state.weekly_volume_miles,
              primary_events: state.primary_events,
              pr_mile: state.pr_mile,
              pr_5k: state.pr_5k,
            }),
          });
          setAuth(session, 'athlete', profile);
          nav('/athlete/onboarding', { replace: true });
        }
      } catch {
        // Failed silently — user will try again via /auth/callback from email link
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

  const backPath = role === 'coach' ? '/coach/signup' : '/athlete/signup';

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
            Waiting for confirmation…
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
            to={backPath}
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
