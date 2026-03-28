import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Navbar, Card, Button, Spinner, Badge } from '../components/ui';

const PRO_FEATURES = [
  { icon: '📊', title: 'Full Training Analytics', desc: '12-month ATL/CTL/TSB history instead of 30 days' },
  { icon: '🏅', title: 'Advanced Performance Predictions', desc: 'Multi-distance race time predictions with confidence intervals' },
  { icon: '🤖', title: 'Priority AI Responses', desc: 'Faster AI coaching responses with deeper analysis' },
  { icon: '📄', title: 'Unlimited Gameplans', desc: 'AI race gameplans for every event on your calendar' },
  { icon: '🎯', title: 'Smart Goal Tracking', desc: 'AI-driven goal recommendations based on your fitness trend' },
  { icon: '📤', title: 'Export Data', desc: 'Export training history as CSV or PDF' },
];

export function AthletePro() {
  const { profile } = useAuthStore();
  const [status, setStatus] = useState<{ tier: string; expires_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const logout = async () => { const { supabase } = await import('../lib/supabaseClient'); await supabase.auth.signOut(); useAuthStore.getState().clearAuth(); };

  useEffect(() => {
    // Check for success param
    const params = new URLSearchParams(window.location.search);
    if (params.get('pro') === '1') {
      window.history.replaceState({}, '', window.location.pathname);
    }
    apiFetch('/api/athlete-pro/status').then(setStatus).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const upgrade = async () => {
    setUpgrading(true);
    try {
      const data = await apiFetch('/api/athlete-pro/checkout', { method: 'POST' });
      if (data.url) window.location.href = data.url;
    } catch (e: any) { alert(e.message); }
    setUpgrading(false);
  };

  const cancel = async () => {
    if (!confirm('Cancel Pro subscription?')) return;
    await apiFetch('/api/athlete-pro/cancel', { method: 'POST' });
    setStatus({ tier: 'free', expires_at: null });
  };

  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center"><Spinner /></div>
  );

  const isPro = status?.tier === 'pro';

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl font-bold">Athlete Pro</h1>
          <Link to="/athlete/dashboard"><Button variant="ghost" size="sm">← Dashboard</Button></Link>
        </div>

        {isPro ? (
          <div className="mb-6 bg-brand-950/30 border border-brand-800/40 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <Badge label="Pro Active" color="green" dot />
              <span className="text-sm text-[var(--muted)]">
                {status?.expires_at && `Renews ${new Date(status.expires_at).toLocaleDateString()}`}
              </span>
            </div>
            <p className="text-sm text-[var(--muted)]">You have full access to all Pro features.</p>
            <button onClick={cancel} className="text-xs text-red-400 hover:underline mt-3 block">Cancel subscription</button>
          </div>
        ) : (
          <div className="mb-6 bg-gradient-to-br from-brand-900/40 to-brand-950/20 border border-brand-700/40 rounded-2xl p-8 text-center">
            <p className="text-4xl font-display font-bold text-brand-400 mb-1">$49</p>
            <p className="text-sm text-[var(--muted)] mb-6">per month · cancel anytime</p>
            <Button variant="primary" size="lg" loading={upgrading} onClick={upgrade} className="w-full max-w-xs mx-auto">
              Upgrade to Pro
            </Button>
            <p className="text-xs text-[var(--muted)] mt-3">Secure payment via Stripe</p>
          </div>
        )}

        <Card title="Pro Features">
          <div className="grid gap-4">
            {PRO_FEATURES.map(f => (
              <div key={f.title} className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{f.icon}</span>
                <div>
                  <p className="font-medium text-sm">{f.title} {isPro && <span className="text-xs text-green-400 ml-1">✓ Active</span>}</p>
                  <p className="text-xs text-[var(--muted)]">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
