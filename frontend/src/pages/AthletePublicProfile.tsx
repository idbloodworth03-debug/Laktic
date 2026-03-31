import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Badge, Spinner } from '../components/ui';
import { UserAvatar } from '../components/UserAvatar';

type PublicAthlete = {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
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

function MiniStatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl p-5">
      <span className="font-mono text-2xl font-medium text-[var(--color-text-primary)]">{value}</span>
      <span className="text-[11px] font-semibold text-[var(--color-text-tertiary)] mt-1 uppercase tracking-wider">{label}</span>
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
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  if (error || !athlete) return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[var(--color-text-secondary)] text-lg mb-4">Athlete not found</p>
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
            <UserAvatar url={athlete.avatar_url} name={athlete.name} size="lg" />
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold">{athlete.name}</h1>
              <p className="text-[var(--color-text-tertiary)] text-sm mt-0.5">@{athlete.username}</p>
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
                <div className="bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-4 py-2">
                  <div className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Mile PR</div>
                  <div className="font-mono font-medium text-[var(--color-text-primary)] mt-0.5">{athlete.pr_mile}</div>
                </div>
              )}
              {athlete.pr_5k && (
                <div className="bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-4 py-2">
                  <div className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">5K PR</div>
                  <div className="font-mono font-medium text-[var(--color-text-primary)] mt-0.5">{athlete.pr_5k}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        {athlete.public_sections.stats && athlete.stats && (
          <div className="mb-8 fade-up-1">
            <h2 className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Stats</h2>
            <div className="grid grid-cols-3 gap-3">
              <MiniStatCard label="Total Miles" value={athlete.stats.total_miles.toLocaleString()} />
              <MiniStatCard label="Activities" value={athlete.stats.activity_count.toLocaleString()} />
              <MiniStatCard label="Streak" value={`${athlete.stats.streak_days}d`} />
            </div>
          </div>
        )}

        {/* Race History */}
        {athlete.public_sections.races && athlete.races.length > 0 && (
          <div className="mb-8 fade-up-2">
            <h2 className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Race History</h2>
            <div className="flex flex-col gap-2">
              {athlete.races.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl px-4 py-3 hover:border-[var(--color-border-light)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--color-text-primary)] leading-snug">{r.race_name}</div>
                    <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                      {r.distance} · {new Date(r.race_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.is_pr && (
                      <span className="text-xs font-bold text-[var(--color-warning)] bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20 px-2 py-0.5 rounded">PR</span>
                    )}
                    <span className="font-mono font-semibold text-[var(--color-accent)]">{r.finish_time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Milestones */}
        {athlete.public_sections.milestones && athlete.milestones.length > 0 && (
          <div className="mb-8 fade-up-3">
            <h2 className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Milestones</h2>
            <div className="flex flex-wrap gap-2">
              {athlete.milestones.map((m, i) => (
                <div key={i} className="bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs">
                  <div className="font-medium text-[var(--color-text-primary)]">{m.label}</div>
                  <div className="text-[var(--color-text-tertiary)] mt-0.5">{new Date(m.earned_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coach attribution */}
        {athlete.coach_name && (
          <div className="border-t border-[var(--color-border)] pt-6 text-center fade-up-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Coached by{' '}
              {athlete.coach_username ? (
                <Link to={`/coach/${athlete.coach_username}`} className="text-[var(--color-accent)] hover:underline font-medium">
                  {athlete.coach_name}
                </Link>
              ) : (
                <span className="text-[var(--color-text-primary)] font-medium">{athlete.coach_name}</span>
              )}
              {athlete.team_name && <span> · {athlete.team_name}</span>}
              {' '}on{' '}
              <Link to="/" className="text-[var(--color-accent)] hover:underline">Laktic</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
