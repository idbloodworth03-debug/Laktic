import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Spinner } from '../components/ui';

// Smart landing page for athletes: sends them to their active plan if one
// exists, otherwise to browse bots to find their coach.
export function AthleteDashboard() {
  const nav = useNavigate();

  useEffect(() => {
    apiFetch('/api/athlete/season')
      .then(({ season }) => nav(season ? '/athlete/plan' : '/athlete/browse', { replace: true }))
      .catch(() => nav('/athlete/browse', { replace: true }));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
