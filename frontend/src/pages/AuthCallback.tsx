import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Spinner } from '../components/ui';

/**
 * /auth/callback — Supabase redirects here after email confirmation.
 *
 * PKCE flow: URL has ?code=xxxx — we exchange it for a session.
 * Implicit flow: URL has #access_token=xxxx — client auto-processes.
 *
 * After getting a session we either:
 *   a) fetch the existing profile (profile was already created — rare double-confirmation case), or
 *   b) create the profile from user_metadata stored during signUp()
 */
export function AuthCallback() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore(s => s.setAuth);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      // PKCE: exchange the code for a session
      const code = searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMsg('Email confirmation failed. The link may have expired — please sign up again.');
          setStatus('error');
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMsg('Could not confirm your account. Please try signing in or contact support@laktic.com');
        setStatus('error');
        return;
      }

      const meta = (session.user.user_metadata ?? {}) as Record<string, any>;
      const role = meta.role as 'coach' | 'athlete' | undefined;

      // Try fetching existing profile first (idempotent — safe to call twice)
      try {
        const { role: existingRole, profile } = await apiFetch('/api/me');
        setAuth(session, existingRole, profile);
        nav(existingRole === 'coach' ? '/coach/onboarding' : '/athlete/onboarding', { replace: true });
        return;
      } catch {
        // 404 = no profile yet — create it below
      }

      if (!role) {
        setErrorMsg('Account setup is incomplete. Please contact support@laktic.com');
        setStatus('error');
        return;
      }

      // Create the profile using metadata saved during signUp()
      try {
        let profile: any;
        if (role === 'coach') {
          profile = await apiFetch('/api/coach/profile', {
            method: 'POST',
            body: JSON.stringify({
              name: meta.name ?? 'Coach',
              school_or_org: meta.school_or_org ?? undefined,
            }),
          });
          setAuth(session, 'coach', profile);
          nav('/coach/onboarding', { replace: true });
        } else {
          profile = await apiFetch('/api/athlete/profile', {
            method: 'POST',
            body: JSON.stringify({
              name: meta.name ?? 'Athlete',
              weekly_volume_miles: meta.weekly_volume_miles ?? undefined,
              primary_events: meta.primary_events ?? undefined,
              pr_mile: meta.pr_mile ?? undefined,
              pr_5k: meta.pr_5k ?? undefined,
            }),
          });
          setAuth(session, 'athlete', profile);
          nav('/athlete/onboarding', { replace: true });
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to set up your profile. Please contact support@laktic.com');
        setStatus('error');
      }
    })();
  }, []);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="max-w-sm w-full mx-4 text-center space-y-4">
          <p className="font-display text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Something went wrong
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{errorMsg}</p>
          <a href="/athlete/signup" style={{ color: 'var(--color-accent)' }} className="text-sm hover:underline">
            Back to sign up
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="text-center space-y-4">
        <Spinner size="lg" />
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Confirming your account…</p>
      </div>
    </div>
  );
}
