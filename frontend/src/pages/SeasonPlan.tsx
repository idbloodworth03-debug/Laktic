import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Badge, Spinner } from '../components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PHASE_COLORS: Record<string, string> = {
  base: 'gray', build: 'blue', sharpening: 'purple',
  taper: 'amber', race: 'green', recovery: 'gray'
};

const PHASE_PILL: Record<string, string> = {
  base:       'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]',
  build:      'border-blue-800/50 text-blue-400 hover:text-blue-300',
  sharpening: 'border-purple-800/50 text-purple-400 hover:text-purple-300',
  taper:      'border-amber-800/50 text-amber-400 hover:text-amber-300',
  race:       'border-brand-700/50 text-brand-400 hover:text-brand-300',
  recovery:   'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]',
};

const PHASE_PILL_ACTIVE: Record<string, string> = {
  base:       'bg-[var(--surface3)] border-[var(--border2)] text-[var(--text)]',
  build:      'bg-blue-950/50 border-blue-800/60 text-blue-300',
  sharpening: 'bg-purple-950/50 border-purple-800/60 text-purple-300',
  taper:      'bg-amber-950/50 border-amber-800/60 text-amber-300',
  race:       'bg-brand-950/60 border-brand-800/60 text-brand-300',
  recovery:   'bg-[var(--surface3)] border-[var(--border2)] text-[var(--text)]',
};

export function SeasonPlan() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [season, setSeason] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/athlete/season').then(({ season }) => {
      setSeason(season);
      if (season?.season_plan?.length) {
        const today = new Date().toISOString().split('T')[0];
        const idx = season.season_plan.findIndex((w: any) => w.week_start_date <= today && (
          !season.season_plan[season.season_plan.indexOf(w) + 1] ||
          season.season_plan[season.season_plan.indexOf(w) + 1].week_start_date > today
        ));
        setCurrentWeek(Math.max(0, idx));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const regenerate = async () => {
    setRegenerating(true); setConfirmRegen(false);
    try {
      await apiFetch('/api/athlete/season/regenerate', { method: 'POST' });
      const { season: updated } = await apiFetch('/api/athlete/season');
      setSeason(updated);
    } catch (e: any) { console.error(e); }
    finally { setRegenerating(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;

  if (!season) return (
    <div className="min-h-screen">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <h1 className="font-display text-xl font-bold mb-2">No active season</h1>
        <p className="text-[var(--muted)] mb-5 leading-relaxed">Subscribe to a coach bot to get your personalized training plan.</p>
        <Link to="/athlete/browse"><Button>Browse Coach Bots →</Button></Link>
      </div>
    </div>
  );

  const plan = season.season_plan || [];
  const week = plan[currentWeek];

  return (
    <div className="min-h-screen">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text)]">Season Plan</h1>
            <p className="text-sm text-[var(--muted)] mt-0.5">
              {season.coach_bots?.name} · {plan.length} weeks
              {!season.ai_used && <span className="ml-2 text-amber-400 text-xs font-medium">Template fallback</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/athlete/races"><Button variant="ghost" size="sm">Races</Button></Link>
            <Link to="/athlete/chat"><Button variant="secondary" size="sm">Chat with Bot</Button></Link>
            {confirmRegen ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--muted)]">Rebuild remaining season?</span>
                <Button variant="danger" size="sm" loading={regenerating} onClick={regenerate}>Confirm</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRegen(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setConfirmRegen(true)}>↺ Regenerate Plan</Button>
            )}
          </div>
        </div>

        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-2 fade-up-1">
          {plan.map((w: any, i: number) => {
            const isToday = new Date().toISOString().split('T')[0] >= w.week_start_date &&
              (i === plan.length - 1 || new Date().toISOString().split('T')[0] < plan[i + 1]?.week_start_date);
            const phase = w.phase || 'base';
            const isActive = i === currentWeek;
            return (
              <button key={i} onClick={() => setCurrentWeek(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 border ${
                  isActive
                    ? PHASE_PILL_ACTIVE[phase] || PHASE_PILL_ACTIVE.base
                    : isToday
                    ? 'border-brand-700/40 text-brand-400 bg-brand-950/30'
                    : PHASE_PILL[phase] || PHASE_PILL.base
                }`}>
                Wk {w.week_number}
                {isToday && ' ●'}
              </button>
            );
          })}
        </div>

        {week && (
          <div className="fade-up-2">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-display font-semibold text-lg text-[var(--text)]">Week {week.week_number}</h2>
              <Badge label={week.phase || 'base'} color={PHASE_COLORS[week.phase] as any || 'gray'} />
              <span className="text-sm text-[var(--muted)]">
                {new Date(week.week_start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <div className="ml-auto flex gap-1.5">
                <Button variant="ghost" size="sm" disabled={currentWeek === 0} onClick={() => setCurrentWeek(w => w - 1)}>← Prev</Button>
                <Button variant="ghost" size="sm" disabled={currentWeek === plan.length - 1} onClick={() => setCurrentWeek(w => w + 1)}>Next →</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {DAYS.map((dayLabel, i) => {
                const wo = week.workouts?.find((w: any) => w.day_of_week === i + 1);
                const key = `${week.week_number}-${i + 1}`;
                const expanded = expandedWorkout === key;
                return (
                  <div
                    key={i}
                    onClick={() => wo && setExpandedWorkout(expanded ? null : key)}
                    className={`rounded-xl border p-4 transition-all ${
                      wo
                        ? `border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border2)] cursor-pointer ${expanded ? 'col-span-1 sm:col-span-2' : ''}`
                        : 'border-dashed border-[var(--border)] opacity-35'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">{dayLabel}</span>
                      {wo?.date && (
                        <span className="text-xs text-[var(--muted2)]">
                          {new Date(wo.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                    {wo ? (
                      <>
                        <div className="font-medium text-sm mb-1.5 text-[var(--text)]">{wo.title}</div>
                        <div className="flex gap-2 flex-wrap">
                          {wo.distance_miles && <span className="text-xs text-brand-400 font-medium">{wo.distance_miles}mi</span>}
                          {wo.pace_guideline && <span className="text-xs text-[var(--muted)]">{wo.pace_guideline}</span>}
                        </div>
                        {expanded && (
                          <div className="mt-3 pt-3 border-t border-[var(--border)]/70">
                            <p className="text-sm text-[var(--muted)] leading-relaxed mb-2">{wo.description}</p>
                            {wo.change_reason && (
                              <p className="text-xs text-[var(--muted2)] italic">Why: {wo.change_reason}</p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-[var(--muted2)]">Rest</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-5 text-sm text-[var(--muted)]">
              <span>
                Total:{' '}
                <strong className="text-[var(--text)] font-semibold">
                  {week.workouts?.reduce((sum: number, w: any) => sum + (w.distance_miles || 0), 0).toFixed(1)}mi
                </strong>
              </span>
              <span>{week.workouts?.filter((w: any) => w.title).length} workouts</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
