import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Badge, Spinner, Card } from '../components/ui';

type RecoveryEntry = {
  athlete_id: string;
  athlete_name: string;
  readiness_score: number;
  recommended_intensity: string;
  explanation: string;
  computed_at: string;
};

function scoreColor(score: number): string {
  if (score <= 40) return 'var(--color-danger)';
  if (score <= 60) return 'var(--color-warning)';
  if (score <= 80) return '#FCD34D';
  return 'var(--color-accent)';
}

function cardStyle(score: number): React.CSSProperties {
  if (score <= 40) return { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' };
  if (score <= 60) return { background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' };
  if (score <= 80) return { background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' };
  return { background: 'var(--color-accent-dim)', border: '1px solid rgba(0,229,160,0.2)' };
}

function intensityBadgeColor(intensity: string): 'green' | 'amber' | 'red' | 'blue' {
  const lower = intensity?.toLowerCase() || '';
  if (lower === 'rest') return 'red';
  if (lower === 'easy') return 'amber';
  if (lower === 'hard' || lower === 'race') return 'blue';
  return 'green';
}

function summarize(athletes: RecoveryEntry[]) {
  const hard = athletes.filter(a => a.readiness_score > 80).length;
  const easy = athletes.filter(a => a.readiness_score > 40 && a.readiness_score <= 80).length;
  const rest = athletes.filter(a => a.readiness_score <= 40).length;
  return { hard, easy, rest };
}

export function TeamRecovery() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [athletes, setAthletes] = useState<RecoveryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

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
    <AppLayout role="coach" name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 fade-up gap-3">
            <div>
              <h1 className="text-3xl font-bold">Team Recovery</h1>
              {athletes.length > 0 && (
                <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
                  {hard > 0 && <span className="text-[var(--color-accent)] font-medium">{hard} ready for hard session</span>}
                  {hard > 0 && (easy > 0 || rest > 0) && <span className="mx-2 text-[var(--color-text-tertiary)]">·</span>}
                  {easy > 0 && <span className="text-[var(--color-warning)] font-medium">{easy} should go easy</span>}
                  {easy > 0 && rest > 0 && <span className="mx-2 text-[var(--color-text-tertiary)]">·</span>}
                  {rest > 0 && <span className="text-[var(--color-danger)] font-medium">{rest} need rest</span>}
                </p>
              )}
            </div>
            <Button variant="secondary" onClick={() => load(true)} loading={refreshing}>
              Refresh
            </Button>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : athletes.length === 0 ? (
            <Card>
              <div className="text-center py-10">
                <p className="text-[var(--color-text-tertiary)]">No recovery data yet. Click Refresh to load scores.</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 fade-up-1">
              {athletes.map(a => (
                <div
                  key={a.athlete_id}
                  className="rounded-xl p-5"
                  style={cardStyle(a.readiness_score)}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="font-medium text-[var(--color-text-primary)] leading-snug">{a.athlete_name}</div>
                    {a.recommended_intensity && (
                      <Badge
                        label={a.recommended_intensity}
                        color={intensityBadgeColor(a.recommended_intensity)}
                      />
                    )}
                  </div>
                  <div className="font-mono text-4xl font-medium mb-2" style={{ color: scoreColor(a.readiness_score) }}>
                    {a.readiness_score}
                  </div>
                  {a.explanation && (
                    <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed line-clamp-2">{a.explanation}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
