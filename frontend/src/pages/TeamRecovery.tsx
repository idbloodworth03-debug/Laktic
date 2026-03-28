import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Badge, Spinner, Card } from '../components/ui';

type RecoveryEntry = {
  athlete_id: string;
  athlete_name: string;
  readiness_score: number;
  recommended_intensity: string;
  explanation: string;
  computed_at: string;
};

function scoreColor(score: number): string {
  if (score <= 40) return 'text-red-400';
  if (score <= 60) return 'text-amber-400';
  if (score <= 80) return 'text-amber-300';
  return 'text-green-400';
}

function cardBg(score: number): string {
  if (score <= 40) return 'bg-red-950/40 border-red-800/40';
  if (score <= 60) return 'bg-amber-950/40 border-amber-800/40';
  if (score <= 80) return 'bg-amber-950/20 border-amber-800/30';
  return 'bg-brand-950/40 border-brand-800/40';
}

function intensityBadgeColor(intensity: string): 'green' | 'amber' | 'red' | 'blue' {
  const lower = intensity?.toLowerCase() || '';
  if (lower === 'rest') return 'red';
  if (lower === 'easy') return 'amber';
  if (lower === 'hard' || lower === 'race') return 'blue';
  return 'green';
}

function summarize(athletes: RecoveryEntry[]) {
  const hard    = athletes.filter(a => a.readiness_score > 80).length;
  const easy    = athletes.filter(a => a.readiness_score > 40 && a.readiness_score <= 80).length;
  const rest    = athletes.filter(a => a.readiness_score <= 40).length;
  return { hard, easy, rest };
}

export function TeamRecovery() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [athletes, setAthletes] = useState<RecoveryEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState('');

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const load = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    apiFetch('/api/recovery/team')
      .then((data: RecoveryEntry[]) => { setAthletes(data); setError(''); })
      .catch((e: any) => setError(e?.message || 'Failed to load team recovery'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { load(); }, []);

  const { hard, easy, rest } = summarize(athletes);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-3xl font-bold">Team Recovery</h1>
            {athletes.length > 0 && (
              <p className="text-sm text-[var(--muted)] mt-1">
                {hard > 0 && <span className="text-green-400 font-medium">{hard} ready for hard session</span>}
                {hard > 0 && (easy > 0 || rest > 0) && <span className="mx-2 text-[var(--muted)]">·</span>}
                {easy > 0 && <span className="text-amber-400 font-medium">{easy} should go easy</span>}
                {easy > 0 && rest > 0 && <span className="mx-2 text-[var(--muted)]">·</span>}
                {rest > 0 && <span className="text-red-400 font-medium">{rest} need rest</span>}
              </p>
            )}
          </div>
          <Button variant="secondary" onClick={() => load(true)} loading={refreshing}>
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : athletes.length === 0 ? (
          <Card>
            <div className="text-center py-10">
              <p className="text-[var(--muted)]">No recovery data yet. Click Recompute All to generate scores.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 fade-up-1">
            {athletes.map(a => (
              <div
                key={a.athlete_id}
                className={`rounded-xl border p-5 ${cardBg(a.readiness_score)}`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="font-medium text-[var(--text)] leading-snug">{a.athlete_name}</div>
                  {a.recommended_intensity && (
                    <Badge
                      label={a.recommended_intensity}
                      color={intensityBadgeColor(a.recommended_intensity)}
                    />
                  )}
                </div>
                <div className={`font-display text-4xl font-bold mb-2 ${scoreColor(a.readiness_score)}`}>
                  {a.readiness_score}
                </div>
                {a.explanation && (
                  <p className="text-xs text-[var(--muted)] leading-relaxed line-clamp-2">{a.explanation}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
