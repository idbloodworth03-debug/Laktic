import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Card, Badge, Alert } from '../components/ui';

type EventType = 'practice' | 'race' | 'off_day' | 'travel' | 'meeting' | 'other';

type PlanWorkout = {
  date: string;
  title: string;
  distance_miles?: number;
  day_of_week: number;
  week_number: number;
};

type TeamEvent = {
  id: string;
  title: string;
  event_type: EventType;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  notes: string | null;
  my_attendance: {
    event_id: string;
    status: string;
    check_in_at: string | null;
    marked_by: string;
  } | null;
};

const EVENT_COLORS: Record<EventType, string> = {
  practice: 'bg-brand-900/40 text-brand-300 border-brand-800/40',
  race:     'bg-purple-950/60 text-purple-300 border-purple-900/40',
  off_day:  'bg-zinc-800/60 text-zinc-400 border-zinc-700/40',
  travel:   'bg-amber-950/40 text-amber-300 border-amber-800/40',
  meeting:  'bg-sky-950/40 text-sky-300 border-sky-800/40',
  other:    'bg-[var(--surface3)] text-[var(--text2)] border-[var(--border2)]'
};

const EVENT_LABELS: Record<EventType, string> = {
  practice: 'Practice',
  race:     'Race',
  off_day:  'Rest Day',
  travel:   'Travel',
  meeting:  'Meeting',
  other:    'Other'
};

const STATUS_BADGE: Record<string, 'green' | 'amber' | 'gray' | 'red'> = {
  present: 'green',
  late:    'amber',
  excused: 'gray',
  absent:  'red'
};

