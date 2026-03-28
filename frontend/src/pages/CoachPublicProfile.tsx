import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Badge, Spinner } from '../components/ui';

type PublicCoach = {
  id: string;
  name: string;
  username: string;
  specialization: string;
  philosophy: string | null;
  license_type: string;
  team_name: string | null;
  athlete_count: number;
  marketplace: {
    id: string;
    tagline: string;
    price_monthly: number;
    price_annual: number;
  } | null;
};

const SPEC_LABEL: Record<string, string> = {
  distance: 'Distance Running',
  sprints: 'Sprints',
  triathlon: 'Triathlon',
  trail: 'Trail Running',
  field: 'Field Events',
  cross_country: 'Cross Country',
  multi_event: 'Multi-Event',
};

export function CoachPublicProfile() {
  const { username } = useParams<{ username: string }>();
  const [coach, setCoach] = useState<PublicCoach | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username) return;
    apiFetch(`/api/public/coach/${username}`)
      .then(setCoach)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [username]);

  useEffect(() => {
    if (!coach) return;
    document.title = `${coach.name} — ${SPEC_LABEL[coach.specialization] ?? 'Running'} Coach on Laktic`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute('content', `${coach.name} coaches ${coach.athlete_count} athlete${coach.athlete_count !== 1 ? 's' : ''} on Laktic AI Coaching Platform.${coach.philosophy ? ' ' + coach.philosophy.slice(0, 100) : ''}`);
    }
    return () => { document.title = 'Laktic'; };
  }, [coach]);

  if (loading) return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  if (error || !coach) return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[var(--color-text-secondary)] text-lg mb-4">Coach not found</p>
        <Link to="/" className="text-[var(--color-accent)] hover:underline text-sm">Back to Laktic</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      {/* Top bar */}
      <nav className="border-b border-[var(--color-border)] px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-sans font-black text-xl text-[var(--color-accent)] tracking-tighter">LAKTIC</Link>
        <Link
          to="/register/athlete"
          className="text-sm bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-black px-4 py-1.5 rounded-lg transition-colors font-semibold"
        >
          Join Laktic
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8 fade-up">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/20 flex items-center justify-center text-2xl font-bold text-[var(--color-accent)] shrink-0">
              {coach.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-3xl font-bold">{coach.name}</h1>
                {coach.license_type === 'team' && (
                  <span className="text-xs font-semibold text-[var(--blue)] bg-[var(--blue)]/10 border border-[var(--blue)]/20 px-2 py-0.5 rounded uppercase tracking-wide">School/Club</span>
                )}
              </div>
              <p className="text-[var(--color-text-tertiary)] text-sm">@{coach.username}</p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <Badge label={SPEC_LABEL[coach.specialization] ?? coach.specialization} color="green" />
                {coach.team_name && <span className="text-sm text-[var(--color-text-secondary)]">{coach.team_name}</span>}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-4 mb-4">
            <div className="bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-4 py-2">
              <div className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Athletes</div>
              <div className="font-mono font-medium text-[var(--color-text-primary)] mt-0.5">{coach.athlete_count}</div>
            </div>
          </div>

          {/* Philosophy */}
          {coach.philosophy && (
            <div className="bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl p-5 mb-6">
              <h2 className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Coaching Philosophy</h2>
              <p className="text-[var(--color-text-secondary)] leading-relaxed text-sm">
                "{coach.philosophy.slice(0, 400)}{coach.philosophy.length > 400 ? '...' : ''}"
              </p>
            </div>
          )}
        </div>

        {/* Marketplace CTA */}
        {coach.marketplace && (
          <div className="mb-8 fade-up-1 bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/20 rounded-2xl p-6">
            <h2 className="font-bold text-lg mb-2">Train with {coach.name}</h2>
            {coach.marketplace.tagline && (
              <p className="text-[var(--color-text-secondary)] text-sm mb-4">{coach.marketplace.tagline}</p>
            )}
            <div className="flex items-baseline gap-2 mb-5">
              <span className="font-mono text-3xl font-medium text-[var(--color-text-primary)]">${coach.marketplace.price_monthly}</span>
              <span className="text-[var(--color-text-tertiary)]">/month</span>
              {coach.marketplace.price_annual && (
                <span className="text-xs text-[var(--color-accent)] ml-2">or ${coach.marketplace.price_annual}/yr</span>
              )}
            </div>
            <Link
              to={`/marketplace/${coach.id}`}
              className="block w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-black text-center py-3 rounded-xl font-semibold transition-colors"
            >
              Train with {coach.name.split(' ')[0]}
            </Link>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] pt-6 text-center fade-up-2">
          <p className="text-sm text-[var(--color-text-tertiary)]">
            AI-powered coaching on{' '}
            <Link to="/" className="text-[var(--color-accent)] hover:underline">Laktic</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
