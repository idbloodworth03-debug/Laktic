import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Card, Button, Spinner } from './ui';

interface PaywallProps { children: React.ReactNode; }

export function Paywall({ children }: PaywallProps) {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    apiFetch('/api/billing/status')
      .then((data) => setSubscribed(data.subscribed === true))
      .catch(() => setSubscribed(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  if (!subscribed) return (
    <Card className="text-center py-10">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-900/40 border border-brand-700/30 flex items-center justify-center text-2xl">&#9733;</div>
        <h3 className="font-display text-lg font-semibold">Premium Feature</h3>
        <p className="text-sm text-[var(--muted)] max-w-sm">Upgrade your plan to unlock this feature and get the most out of Laktic.</p>
        <Button variant="primary" onClick={() => nav('/pricing')}>View Plans</Button>
      </div>
    </Card>
  );
  return <>{children}</>;
}
