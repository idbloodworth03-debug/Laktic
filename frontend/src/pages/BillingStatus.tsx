import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Badge, Spinner, Alert } from '../components/ui';

interface SubscriptionStatus {
  subscribed: boolean; status: string; plan_type: string | null;
  current_period_end: string | null; cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

const STATUS_COLORS: Record<string, 'green' | 'amber' | 'gray' | 'blue'> = {
  active: 'green', trialing: 'blue', past_due: 'amber', cancelled: 'gray', inactive: 'gray'
};
const PLAN_LABELS: Record<string, string> = {
  coach_team: 'Coach Team', athlete_individual: 'Individual Athlete', athlete_marketplace: 'Marketplace'
};

export function BillingStatus() {
  const { role, profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState('');
  const isSuccess = searchParams.get('status') === 'success';
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/billing/status').then(setStatus).catch((e: any) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const handleManageBilling = async () => {
    setPortalLoading(true); setError('');
    try {
      const { url } = await apiFetch('/api/billing/portal', { method: 'POST' });
      window.location.href = url;
    } catch (e: any) { setError(e.message || 'Failed to open billing portal'); }
    finally { setPortalLoading(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role={role || undefined} name={profile?.name} onLogout={logout} />
      <div className="flex items-center justify-center py-32"><Spinner size="lg" /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role={role || undefined} name={profile?.name} onLogout={logout} />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="font-display text-2xl font-bold mb-6 fade-up">Billing</h1>
        {isSuccess && <div className="mb-6 fade-up"><Alert type="success" message="Subscription activated! Welcome to Laktic." /></div>}
        {error && <div className="mb-6"><Alert type="error" message={error} onClose={() => setError('')} /></div>}
        <Card className="fade-up-1">
          {status?.subscribed || (status?.status && status.status !== 'inactive') ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-[var(--muted)] mb-1">Current Plan</div>
                  <div className="font-display text-lg font-semibold">
                    {status.plan_type ? PLAN_LABELS[status.plan_type] || status.plan_type : 'Unknown'}
                  </div>
                </div>
                <Badge label={status.status} color={STATUS_COLORS[status.status] || 'gray'} />
              </div>
              {status.current_period_end && (
                <div>
                  <div className="text-sm text-[var(--muted)] mb-1">
                    {status.cancel_at_period_end ? 'Access until' : 'Next billing date'}
                  </div>
                  <div className="text-sm font-medium">
                    {new Date(status.current_period_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>
              )}
              {status.cancel_at_period_end && <Alert type="info" message="Your subscription will cancel at the end of the billing period." />}
              {status.status === 'past_due' && <Alert type="error" message="Your last payment failed. Please update your payment method." />}
              <div className="pt-2 border-t border-[var(--border)]">
                <Button variant="secondary" onClick={handleManageBilling} loading={portalLoading}>Manage Billing</Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="text-sm text-[var(--muted)] mb-4">You don't have an active subscription.</div>
              <Button variant="primary" onClick={() => nav('/pricing')}>View Plans</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