function MonthCalView({ events, planWorkouts = [] }: { events: TeamEvent[]; planWorkouts?: PlanWorkout[] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const prev = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const next = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const eventsByDate: Record<string, TeamEvent[]> = {};
  events.forEach(ev => {
    if (!eventsByDate[ev.event_date]) eventsByDate[ev.event_date] = [];
    eventsByDate[ev.event_date].push(ev);
  });

  const planByDate: Record<string, PlanWorkout[]> = {};
  planWorkouts.forEach(wo => {
    if (!planByDate[wo.date]) planByDate[wo.date] = [];
    planByDate[wo.date].push(wo);
  });

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prev} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors text-lg">‹</button>
        <span className="font-display font-semibold text-sm text-[var(--text)]">{monthLabel}</span>
        <button onClick={next} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors text-lg">›</button>
      </div>
      <div className="grid grid-cols-7 text-center mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-[10px] text-[var(--muted)] uppercase tracking-wide py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-[var(--border)] rounded-xl overflow-hidden">
        {cells.map((day, i) => {
          const dateKey = day
            ? `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            : '';
          const dayEvents = dateKey ? (eventsByDate[dateKey] || []) : [];
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          return (
            <div key={i} className={`bg-[var(--surface2)] min-h-[72px] p-1.5 ${!day ? 'opacity-20' : ''}`}>
              {day && (
                <>
                  <div className={`text-xs w-6 h-6 flex items-center justify-center rounded-full mb-1 font-medium ${
                    isToday ? 'bg-brand-500 text-white font-bold shadow-glow-sm' : 'text-[var(--muted)]'
                  }`}>{day}</div>
                  <div className="flex flex-col gap-0.5">
                    {dayEvents.map(ev => (
                      <div
                        key={ev.id}
                        className={`text-[10px] leading-tight px-1.5 py-0.5 rounded-md truncate font-medium border ${EVENT_COLORS[ev.event_type]}`}
                        title={ev.title}
                      >
                        {ev.my_attendance?.status === 'present' && '✓ '}
                        {ev.title}
                      </div>
                    ))}
                    {(planByDate[dateKey] || []).map((wo, wi) => (
                      <a
                        key={`plan-${wi}`}
                        href="/athlete/plan"
                        className="block text-[10px] leading-tight px-1.5 py-0.5 rounded-md truncate font-medium border"
                        style={{ background: 'rgba(0,229,160,0.08)', color: '#00E5A0', borderColor: 'rgba(0,229,160,0.25)' }}
                        title={`${wo.title}${wo.distance_miles ? ` · ${wo.distance_miles}mi` : ''}`}
                      >
                        {wo.title}{wo.distance_miles ? ` · ${wo.distance_miles}mi` : ''}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AthleteCalendar() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [planWorkouts, setPlanWorkouts] = useState<PlanWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'month'>('list');
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [checkInMsg, setCheckInMsg] = useState<{ eventId: string; msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/athlete/calendar/team'),
      apiFetch('/api/athlete/season').catch(() => ({ season: null }))
    ])
      .then(([eventsData, seasonData]) => {
        setEvents(eventsData);
        if (seasonData?.season?.season_plan) {
          const workouts: PlanWorkout[] = [];
          for (const week of seasonData.season.season_plan) {
            for (const wo of (week.workouts || [])) {
              if (wo.date && (wo.distance_miles > 0 || wo.title)) {
                workouts.push({ ...wo, week_number: week.week_number });
              }
            }
          }
          setPlanWorkouts(workouts);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const isToday = (dateStr: string) => {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
    return dateStr === today;
  };

  const isFutureOrToday = (dateStr: string) => {
    const d = new Date(dateStr + 'T23:59:59');
    return d >= new Date();
  };

  const checkIn = async (ev: TeamEvent) => {
    if (!navigator.geolocation) {
      setCheckInMsg({ eventId: ev.id, msg: 'Geolocation is not supported by your browser.', ok: false });
      return;
    }
    setCheckingIn(ev.id);
    setCheckInMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await apiFetch(`/api/athlete/calendar/${ev.id}/checkin`, {
            method: 'POST',
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          });
          setCheckInMsg({ eventId: ev.id, msg: 'Checked in successfully!', ok: true });
          setEvents(prev => prev.map(e =>
            e.id === ev.id
              ? { ...e, my_attendance: { event_id: e.id, status: 'present', check_in_at: new Date().toISOString(), marked_by: ev.location_lat ? 'gps' : 'self' } }
              : e
          ));
        } catch (e: any) {
          setCheckInMsg({ eventId: ev.id, msg: e.message, ok: false });
        } finally {
          setCheckingIn(null);
        }
      },
      (err) => {
        setCheckingIn(null);
        setCheckInMsg({ eventId: ev.id, msg: `Location error: ${err.message}`, ok: false });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const downloadIcal = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
      const res = await fetch(`${BASE}/api/athlete/calendar/export.ics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'laktic-calendar.ics';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const upcomingEvents = events.filter(e => isFutureOrToday(e.event_date));
  const pastEvents = events.filter(e => !isFutureOrToday(e.event_date));

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="max-w-3xl mx-auto px-6 py-10">

        <div className="flex items-center justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-3xl font-bold text-[var(--text)]">Team Calendar</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Your team's schedule — practices, races, and events.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={downloadIcal}>Export .ics</Button>
            <Link to="/athlete/races"><Button variant="ghost" size="sm">My Races</Button></Link>
          </div>
        </div>

        {error && <Alert type="error" message={error} onClose={() => setError('')} />}

        <div className="flex gap-1 mb-4 p-1 bg-[var(--surface2)] rounded-lg w-fit border border-[var(--border)]">
          {(['list', 'month'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 text-sm rounded-md font-medium transition-all capitalize ${
                view === v
                  ? 'bg-[var(--surface3)] text-[var(--text)] border border-[var(--border2)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--text2)]'
              }`}>{v}</button>
          ))}
        </div>

        {loading ? (
          <Card><div className="text-sm text-[var(--muted)] text-center py-8">Loading…</div></Card>
        ) : events.length === 0 ? (
          <Card>
            <div className="text-center py-10">
              <p className="text-sm text-[var(--muted)] mb-2">No team events scheduled yet.</p>
              <p className="text-xs text-[var(--muted)]">Your coach will post practices and races here.</p>
            </div>
          </Card>
        ) : view === 'month' ? (
          <Card>
            <MonthCalView events={events} planWorkouts={planWorkouts} />
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-[var(--border)]/60">
              {(Object.entries(EVENT_LABELS) as [EventType, string][]).map(([type, label]) => (
                <span key={type} className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                  <span className={`inline-block w-2 h-2 rounded-sm border ${EVENT_COLORS[type]}`} />
                  {label}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">✓ Checked in</span>
            </div>
          </Card>
        ) : (
          <>
            {upcomingEvents.length > 0 && (
              <Card title="Upcoming" className="mb-4">
                <div className="flex flex-col gap-2.5">
                  {upcomingEvents.map(ev => (
                    <div key={ev.id} className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface2)] hover:border-[var(--border2)] transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${EVENT_COLORS[ev.event_type]}`}>
                              {EVENT_LABELS[ev.event_type]}
                            </span>
                            <span className="font-medium text-sm text-[var(--text)]">{ev.title}</span>
                            {ev.my_attendance && (
                              <Badge label={ev.my_attendance.status} color={STATUS_BADGE[ev.my_attendance.status] || 'gray'} dot />
                            )}
                            {isToday(ev.event_date) && (
                              <span className="text-[10px] font-semibold text-brand-400 bg-brand-900/30 px-2 py-0.5 rounded-full border border-brand-800/40">Today</span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--muted)]">
                            {formatDate(ev.event_date)}
                            {ev.start_time && ` · ${ev.start_time}`}
                            {ev.end_time && `–${ev.end_time}`}
                            {ev.location_name && ` · ${ev.location_name}`}
                          </div>
                          {ev.notes && <div className="text-xs text-[var(--muted)] mt-1 italic">{ev.notes}</div>}
                        </div>
                        {ev.event_type === 'practice' && !ev.my_attendance && isToday(ev.event_date) && (
                          <Button
                            size="sm"
                            loading={checkingIn === ev.id}
                            onClick={() => checkIn(ev)}
                          >
                            Check In
                          </Button>
                        )}
                        {ev.my_attendance?.status === 'present' && (
                          <span className="text-xs text-[#00E5A0] font-medium shrink-0">✓ Present</span>
                        )}
                      </div>
                      {checkInMsg?.eventId === ev.id && (
                        <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg ${
                          checkInMsg.ok
                            ? 'bg-[rgba(0,229,160,0.07)] text-[#00E5A0] border border-[rgba(0,229,160,0.22)]'
                            : 'bg-red-900/30 text-red-300 border border-red-800/40'
                        }`}>
                          {checkInMsg.msg}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {planWorkouts.filter(wo => isFutureOrToday(wo.date)).length > 0 && (
              <Card title="Upcoming Workouts" className="mb-4">
                <div className="flex flex-col gap-2">
                  {planWorkouts.filter(wo => isFutureOrToday(wo.date)).slice(0, 14).map((wo, i) => (
                    <a key={i} href="/athlete/plan" className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface2)] hover:border-[var(--border2)] transition-colors no-underline">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border" style={{ background: 'rgba(0,229,160,0.08)', color: '#00E5A0', borderColor: 'rgba(0,229,160,0.25)' }}>
                          Plan
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text)] truncate">{wo.title}</div>
                          <div className="text-xs text-[var(--muted)]">{formatDate(wo.date)}{wo.distance_miles ? ` · ${wo.distance_miles}mi` : ''}</div>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </Card>
            )}

            {pastEvents.length > 0 && (
              <Card title="Past Events">
                <div className="flex flex-col gap-2">
                  {pastEvents.slice(-10).reverse().map(ev => (
                    <div key={ev.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface2)] opacity-70">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${EVENT_COLORS[ev.event_type]}`}>
                          {EVENT_LABELS[ev.event_type]}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text)] truncate">{ev.title}</div>
                          <div className="text-xs text-[var(--muted)]">{formatDate(ev.event_date)}</div>
                        </div>
                      </div>
                      {ev.my_attendance ? (
                        <Badge label={ev.my_attendance.status} color={STATUS_BADGE[ev.my_attendance.status] || 'gray'} dot />
                      ) : (
                        <span className="text-xs text-[var(--muted)]">No record</span>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
    </AppLayout>
  );
}
