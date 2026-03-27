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

// Phase colours for calendar pills
const PHASE_CAL: Record<string, string> = {
  base:       'bg-[var(--surface3)] text-[var(--text2)] border-[var(--border2)]',
  build:      'bg-blue-950/70 text-blue-300 border-blue-900/40',
  sharpening: 'bg-purple-950/70 text-purple-300 border-purple-900/40',
  taper:      'bg-amber-950/70 text-amber-300 border-amber-900/40',
  race:       'bg-brand-950/70 text-brand-300 border-brand-800/40',
  recovery:   'bg-[var(--surface3)] text-[var(--muted)] border-[var(--border)]',
};

type CalWorkout = {
  title: string;
  distance_miles?: number;
  pace_guideline?: string;
  description?: string;
  change_reason?: string;
  phase: string;
  dateLabel: string;
};

// ── Workout detail modal ──────────────────────────────────────────────────────
function WorkoutModal({ wo, onClose }: { wo: CalWorkout; onClose: () => void }) {
  const phaseColor: Record<string, string> = {
    base: 'text-[var(--muted)]', build: 'text-blue-400',
    sharpening: 'text-purple-400', taper: 'text-amber-400',
    race: 'text-brand-400', recovery: 'text-[var(--muted)]',
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-[var(--surface)] border border-[var(--border2)] rounded-2xl shadow-2xl p-6 fade-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors text-lg"
        >×</button>

        {/* Date + phase */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-[var(--muted)]">{wo.dateLabel}</span>
          <span className={`text-xs font-medium capitalize ${phaseColor[wo.phase] || phaseColor.base}`}>
            · {wo.phase}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-display font-bold text-lg text-[var(--text)] mb-3 leading-snug">{wo.title}</h3>

        {/* Stats row */}
        {(wo.distance_miles || wo.pace_guideline) && (
          <div className="flex gap-4 mb-4">
            {wo.distance_miles && (
              <div className="text-center">
                <div className="text-xl font-bold text-brand-400">{wo.distance_miles}</div>
                <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">miles</div>
              </div>
            )}
            {wo.pace_guideline && (
              <div className="text-center">
                <div className="text-sm font-semibold text-[var(--text2)] pt-1">{wo.pace_guideline}</div>
                <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">pace</div>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {wo.description && (
          <p className="text-sm text-[var(--muted)] leading-relaxed mb-3">{wo.description}</p>
        )}

        {/* Change reason */}
        {wo.change_reason && (
          <p className="text-xs text-[var(--muted2)] italic border-t border-[var(--border)] pt-3">
            Why adjusted: {wo.change_reason}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Monthly calendar view for the season plan ────────────────────────────────
function PlanMonthView({ plan }: { plan: any[] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<CalWorkout | null>(null);

  // Build workouts-by-date map across the whole plan
  const workoutsByDate: Record<string, CalWorkout[]> = {};
  plan.forEach((week: any) => {
    week.workouts?.forEach((wo: any) => {
      if (wo.date && wo.title) {
        if (!workoutsByDate[wo.date]) workoutsByDate[wo.date] = [];
        workoutsByDate[wo.date].push({
          title: wo.title,
          distance_miles: wo.distance_miles,
          pace_guideline: wo.pace_guideline,
          description: wo.description,
          change_reason: wo.change_reason,
          phase: week.phase || 'base',
          dateLabel: new Date(wo.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        });
      }
    });
  });

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      {selected && <WorkoutModal wo={selected} onClose={() => setSelected(null)} />}

      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors text-xl">‹</button>
          <span className="font-display font-semibold text-base text-[var(--text)]">{monthLabel}</span>
          <button onClick={nextMonth} className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors text-xl">›</button>
        </div>

        <div className="grid grid-cols-7 text-center mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-[11px] text-[var(--muted)] uppercase tracking-wide py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-[var(--border)] rounded-xl overflow-hidden">
          {cells.map((day, i) => {
            const dateKey = day
              ? `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              : '';
            const dayWorkouts = dateKey ? (workoutsByDate[dateKey] || []) : [];
            const isToday =
              day === today.getDate() &&
              viewMonth === today.getMonth() &&
              viewYear === today.getFullYear();
            const hasWorkout = dayWorkouts.length > 0;

            return (
              <div
                key={i}
                onClick={() => hasWorkout && setSelected(dayWorkouts[0])}
                className={`bg-[var(--surface2)] min-h-[88px] p-1.5 transition-colors ${
                  !day ? 'opacity-20' : hasWorkout ? 'cursor-pointer hover:bg-[var(--surface3)]' : ''
                }`}
              >
                {day && (
                  <>
                    <div className={`text-xs w-6 h-6 flex items-center justify-center rounded-full mb-1 font-medium ${
                      isToday ? 'bg-brand-500 text-white font-bold shadow-glow-sm' : 'text-[var(--muted)]'
                    }`}>{day}</div>
                    <div className="flex flex-col gap-0.5">
                      {dayWorkouts.map((wo, wi) => (
                        <div
                          key={wi}
                          className={`text-[10px] leading-tight px-1.5 py-0.5 rounded-md truncate font-medium border ${
                            PHASE_CAL[wo.phase] || PHASE_CAL.base
                          }`}
                        >
                          {wo.title}{wo.distance_miles ? ` · ${wo.distance_miles}mi` : ''}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-[10px] text-[var(--muted)]">
          {['base', 'build', 'sharpening', 'taper', 'race', 'recovery'].map(phase => (
            <span key={phase} className="flex items-center gap-1.5 capitalize">
              <span className={`inline-block w-2 h-2 rounded-sm border ${PHASE_CAL[phase]}`} />
              {phase}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Season Plan ──────────────────────────────────────────────────────────────
export function SeasonPlan() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [season, setSeason] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [planView, setPlanView] = useState<'weekly' | 'monthly'>('weekly');
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

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 fade-up gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-[var(--text)]">Season Plan</h1>
            <p className="text-sm text-[var(--muted)] mt-0.5">
              {season.coach_bots?.name} · {plan.length} weeks
              {!season.ai_used && <span className="ml-2 text-amber-400 text-xs font-medium">Template fallback</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link to="/athlete/races"><Button variant="ghost" size="sm">Races</Button></Link>
            <Link to="/athlete/chat"><Button variant="secondary" size="sm">Chat with Bot</Button></Link>
            {confirmRegen ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--muted)]">Rebuild remaining season?</span>
                <Button variant="danger" size="sm" loading={regenerating} onClick={regenerate}>Confirm</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRegen(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setConfirmRegen(true)}>↺ Regenerate</Button>
            )}
          </div>
        </div>

        {/* View toggle — centered */}
        <div className="flex justify-center mb-6 fade-up-1">
          <div className="flex items-center bg-[var(--surface2)] border border-[var(--border)] rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setPlanView('weekly')}
              className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all ${
                planView === 'weekly'
                  ? 'bg-[var(--surface3)] text-[var(--text)] shadow-sm border border-[var(--border2)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setPlanView('monthly')}
              className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all ${
                planView === 'monthly'
                  ? 'bg-[var(--surface3)] text-[var(--text)] shadow-sm border border-[var(--border2)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        {/* ── Monthly View ─────────────────────────────────────────────────── */}
        {planView === 'monthly' && (
          <div className="fade-up-1">
            <Card>
              <PlanMonthView plan={plan} />
            </Card>
          </div>
        )}

        {/* ── Weekly View ──────────────────────────────────────────────────── */}
        {planView === 'weekly' && (
          <>
            {/* Week selector */}
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
                  <h2 className="font-display font-semibold text-xl text-[var(--text)]">Week {week.week_number}</h2>
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
          </>
        )}
      </div>
    </div>
  );
}
