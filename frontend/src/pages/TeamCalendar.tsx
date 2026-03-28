import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Input, Card, Alert, Badge } from '../components/ui';

type EventType = 'practice' | 'race' | 'off_day' | 'travel' | 'meeting' | 'other';

type CalEvent = {
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
};

type AttendanceRow = {
  athlete_id: string;
  athlete_name: string;
  record: {
    status: string;
    check_in_at: string | null;
    marked_by: string;
    notes: string | null;
  } | null;
};

type ReportAthlete = {
  athlete_id: string;
  athlete_name: string;
  records: Record<string, string>;
  present_count: number;
  total_events: number;
  attendance_pct: number | null;
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

function emptyForm(): Omit<CalEvent, 'id'> {
  return {
    title: '',
    event_type: 'practice',
    event_date: '',
    start_time: null,
    end_time: null,
    location_name: null,
    location_lat: null,
    location_lng: null,
    notes: null
  };
}

function MonthCalView({ events, onSelectEvent }: { events: CalEvent[]; onSelectEvent: (e: CalEvent) => void }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const prev = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const next = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const eventsByDate: Record<string, CalEvent[]> = {};
  events.forEach(ev => {
    if (!eventsByDate[ev.event_date]) eventsByDate[ev.event_date] = [];
    eventsByDate[ev.event_date].push(ev);
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
            <div key={i} className={`bg-[var(--surface2)] min-h-[80px] p-1.5 ${!day ? 'opacity-20' : ''}`}>
              {day && (
                <>
                  <div className={`text-xs w-6 h-6 flex items-center justify-center rounded-full mb-1 font-medium ${
                    isToday ? 'bg-brand-500 text-white font-bold shadow-glow-sm' : 'text-[var(--muted)]'
                  }`}>{day}</div>
                  <div className="flex flex-col gap-0.5">
                    {dayEvents.map(ev => (
                      <button
                        key={ev.id}
                        onClick={() => onSelectEvent(ev)}
                        className={`text-[10px] leading-tight px-1.5 py-0.5 rounded-md truncate font-medium text-left border transition-opacity hover:opacity-80 ${EVENT_COLORS[ev.event_type]}`}
                        title={ev.title}
                      >
                        {ev.title}
                      </button>
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

export function TeamCalendar() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [view, setView] = useState<'list' | 'month'>('list');
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [form, setForm] = useState(emptyForm());

  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState<string | null>(null);

  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<{ events: any[]; athletes: ReportAthlete[] } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/coach/team/calendar')
      .then(setEvents)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditingEvent(null);
    setForm(emptyForm());
    setShowForm(true);
    setSelectedEvent(null);
  };

  const openEdit = (ev: CalEvent) => {
    setEditingEvent(ev);
    setForm({
      title: ev.title,
      event_type: ev.event_type,
      event_date: ev.event_date,
      start_time: ev.start_time,
      end_time: ev.end_time,
      location_name: ev.location_name,
      location_lat: ev.location_lat,
      location_lng: ev.location_lng,
      notes: ev.notes
    });
    setShowForm(true);
    setSelectedEvent(null);
  };

  const saveEvent = async () => {
    if (!form.title || !form.event_date) { setError('Title and date are required.'); return; }
    setSaving(true); setError('');
    const body = {
      ...form,
      start_time: form.start_time || undefined,
      end_time: form.end_time || undefined,
      location_name: form.location_name || undefined,
      location_lat: form.location_lat ?? undefined,
      location_lng: form.location_lng ?? undefined,
      notes: form.notes || undefined
    };
    try {
      if (editingEvent) {
        const updated = await apiFetch(`/api/coach/team/calendar/${editingEvent.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        setEvents(prev => prev.map(e => e.id === updated.id ? updated : e).sort((a, b) => a.event_date.localeCompare(b.event_date)));
      } else {
        const created = await apiFetch('/api/coach/team/calendar', { method: 'POST', body: JSON.stringify(body) });
        setEvents(prev => [...prev, created].sort((a, b) => a.event_date.localeCompare(b.event_date)));
      }
      setShowForm(false);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const deleteEvent = async (id: string) => {
    setDeleting(id);
    try {
      await apiFetch(`/api/coach/team/calendar/${id}`, { method: 'DELETE' });
      setEvents(prev => prev.filter(e => e.id !== id));
      if (selectedEvent?.id === id) setSelectedEvent(null);
    } catch (e: any) { setError(e.message); }
    finally { setDeleting(null); }
  };

  const selectEvent = async (ev: CalEvent) => {
    setSelectedEvent(ev);
    setShowForm(false);
    setAttendanceLoading(true);
    try {
      const rows = await apiFetch(`/api/coach/team/calendar/${ev.id}/attendance`);
      setAttendance(rows);
    } catch { setAttendance([]); }
    finally { setAttendanceLoading(false); }
  };

  const markAttendance = async (eventId: string, athleteId: string, status: string) => {
    setSavingAttendance(athleteId);
    try {
      await apiFetch(`/api/coach/team/calendar/${eventId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ athlete_id: athleteId, status })
      });
      setAttendance(prev => prev.map(row =>
        row.athlete_id === athleteId
          ? { ...row, record: { status, check_in_at: null, marked_by: 'coach', notes: null } }
          : row
      ));
    } catch (e: any) { setError(e.message); }
    finally { setSavingAttendance(null); }
  };

  const loadReport = async () => {
    setReportLoading(true);
    try {
      const data = await apiFetch('/api/coach/team/attendance/report');
      setReport(data);
      setShowReport(true);
    } catch (e: any) { setError(e.message); }
    finally { setReportLoading(false); }
  };

  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="min-h-screen">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
      <div className="max-w-5xl mx-auto px-6 py-10">

        <div className="flex items-center justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-3xl font-bold text-[var(--text)]">Team Calendar</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Schedule practices, races, and team events.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={loadReport} loading={reportLoading}>Attendance Report</Button>
            <Link to="/coach/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>
            <Button size="sm" onClick={openCreate}>+ Add Event</Button>
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

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Calendar area */}
          <div className="lg:col-span-3">
            {loading ? (
              <Card><div className="text-sm text-[var(--muted)] text-center py-8">Loading…</div></Card>
            ) : view === 'month' ? (
              <Card>
                <MonthCalView events={events} onSelectEvent={selectEvent} />
                <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-[var(--border)]/60">
                  {(Object.entries(EVENT_LABELS) as [EventType, string][]).map(([type, label]) => (
                    <span key={type} className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                      <span className={`inline-block w-2 h-2 rounded-sm border ${EVENT_COLORS[type]}`} />
                      {label}
                    </span>
                  ))}
                </div>
              </Card>
            ) : (
              <Card>
                {events.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-[var(--muted)] mb-4">No events yet. Add your first team event.</p>
                    <Button onClick={openCreate}>+ Add Event</Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {events.map(ev => (
                      <div
                        key={ev.id}
                        onClick={() => selectEvent(ev)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all hover:border-[var(--border2)] ${
                          selectedEvent?.id === ev.id
                            ? 'ring-1 ring-brand-500/40 border-brand-700/50'
                            : 'border-[var(--border)] bg-[var(--surface2)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${EVENT_COLORS[ev.event_type]}`}>
                              {EVENT_LABELS[ev.event_type]}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-[var(--text)] truncate">{ev.title}</div>
                              <div className="text-xs text-[var(--muted)]">
                                {formatDate(ev.event_date)}
                                {ev.start_time && ` · ${ev.start_time}`}
                                {ev.location_name && ` · ${ev.location_name}`}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); openEdit(ev); }}>Edit</Button>
                            <Button
                              variant="ghost" size="sm"
                              className="!text-red-400"
                              loading={deleting === ev.id}
                              onClick={e => { e.stopPropagation(); deleteEvent(ev.id); }}
                            >Delete</Button>
                          </div>
                        </div>
                        {ev.notes && <div className="text-xs text-[var(--muted)] mt-1.5 italic">{ev.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Right panel: form or attendance */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {showForm && (
              <Card title={editingEvent ? 'Edit Event' : 'New Event'}>
                <div className="flex flex-col gap-3">
                  <Input label="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Thursday Practice" />
                  <div>
                    <label className="text-xs font-medium text-[var(--text2)] uppercase tracking-wide block mb-1.5">Event Type</label>
                    <select
                      value={form.event_type}
                      onChange={e => setForm(f => ({ ...f, event_type: e.target.value as EventType }))}
                      className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-brand-500/15"
                    >
                      {(Object.entries(EVENT_LABELS) as [EventType, string][]).map(([val, lbl]) => (
                        <option key={val} value={val}>{lbl}</option>
                      ))}
                    </select>
                  </div>
                  <Input label="Date" type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Start Time" type="time" value={form.start_time || ''} onChange={e => setForm(f => ({ ...f, start_time: e.target.value || null }))} />
                    <Input label="End Time" type="time" value={form.end_time || ''} onChange={e => setForm(f => ({ ...f, end_time: e.target.value || null }))} />
                  </div>
                  <Input label="Location" value={form.location_name || ''} onChange={e => setForm(f => ({ ...f, location_name: e.target.value || null }))} placeholder="e.g. High School Track" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Lat (GPS)" type="number" step="any" value={form.location_lat ?? ''} onChange={e => setForm(f => ({ ...f, location_lat: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="37.7749" />
                    <Input label="Lng (GPS)" type="number" step="any" value={form.location_lng ?? ''} onChange={e => setForm(f => ({ ...f, location_lng: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="-122.4194" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--text2)] uppercase tracking-wide block mb-1.5">Notes</label>
                    <textarea
                      value={form.notes || ''}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))}
                      rows={2}
                      placeholder="Any details for athletes…"
                      className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted2)] focus:outline-none focus:ring-2 focus:ring-brand-500/15 resize-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                    <Button size="sm" loading={saving} onClick={saveEvent}>{editingEvent ? 'Save Changes' : 'Create Event'}</Button>
                  </div>
                </div>
              </Card>
            )}

            {selectedEvent && !showForm && (
              <Card title="Attendance">
                <div className="mb-3">
                  <div className="text-sm font-semibold text-[var(--text)]">{selectedEvent.title}</div>
                  <div className="text-xs text-[var(--muted)]">{formatDate(selectedEvent.event_date)}</div>
                </div>
                {attendanceLoading ? (
                  <div className="text-sm text-[var(--muted)] text-center py-4">Loading…</div>
                ) : attendance.length === 0 ? (
                  <div className="text-sm text-[var(--muted)] text-center py-4">No athletes on your roster yet.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {attendance.map(row => (
                      <div key={row.athlete_id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[var(--surface2)] border border-[var(--border)]">
                        <div className="flex items-center gap-2 min-w-0">
                          {row.record && (
                            <Badge label={row.record.status} color={STATUS_BADGE[row.record.status] || 'gray'} dot />
                          )}
                          <span className="text-sm text-[var(--text)] truncate">{row.athlete_name}</span>
                          {row.record?.marked_by === 'gps' && (
                            <span className="text-[10px] text-brand-400">GPS</span>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {(['present', 'absent', 'excused'] as const).map(s => (
                            <button
                              key={s}
                              disabled={savingAttendance === row.athlete_id}
                              onClick={() => markAttendance(selectedEvent.id, row.athlete_id, s)}
                              className={`text-[10px] px-2 py-0.5 rounded-full border transition-all font-medium ${
                                row.record?.status === s
                                  ? s === 'present' ? 'bg-green-900/40 text-green-300 border-green-800/40'
                                    : s === 'excused' ? 'bg-zinc-700/60 text-zinc-300 border-zinc-600/40'
                                    : 'bg-red-900/40 text-red-300 border-red-800/40'
                                  : 'text-[var(--muted)] border-[var(--border)] hover:border-[var(--border2)] hover:text-[var(--text2)]'
                              }`}
                            >
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {!showForm && !selectedEvent && (
              <Card>
                <p className="text-sm text-[var(--muted)] text-center py-4">
                  Select an event to view attendance, or create a new event.
                </p>
              </Card>
            )}
          </div>
        </div>

        {/* Attendance Report Modal */}
        {showReport && report && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-16 px-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[75vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                <h2 className="font-display text-lg font-bold text-[var(--text)]">Attendance Report</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowReport(false)}>Close</Button>
              </div>
              <div className="overflow-auto flex-1 p-6">
                {report.events.length === 0 ? (
                  <p className="text-sm text-[var(--muted)] text-center py-8">No events found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[var(--muted)] text-left">
                          <th className="pb-3 pr-4 font-medium whitespace-nowrap">Athlete</th>
                          <th className="pb-3 px-2 font-medium text-center">Rate</th>
                          {report.events.map(ev => (
                            <th key={ev.id} className="pb-3 px-2 font-medium text-center whitespace-nowrap max-w-[80px]">
                              <div className="truncate max-w-[70px]" title={ev.title}>{ev.title}</div>
                              <div className="text-[10px] font-normal">{formatDate(ev.event_date).split(',')[0]}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.athletes.map(a => (
                          <tr key={a.athlete_id} className="border-t border-[var(--border)]/60">
                            <td className="py-2.5 pr-4 font-medium text-[var(--text)] whitespace-nowrap">{a.athlete_name}</td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`font-semibold ${
                                a.attendance_pct === null ? 'text-[var(--muted)]'
                                  : a.attendance_pct >= 80 ? 'text-green-400'
                                  : a.attendance_pct >= 60 ? 'text-amber-400'
                                  : 'text-red-400'
                              }`}>
                                {a.attendance_pct !== null ? `${a.attendance_pct}%` : '—'}
                              </span>
                            </td>
                            {report.events.map(ev => {
                              const status = a.records[ev.id];
                              return (
                                <td key={ev.id} className="py-2.5 px-2 text-center">
                                  {!status ? (
                                    <span className="text-[var(--muted)]">—</span>
                                  ) : status === 'present' ? (
                                    <span className="text-green-400">✓</span>
                                  ) : status === 'late' ? (
                                    <span className="text-amber-400">L</span>
                                  ) : status === 'excused' ? (
                                    <span className="text-zinc-400">E</span>
                                  ) : (
                                    <span className="text-red-400">✗</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
