import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Spinner, EmptyState, Badge } from '../components/ui';

type LeaderboardEntry = {
  rank: number;
  athlete_id: string;
  name: string;
  weekly_miles: number;
  streak_days: number;
};

function getMondayDate(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysToMonday);
  return monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function TeamLeaderboard() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/athlete/team/leaderboard')
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const weekStart = getMondayDate();
  const myEntry = entries.find(e => e.name === profile?.name);

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <div className="mb-6 fade-up">
            <h1 className="text-3xl font-bold">Team Leaderboard</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              Week of {weekStart} · Resets every Monday
            </p>
          </div>

          {myEntry && (
            <div className="bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/20 rounded-xl px-4 py-3 mb-6 flex items-center gap-4">
              <div className="font-mono text-2xl font-medium text-[var(--color-accent)]">#{myEntry.rank}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Your position this week</p>
                <p className="text-xs text-[var(--color-text-tertiary)] font-mono">{myEntry.weekly_miles} mi · {myEntry.streak_days} day streak</p>
              </div>
              <Link to="/athlete/feed" className="text-xs text-[var(--color-accent)] hover:underline shrink-0">View feed</Link>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : entries.length === 0 ? (
            <EmptyState
              title="No team data yet"
              message="Join a team and start logging activities to see the leaderboard."
            />
          ) : (
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 px-4 py-2 border-b border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                <div className="col-span-1">#</div>
                <div className="col-span-5">Athlete</div>
                <div className="col-span-3 text-right">Miles</div>
                <div className="col-span-3 text-right">Streak</div>
              </div>
              {entries.map(entry => {
                const isMe = entry.name === profile?.name;
                return (
                  <div
                    key={entry.athlete_id}
                    className={`grid grid-cols-12 px-4 py-3 items-center border-b border-[var(--color-border)]/50 last:border-0 transition-colors ${
                      isMe ? 'bg-[var(--color-accent-dim)]' : 'hover:bg-[var(--color-bg-tertiary)]'
                    }`}
                  >
                    <div className="col-span-1 font-mono text-sm font-medium text-[var(--color-text-tertiary)]">
                      {entry.rank}
                    </div>
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={isMe
                          ? { background: 'var(--color-accent-dim)', color: 'var(--color-accent)', border: '1px solid rgba(0,229,160,0.3)' }
                          : { background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }
                        }
                      >
                        {entry.name.charAt(0).toUpperCase()}
                      </div>
                      <span className={`text-sm font-medium truncate ${isMe ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'}`}>
                        {entry.name}
                      </span>
                      {isMe && <Badge label="You" color="green" />}
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="font-mono text-sm font-medium text-[var(--color-text-primary)]">{entry.weekly_miles}</span>
                      <span className="text-xs text-[var(--color-text-tertiary)] ml-1">mi</span>
                    </div>
                    <div className="col-span-3 text-right">
                      {entry.streak_days > 0 ? (
                        <span className="font-mono text-sm font-medium text-[var(--color-warning)]">
                          {entry.streak_days}d
                        </span>
                      ) : (
                        <span className="text-sm text-[var(--color-text-tertiary)]">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-[var(--color-text-tertiary)] text-center mt-4">
            Miles counted from activities synced via Strava this week.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
