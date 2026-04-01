import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Spinner } from '../components/ui';

export function AuthCallback() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore(s => s.setAuth);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [redirectPath, setRedirectPath] = useState('');

  const fail = (msg: string) => { setErrorMsg(msg); setStatus('error'); };

  // After success state shows for 2s, navigate to onboarding
  useEffect(() => {
    if (status === 'success' && redirectPath) {
      const t = setTimeout(() => nav(redirectPath, { replace: true }), 2000);
      return () => clearTimeout(t);
    }
  }, [status, redirectPath]);

  useEffect(() => {
    (async () => {
      console.log('[AuthCallback] start — href:', window.location.href);

      // ── Check if Supabase itself sent an error in the URL ──────────────────
      const urlError = searchParams.get('error');
      const urlErrorDesc = searchParams.get('error_description');
      if (urlError) {
        console.error('[AuthCallback] URL error param:', urlError, urlErrorDesc);
        fail(urlErrorDesc || `Confirmation error: ${urlError}. Please try signing in.`);
        return;
      }

      // ── PKCE flow: exchange ?code= for a session ───────────────────────────
      const code = searchParams.get('code');
      console.log('[AuthCallback] code param:', code ? 'present' : 'absent');

      if (code) {
        const { data: exchangeData, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        console.log('[AuthCallback] exchangeCodeForSession:', {
          user: exchangeData?.user?.email ?? 'none',
          session: exchangeData?.session ? 'ok' : 'null',
          error: exchangeErr?.message ?? 'none',
        });
        if (exchangeErr) {
          fail(`Confirmation failed: ${exchangeErr.message}. The link may have expired — please try signing in.`);
          return;
        }
      }

      // ── Get the session (works for both PKCE after exchange, and implicit flow) ─
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[AuthCallback] getSession:', {
        session: session ? 'ok' : 'null',
        userId: session?.user?.id,
        email: session?.user?.email,
        metadata: session?.user?.user_metadata,
      });

      if (!session) {
        fail('Your session could not be established. Please try signing in directly.');
        return;
      }

      const meta = (session.user.user_metadata ?? {}) as Record<string, any>;
      const role = meta.role as 'coach' | 'athlete' | undefined;
      console.log('[AuthCallback] user_metadata:', meta, '| role:', role);

      // ── Check for existing profile first (idempotent / handles double-click) ─
      try {
        console.log('[AuthCallback] GET /api/me — checking for existing profile...');
        const { role: existingRole, profile } = await apiFetch('/api/me');
        console.log('[AuthCallback] existing profile found:', existingRole, profile?.id);
        setAuth(session, existingRole, profile);
        setRedirectPath(existingRole === 'coach' ? '/coach/onboarding' : '/signup/strava');
        setStatus('success');
        return;
      } catch (meErr: any) {
        // Expected when no profile exists yet — log so we can see what the actual error was
        console.log('[AuthCallback] /api/me threw (expected if new user):', meErr.message);
      }

      // ── No profile yet — need to create it from user_metadata ──────────────
      if (!role) {
        console.error('[AuthCallback] role missing from user_metadata. Full meta:', meta);
        fail('Account setup is incomplete (no role in metadata). Please sign up again or contact support@laktic.com');
        return;
      }

      console.log('[AuthCallback] creating profile for role:', role);

      try {
        let profile: any;

        if (role === 'coach') {
          const body = {
            name: meta.name ?? 'Coach',
            ...(meta.school_or_org ? { school_or_org: meta.school_or_org } : {}),
          };
          console.log('[AuthCallback] POST /api/coach/profile body:', body);
          profile = await apiFetch('/api/coach/profile', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          console.log('[AuthCallback] coach profile created:', profile?.id);
          setAuth(session, 'coach', profile);
          setRedirectPath('/coach/onboarding');
          setStatus('success');

        } else {
          console.log('[AuthCallback] POST /api/athlete/profile body:', { name: meta.name ?? 'Athlete' });
          profile = await apiFetch('/api/athlete/profile', {
            method: 'POST',
            body: JSON.stringify({ name: meta.name ?? 'Athlete' }),
          });
          console.log('[AuthCallback] athlete profile created:', profile?.id);

          // Apply full onboarding data saved by Onboarding.tsx before the email redirect
          const savedStr = sessionStorage.getItem('laktic_onboarding');
          const saved = savedStr ? JSON.parse(savedStr) : null;
          if (saved?.patch) {
            try {
              await apiFetch('/api/athlete/profile', {
                method: 'PATCH',
                body: JSON.stringify(saved.patch),
              });
              console.log('[AuthCallback] onboarding patch applied');
            } catch (patchErr: any) {
              console.warn('[AuthCallback] onboarding patch failed:', patchErr.message);
            }
            sessionStorage.removeItem('laktic_onboarding');
          }

          setAuth(session, 'athlete', profile);
          setRedirectPath('/signup/strava');
          setStatus('success');
        }

      } catch (createErr: any) {
        console.error('[AuthCallback] profile creation failed:', createErr.message);
        fail(`Profile creation failed: ${createErr.message}`);
      }
    })();
  }, []);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="max-w-sm w-full mx-4 text-center space-y-5">
          <p className="font-display text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Something went wrong
          </p>
          <p className="text-sm px-2" style={{ color: 'var(--color-text-tertiary)' }}>{errorMsg}</p>
          <div className="flex flex-col gap-2 items-center text-sm">
            <a href="/login" style={{ color: 'var(--color-accent)' }} className="hover:underline font-medium">
              Try signing in →
            </a>
            <a href="/athlete/signup" style={{ color: 'var(--color-text-tertiary)' }} className="hover:underline">
              Back to sign up
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="text-center space-y-4">
          <div
            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.3)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 13l4 4L19 7" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="font-display text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Email confirmed!
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
              Taking you to your account…
            </p>
          </div>
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
