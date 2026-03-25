import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Input, Card, Toggle, Alert, Badge } from '../components/ui';

type Race = { name: string; date: string; is_goal_race: boolean; notes: string };
type RaceResult = {
  id: string;
  race_name: string;
  race_date: string;
  distance: string;
  finish_time: string;
  pace_per_mile: string | null;
  placement: string | null;
  is_pr: boolean;
  conditions: string | null;
  notes: string | null;
};

type ResultForm = {
  race_name: string;
  race_date: string;
  distance: string;
  finish_time: string;
  pace_per_mile: string;
  placement: string;
  is_pr: boolean;
  conditions: string;
  notes: string;
};

function emptyRace(): Race { return { name: '', date: '', is_goal_race: false, notes: '' }; }

function emptyResult(race?: Race): ResultForm {
  return {
    race_name: race?.name || '',
    race_date: race?.date || '',
    distance: '',
    finish_time: '',
    pace_per_mile: '',
    placement: '',
    is_pr: false,
    conditions: '',
    notes: ''
  };
}

function MonthView({ races, results }: { races: Race[]; results: RaceResult[] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const racesByDate: Record<string, Race[]> = {};
  races.forEach(r => {
    const key = r.date; // YYYY-MM-DD
    if (!racesByDate[key]) racesByDate[key] = [];
    racesByDate[key].push(r);
  });

  const hasResult = (race: Race) => results.some(r => r.race_name === race.name && r.race_date === race.date);

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
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="px-2 py-1 rounded hover:bg-dark-600 text-[var(--muted)] hover:text-[var(--text)] transition-colors">‹</button>
        <span className="font-medium text-sm">{monthLabel}</span>
        <button onClick={nextMonth} className="px-2 py-1 rounded hover:bg-dark-600 text-[var(--muted)] hover:text-[var(--text)] transition-colors">›</button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-[var(--muted)] mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-[var(--border)] rounded-lg overflow-hidden">
        {cells.map((day, i) => {
          const dateKey = day ? `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
          const dayRaces = dateKey ? (racesByDate[dateKey] || []) : [];
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          return (
            <div key={i} className={`bg-dark-800 min-h-[72px] p-1.5 ${!day ? 'opacity-30' : ''}`}>
              {day && (
                <>
                  <div className={`text-xs w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday ? 'bg-brand-500 text-white font-bold' : 'text-[var(--muted)]'}`}>{day}</div>
                  <div className="flex flex-col gap-0.5">
                    {dayRaces.map((race, ri) => (
                      <div key={ri} className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${race.is_goal_race ? 'bg-brand-900/60 text-brand-300' : 'bg-dark-600 text-[var(--text)]'}`} title={race.name}>
                        {race.is_goal_race && '★ '}{race.name}{hasResult(race) ? ' ✓' : ''}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-[var(--muted)]">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-brand-900/60"></span> Goal race</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-dark-600"></span> Race</span>
        <span>✓ Result logged</span>
      </div>
    </div>
  );
}

export function RaceCalendar() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [races, setRaces] = useState<Race[]>([]);
  const [results, setResults] = useState<RaceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [error, setError] = useState('');
  const [newRace, setNewRace] = useState<Race>(emptyRace());
  const [addingRace, setAddingRace] = useState(false);
  const [loggingResult, setLoggingResult] = useState<number | null>(null);
  const [resultForm, setResultForm] = useState<ResultForm>(emptyResult());
  const [savingResult, setSavingResult] = useState(false);
  const [calView, setCalView] = useState<'list' | 'month'>('list');
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    Promise.all([
      apiFetch('/api/athlete/season'),
      apiFetch('/api/athlete/races/results')
    ]).then(([seasonData, resultsData]) => {
      if (seasonData.season) setRaces(seasonData.season.race_calendar || []);
      setResults(resultsData);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const saveRaces = async (updated: Race[]) => {
    setSaving(true); setError('');
    try {
      await apiFetch('/api/athlete/season/races', { method: 'PATCH', body: JSON.stringify({ races: updated }) });
      setRaces(updated);
      setShowBanner(true);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const addRace = async () => {
    if (!newRace.name || !newRace.date) { setError('Name and date are required'); return; }
    const sorted = [...races, newRace].sort((a, b) => a.date.localeCompare(b.date));
    await saveRaces(sorted);
    setNewRace(emptyRace());
    setAddingRace(false);
  };

  const removeRace = async (idx: number) => {
    const updated = races.filter((_, i) => i !== idx);
    await saveRaces(updated);
  };

  const toggleGoal = async (idx: number) => {
    const updated = races.map((r, i) => i === idx ? { ...r, is_goal_race: !r.is_goal_race } : r);
    await saveRaces(updated);
  };

  const regenerate = async () => {
    setRegenerating(true); setError('');
    try {
      await apiFetch('/api/athlete/season/regenerate', { method: 'POST' });
      setShowBanner(false);
      nav('/athlete/plan');
    } catch (e: any) { setError(e.message); }
    finally { setRegenerating(false); }
  };

  const isPastRace = (date: string) => new Date(date + 'T23:59:59') < new Date();
  const hasResult = (race: Race) => results.some(r => r.race_name === race.name && r.race_date === race.date);

  const startLogResult = (idx: number) => {
    setLoggingResult(idx);
    setResultForm(emptyResult(races[idx]));
  };

  const saveResult = async () => {
    if (!resultForm.finish_time || !resultForm.distance) {
      setError('Finish time and distance are required');
      return;
    }
    setSavingResult(true);
    setError('');
    try {
      const newResult = await apiFetch('/api/athlete/races/results', {
        method: 'POST',
        body: JSON.stringify(resultForm)
      });
      setResults(prev => [newResult, ...prev]);
      setLoggingResult(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingResult(false);
    }
  };

  const deleteResult = async (id: string) => {
    try {
      await apiFetch(`/api/athlete/races/results/${id}`, { method: 'DELETE' });
      setResults(prev => prev.filter(r => r.id !== id));
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Race Calendar</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Goal races drive your season periodization. Non-goal races reduce volume 20%.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/athlete/progress"><Button variant="ghost" size="sm">Progress</Button></Link>
            <Link to="/athlete/plan"><Button variant="ghost" size="sm">Plan</Button></Link>
          </div>
        </div>

        {error && <Alert type="error" message={error} onClose={() => setError('')} />}

        {showBanner && (
          <Alert
            type="info"
            message="Race calendar updated. Use Regenerate Plan to rebuild your schedule around the new dates."
            onClose={() => setShowBanner(false)}
            action={<Button size="sm" onClick={regenerate} loading={regenerating}>Regenerate Plan</Button>}
          />
        )}

        <div className="flex gap-1 mt-4 mb-2">
          <button onClick={() => setCalView('list')} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${calView === 'list' ? 'bg-brand-500 text-white' : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-dark-700'}`}>List</button>
          <button onClick={() => setCalView('month')} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${calView === 'month' ? 'bg-brand-500 text-white' : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-dark-700'}`}>Month</button>
        </div>

        {calView === 'month' && (
          <Card className="mt-2">
            {loading ? <div className="text-sm text-[var(--muted)] text-center py-4">Loading...</div> : <MonthView races={races} results={results} />}
          </Card>
        )}

        {calView === 'list' && <Card className="mt-4">
          {loading ? (
            <div className="text-sm text-[var(--muted)] text-center py-4">Loading...</div>
          ) : races.length === 0 && !addingRace ? (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--muted)] mb-4">No races scheduled. Add your races to get a periodized season plan.</p>
              <Button onClick={() => setAddingRace(true)}>+ Add Your First Race</Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 mb-4">
                {races.map((race, idx) => (
                  <div key={idx} className={`p-3 rounded-lg border ${race.is_goal_race ? 'border-brand-700/50 bg-brand-900/10' : 'border-[var(--border)] bg-dark-700'}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{race.name}</span>
                          {race.is_goal_race && <span className="text-xs text-brand-400 font-medium">Goal Race</span>}
                          {hasResult(race) && <Badge label="Result Logged" color="green" />}
                        </div>
                        <div className="text-xs text-[var(--muted)] mt-0.5">{new Date(race.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        {race.notes && <div className="text-xs text-[var(--muted)] mt-0.5 italic">{race.notes}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isPastRace(race.date) && !hasResult(race) && (
                          <Button variant="secondary" size="sm" onClick={() => startLogResult(idx)}>Log Result</Button>
                        )}
                        <Toggle checked={race.is_goal_race} onChange={() => toggleGoal(idx)} label="Goal" />
                        <Button variant="ghost" size="sm" onClick={() => removeRace(idx)} className="text-red-400">Remove</Button>
                      </div>
                    </div>

                    {loggingResult === idx && (
                      <div className="border-t border-[var(--border)] mt-3 pt-3">
                        <h4 className="text-sm font-medium mb-3">Log Race Result</h4>
                        <div className="flex flex-col gap-3">
                          <div className="grid grid-cols-3 gap-3">
                            <Input label="Distance" value={resultForm.distance} onChange={e => setResultForm(f => ({ ...f, distance: e.target.value }))} placeholder="e.g. 5K" />
                            <Input label="Finish Time" value={resultForm.finish_time} onChange={e => setResultForm(f => ({ ...f, finish_time: e.target.value }))} placeholder="e.g. 18:32" />
                            <Input label="Pace/Mile" value={resultForm.pace_per_mile} onChange={e => setResultForm(f => ({ ...f, pace_per_mile: e.target.value }))} placeholder="e.g. 5:58" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <Input label="Placement" value={resultForm.placement} onChange={e => setResultForm(f => ({ ...f, placement: e.target.value }))} placeholder="e.g. 3rd overall" />
                            <Input label="Conditions" value={resultForm.conditions} onChange={e => setResultForm(f => ({ ...f, conditions: e.target.value }))} placeholder="e.g. hot, windy" />
                          </div>
                          <Input label="Notes" value={resultForm.notes} onChange={e => setResultForm(f => ({ ...f, notes: e.target.value }))} placeholder="How did it feel?" />
                          <Toggle checked={resultForm.is_pr} onChange={v => setResultForm(f => ({ ...f, is_pr: v }))} label="This is a personal record (PR)" />
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setLoggingResult(null)}>Cancel</Button>
                            <Button size="sm" loading={savingResult} onClick={saveResult}>Save Result</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {!addingRace && (
                <Button variant="ghost" size="sm" onClick={() => setAddingRace(true)}>+ Add Race</Button>
              )}
            </>
          )}

          {addingRace && (
            <div className="border-t border-[var(--border)] pt-4 mt-2">
              <h4 className="text-sm font-medium mb-3">Add Race</h4>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Race name" value={newRace.name} onChange={e => setNewRace(r => ({ ...r, name: e.target.value }))} placeholder="e.g. State Championships" />
                  <Input label="Date" type="date" value={newRace.date} onChange={e => setNewRace(r => ({ ...r, date: e.target.value }))} />
                </div>
                <Input label="Notes (optional)" value={newRace.notes} onChange={e => setNewRace(r => ({ ...r, notes: e.target.value }))} placeholder="e.g. conference meet, need to peak" />
                <Toggle checked={newRace.is_goal_race} onChange={v => setNewRace(r => ({ ...r, is_goal_race: v }))} label="This is a goal race (full taper)" />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setAddingRace(false); setNewRace(emptyRace()); }}>Cancel</Button>
                  <Button size="sm" loading={saving} onClick={addRace}>Add Race</Button>
                </div>
              </div>
            </div>
          )}
        </Card>}

        {results.length > 0 && (
          <Card title="Race Results" className="mt-6">
            <div className="flex flex-col gap-3">
              {results.map(result => (
                <div key={result.id} className="flex items-center justify-between p-3 bg-dark-700 rounded-lg border border-[var(--border)]">
                  <div className="flex items-center gap-3 min-w-0">
                    {result.is_pr && <Badge label="PR" color="amber" />}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{result.race_name}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {result.distance} - {new Date(result.race_date + 'T00:00:00').toLocaleDateString()} - {result.finish_time}
                        {result.pace_per_mile && ` (${result.pace_per_mile}/mi)`}
                        {result.placement && ` - ${result.placement}`}
                      </div>
                      {result.notes && <div className="text-xs text-[var(--muted)] mt-0.5 italic">{result.notes}</div>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteResult(result.id)} className="text-red-400 shrink-0">Delete</Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
