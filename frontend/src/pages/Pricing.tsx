import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Navbar, Button, Card, Badge, Alert } from '../components/ui';
import { supabase } from '../lib/supabaseClient';

const PLANS = [
  { id: 'coach_team' as const, name: 'Coach Team', price: '$89', period: '/month',
    description: 'Full team management. One subscription covers your entire roster.',
    features: ['Unlimited athletes on your team', 'AI-powered coaching bot', 'Training plan generation',
      'Strava integration for all athletes', 'Progress tracking & race results',
      'Knowledge document library', 'Priority support'],
    badge: 'Most Popular', badgeColor: 'green' as const, targetRole: 'coach' as const },
  { id: 'athlete_individual' as const, name: 'Individual Athlete', price: '$20', period: '/month',
    description: 'Train with any published coaching bot. Perfect for self-coached runners.',
    features: ['Access to coaching bot marketplace', 'Personalized training plans',
      'Strava activity sync', 'Race calendar & goal tracking', 'Progress analytics',
      'AI chat for workout questions'],
    badge: null, badgeColor: 'blue' as const, targetRole: 'athlete' as const }
];

export function Pricing() {
  const { role, profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const handleSubscribe = async (planType: 'coach_team' | 'athlete_individual') => {
    if (!role) { nav('/'); return; }
    setError(''); setLoading(planType);
    try {
      const { url } = await apiFetch('/api/billing/checkout', {
        method: 'POST', body: JSON.stringify({ plan_type: planType })
      });
      window.location.href = url;
    } catch (e: any) { setError(e.message || 'Failed to start checkout'); }
    finally { setLoading(null); }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role={role || undefined} name={profile?.name} onLogout={logout} />
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12 fade-up">
          <h1 className="font-display text-3xl font-bold mb-3">Choose Your Plan</h1>
          <p className="text-[var(--muted)] text-lg max-w-xl mx-auto">
            Start training smarter with AI-powered coaching. Cancel anytime.
          </p>
        </div>
        {error && <div className="max-w-md mx-auto mb-8"><Alert type="error" message={error} onClose={() => setError('')} /></div>}
        <div className="grid md:grid-cols-2 gap-8 fade-up-1">
          {PLANS.map((plan) => (
            <Card key={plan.id} className="flex flex-col relative">
              {plan.badge && <div className="absolute -top-3 left-5"><Badge label={plan.badge} color={plan.badgeColor} /></div>}
              <div className="mb-6">
                <h2 className="font-display text-xl font-semibold mb-1">{plan.name}</h2>
                <p className="text-sm text-[var(--muted)] mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold text-brand-400">{plan.price}</span>
                  <span className="text-[var(--muted)] text-sm">{plan.period}</span>
                </div>
              </div>
              <ul className="flex flex-col gap-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className="text-brand-400 mt-0.5 shrink-0">&#10003;</span><span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button variant={plan.badge ? 'primary' : 'secondary'} size="lg" className="w-full"
                loading={loading === plan.id} disabled={loading !== null}
                onClick={() => handleSubscribe(plan.id)}>
                {role === plan.targetRole ? 'Subscribe Now' : `Subscribe as ${plan.targetRole}`}
              </Button>
            </Card>
          ))}
        </div>
        <div className="text-center mt-12 text-sm text-[var(--muted)]">
          <p>All plans include a 7-day free trial. No credit card required to start.</p>
        </div>
      </div>
    </div>
  );
}
