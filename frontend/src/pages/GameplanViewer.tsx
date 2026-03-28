import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Badge, Spinner, Card } from '../components/ui';

type PacingStrategy = {
  first_mile: string;
  middle_miles: string;
  final_mile: string;
  explanation?: string;
};

type WarmupStep = {
  step: string;
  duration?: string;
  intensity?: string;
};

type NutritionItem = {
  time_before_race: string;
  what: string;
  why?: string;
};

type Gameplan = {
  id: string;
  race_name: string;
  race_date: string;
  status: 'draft' | 'approved' | 'delivered';
  pacing_strategy: PacingStrategy;
  warmup_routine: WarmupStep[];
  nutrition_timing: NutritionItem[];
  weather_adjustments?: string;
  mental_cues?: string[];
  coach_note?: string;
};

const STATUS_BADGE: Record<string, 'gray' | 'amber' | 'green'> = {
  draft:     'amber',
  approved:  'green',
  delivered: 'green',
};

export function GameplanViewer() {
  const { id } = useParams<{ id: string }>();
  const { profile, clearAuth, role } = useAuthStore();
  const nav = useNavigate();
  const [gameplan, setGameplan] = useState<Gameplan | null>(null);
  const [loading, setLoading]   = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError]       = useState('');

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    if (!id) return;
    apiFetch(`/api/gameplans/${id}`)
      .then((data: any) => {
        // Backend stores gameplan fields nested under `gameplan` JSON column — flatten
        setGameplan({ ...data, ...(data.gameplan ?? {}) });
      })
      .catch((e: any) => setError(e?.message || 'Failed to load gameplan'))
      .finally(() => setLoading(false));
  }, [id]);

  const approve = async () => {
    if (!id) return;
    setApproving(true);
    setError('');
    try {
      const updated = await apiFetch(`/api/gameplans/${id}/approve`, { method: 'PATCH' });
      setGameplan({ ...updated, ...(updated.gameplan ?? {}) });
    } catch (e: any) {
      setError(e?.message || 'Failed to approve');
    } finally {
      setApproving(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role={role ?? 'athlete'} name={profile?.name} onLogout={logout} />

      <div className="max-w-3xl mx-auto px-6 py-10">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-sm">
            {error}
          </div>
        )}

        {!gameplan ? (
          <div className="text-center py-20 text-[var(--muted)]">Gameplan not found.</div>
        ) : (
          <div className="fade-up flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="font-display text-2xl font-bold text-[var(--text)]">{gameplan.race_name}</h1>
                  <Badge label={gameplan.status} color={STATUS_BADGE[gameplan.status] || 'gray'} />
                </div>
                <p className="text-sm text-[var(--muted)]">
                  {new Date(gameplan.race_date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </p>
              </div>
              {role === 'coach' && gameplan.status === 'draft' && (
                <Button variant="primary" onClick={approve} loading={approving}>
                  Approve &amp; Deliver
                </Button>
              )}
            </div>

            {/* Pacing Strategy */}
            {gameplan.pacing_strategy && (
              <Card title="Pacing Strategy">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[
                    { label: 'First Mile', value: gameplan.pacing_strategy.first_mile },
                    { label: 'Middle Miles', value: gameplan.pacing_strategy.middle_miles },
                    { label: 'Final Mile', value: gameplan.pacing_strategy.final_mile },
                  ].map(col => (
                    <div key={col.label} className="text-center bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-4">
                      <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1.5">{col.label}</div>
                      <div className="font-semibold text-[var(--text)] text-sm leading-snug">{col.value}</div>
                    </div>
                  ))}
                </div>
                {gameplan.pacing_strategy.explanation && (
                  <p className="text-sm text-[var(--muted)] leading-relaxed">{gameplan.pacing_strategy.explanation}</p>
                )}
              </Card>
            )}

            {/* Warmup Routine */}
            {gameplan.warmup_routine?.length > 0 && (
              <Card title="Warmup Routine">
                <ol className="flex flex-col gap-3">
                  {gameplan.warmup_routine.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-brand-950/60 border border-brand-800/40 text-brand-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-[var(--text)]">{step.step}</span>
                        {(step.duration || step.intensity) && (
                          <div className="flex gap-2 mt-0.5 text-xs text-[var(--muted)]">
                            {step.duration && <span>{step.duration}</span>}
                            {step.intensity && <span>· {step.intensity}</span>}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            {/* Nutrition Timing */}
            {gameplan.nutrition_timing?.length > 0 && (
              <Card title="Nutrition Timing">
                <div className="flex flex-col gap-3">
                  {gameplan.nutrition_timing.map((item, i) => (
                    <div key={i} className="flex items-start gap-4 py-2 border-b border-[var(--border)]/50 last:border-0">
                      <div className="text-xs font-mono font-bold text-brand-400 shrink-0 w-24 pt-0.5">
                        {item.time_before_race}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--text)]">{item.what}</div>
                        {item.why && <div className="text-xs text-[var(--muted)] mt-0.5">{item.why}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Weather Adjustments */}
            {gameplan.weather_adjustments && (
              <Card title="Weather Adjustments">
                <p className="text-sm text-[var(--muted)] leading-relaxed">{gameplan.weather_adjustments}</p>
              </Card>
            )}

            {/* Mental Cues */}
            {gameplan.mental_cues && gameplan.mental_cues.length > 0 && (
              <Card title="Mental Cues">
                <ul className="flex flex-col gap-2">
                  {gameplan.mental_cues.map((cue, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--text)]">
                      <span className="text-brand-500 font-bold shrink-0 mt-0.5">-</span>
                      {cue}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Coach Note */}
            {gameplan.coach_note && (
              <div className="border-l-4 border-brand-600 pl-4 py-2">
                <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1.5">Coach Note</div>
                <p className="text-sm text-[var(--text)] leading-relaxed italic">"{gameplan.coach_note}"</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
