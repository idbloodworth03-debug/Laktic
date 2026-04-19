import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { AppLayout } from '../components/ui';
import { supabase } from '../lib/supabaseClient';

export function NutritionPage() {
  const { role, profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  return (
    <AppLayout role={role ?? 'athlete'} name={profile?.name} onLogout={logout}>
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="text-center max-w-lg mx-auto px-6">
          <div
            className="mx-auto mb-6 w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" stroke="var(--color-accent)" strokeWidth="1.5" />
              <path d="M8 12c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="1.5" fill="var(--color-accent)" />
            </svg>
          </div>

          <h1
            className="font-sans font-bold mb-3"
            style={{ fontSize: 'clamp(28px, 5vw, 40px)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}
          >
            Nutrition &amp; Fueling
          </h1>

          <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Personalized nutrition plans and fueling strategies are coming soon. Pace will tell you exactly what to eat before, during, and after every run.
          </p>

          <div
            className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
            style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', color: 'var(--color-accent)' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--color-accent)' }}
            />
            Coming Soon
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
