import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Badge, Spinner } from '../components/ui';

type PublicAthlete = {
  id: string;
  name: string;
  username: string;
  primary_events: string[];
  pr_mile: string | null;
  pr_5k: string | null;
  team_name: string | null;
  coach_name: string | null;
  coach_username: string | null;
  races: Array<{
    id: string;
    race_name: string;
    distance: string;
    finish_time: string;
    race_date: string;
    is_pr: boolean;
    share_card_url: string | null;
  }>;
  stats: {
    total_miles: number;
    activity_count: number;
    streak_days: number;
  };
  milestones: Array<{
    milestone_type: string;
    label: string;
    value: string | number;
    earned_at: string;
  }>;
  public_sections: { races: boolean; stats: boolean; milestones: boolean };
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
      <span className="text-2xl font-bold font-display text-white">{value}</span>
      <span className="text-xs text-gray-500 mt-1 uppercase tracking-wide">{label}</span>
    </div>
  );
}

export function AthletePublicProfile() {
  const { username } = useParams<{ username: string }>();
  const [athlete, setAthlete] = useState<PublicAthlete | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username) return;
    apiFetch(`/api/public/athlete/${username}`)
      .then(setAthlete)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [username]);

  // SEO meta tags
  useEffect(() => {
    if (!athlete) return;
    const prs = [
      athlete.pr_5k ? `5K: ${athlete.pr_5k}` : '',
      athlete.pr_mile ? `Mile: ${athlete.pr_mile}` : '',
    ].filter(Boolean).join(', ');

    document.title = `${athlete.name} — ${(athlete.primary_events ?? []).join(', ')} athlete on Laktic`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute('content', `${athlete.name}'s running profile on Laktic.${prs ? ` PRs: ${prs}.` : ''} ${athlete.stats.total_miles} total miles logged.`);
    }
    return () => { document.title = 'Laktic'; };
  }, [athlete]);

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  if (error || !athlete) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-400 text-lg mb-4">Athlete not found</p>
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
              {athlete.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold font-display">{athlete.name}</h1>
              <p className="text-gray-500 text-sm mt-0.5">@{athlete.username}</p>
              {athlete.primary_events?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {athlete.primary_events.map(e => (
                    <Badge key={e} label={e} color="green" />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PRs */}
          {(athlete.pr_mile || athlete.pr_5k) && (
            <div className="flex gap-3 mb-4">
              {athlete.pr_mile && (
                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Mile PR</span>
                  <div className="font-bold text-white mt-0.5">{athlete.pr_mile}</div>
                </div>
              )}
              {athlete.pr_5k && (
                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">5K PR</span>
                  <div className="font-bold text-white mt-0.5">{athlete.pr_5k}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        {athlete.public_sections.stats && athlete.stats && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Stats</h2>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total Miles" value={athlete.stats.total_miles.toLocaleString()} />
              <StatCard label="Activities" value={athlete.stats.activity_count.toLocaleString()} />
              <StatCard label="Streak" value={`${athlete.stats.streak_days}d`} />
            </div>
          </div>
        )}

        {/* Race History */}
        {athlete.public_sections.races && athlete.races.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Race History</h2>
            <div className="flex flex-col gap-2">
              {athlete.races.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white leading-snug">{r.race_name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {r.distance} · {new Date(r.race_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.is_pr && (
                      <span className="text-xs font-bold text-yellow-400 bg-yellow-950/40 border border-yellow-800/40 px-2 py-0.5 rounded">PR</span>
                    )}
                    <span className="font-mono font-semibold text-green-400">{r.finish_time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Milestones */}
        {athlete.public_sections.milestones && athlete.milestones.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Milestones</h2>
            <div className="flex flex-wrap gap-2">
              {athlete.milestones.map((m, i) => (
                <div key={i} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs">
                  <div className="font-medium text-white">{m.label}</div>
                  <div className="text-gray-500 mt-0.5">{new Date(m.earned_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coach attribution */}
        {athlete.coach_name && (
          <div className="border-t border-[#1a1a1a] pt-6 text-center">
            <p className="text-sm text-gray-500">
              Coached by{' '}
              {athlete.coach_username ? (
                <Link to={`/coach/${athlete.coach_username}`} className="text-green-400 hover:underline font-medium">
                  {athlete.coach_name}
                </Link>
              ) : (
                <span className="text-white font-medium">{athlete.coach_name}</span>
              )}
              {athlete.team_name && <span> · {athlete.team_name}</span>}
              {' '}on{' '}
              <Link to="/" className="text-green-400 hover:underline">Laktic</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
