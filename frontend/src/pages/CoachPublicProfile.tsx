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
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  if (error || !coach) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-400 text-lg mb-4">Coach not found</p>
        <Link to="/" className="text-green-400 hover:underline text-sm">Back to Laktic</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Navbar */}
      <nav className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-display font-black text-xl text-green-400 tracking-tighter">LAKTIC</Link>
        <Link to="/register/athlete" className="text-sm bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg transition-colors font-medium">
          Join Laktic
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-green-950/60 border border-green-800/40 flex items-center justify-center text-2xl font-bold text-green-400 shrink-0">
              {coach.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-3xl font-bold font-display">{coach.name}</h1>
                {coach.license_type === 'team' && (
                  <span className="text-xs font-bold text-blue-300 bg-blue-950/40 border border-blue-800/40 px-2 py-0.5 rounded uppercase tracking-wide">School/Club Coach</span>
                )}
              </div>
              <p className="text-gray-500 text-sm">@{coach.username}</p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <Badge label={SPEC_LABEL[coach.specialization] ?? coach.specialization} color="green" />
                {coach.team_name && <span className="text-sm text-gray-400">{coach.team_name}</span>}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-4 mb-4">
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Athletes</div>
              <div className="font-bold text-white mt-0.5">{coach.athlete_count}</div>
            </div>
          </div>

          {/* Philosophy */}
          {coach.philosophy && (
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 mb-6">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Coaching Philosophy</h2>
              <p className="text-gray-300 leading-relaxed text-sm">
                "{coach.philosophy.slice(0, 400)}{coach.philosophy.length > 400 ? '...' : ''}"
              </p>
            </div>
          )}
        </div>

        {/* Marketplace pricing */}
        {coach.marketplace && (
          <div className="mb-8 bg-green-950/20 border border-green-800/30 rounded-2xl p-6">
            <h2 className="font-display font-bold text-lg mb-2">Train with {coach.name}</h2>
            {coach.marketplace.tagline && (
              <p className="text-gray-400 text-sm mb-4">{coach.marketplace.tagline}</p>
            )}
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-3xl font-bold text-white">${coach.marketplace.price_monthly}</span>
              <span className="text-gray-500">/month</span>
              {coach.marketplace.price_annual && (
                <span className="text-xs text-green-400 ml-2">or ${coach.marketplace.price_annual}/yr</span>
              )}
            </div>
            <Link
              to={`/marketplace/${coach.id}`}
              className="block w-full bg-green-600 hover:bg-green-500 text-white text-center py-3 rounded-xl font-semibold transition-colors"
            >
              Train with {coach.name.split(' ')[0]}
            </Link>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[#1a1a1a] pt-6 text-center">
          <p className="text-sm text-gray-500">
            AI-powered coaching on{' '}
            <Link to="/" className="text-green-400 hover:underline">Laktic</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
