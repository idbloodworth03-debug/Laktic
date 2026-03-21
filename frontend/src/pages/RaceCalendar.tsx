import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Input, Card, Toggle, Alert } from '../components/ui';

type Race = { name: string; date: string; is_goal_race: boolean; notes: string };

function emptyRace(): Race { return { name: '', date: '', is_goal_race: false, notes: '' }; }

export function RaceCalendar() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [error, setError] = useState('');
  const [newRace, setNewRace] = useState<Race>(emptyRace());
  const [addingRace, setAddingRace] = useState(false);
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/athlete/season').then(({ season }) => {
      if (season) setRaces(season.race_calendar || []);
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
            <Link to="/athlete/plan"><Button variant="ghost" size="sm">← Plan</Button></Link>
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

        <Card className="mt-4">
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
                  <div key={idx} className={`flex items-center justify-between gap-4 p-3 rounded-lg border ${race.is_goal_race ? 'border-brand-700/50 bg-brand-900/10' : 'border-[var(--border)] bg-dark-700'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{race.name}</span>
                        {race.is_goal_race && <span className="text-xs text-brand-400 font-medium">★ Goal Race</span>}
                      </div>
                      <div className="text-xs text-[var(--muted)] mt-0.5">{new Date(race.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      {race.notes && <div className="text-xs text-[var(--muted)] mt-0.5 italic">{race.notes}</div>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Toggle checked={race.is_goal_race} onChange={() => toggleGoal(idx)} label="Goal" />
                      <Button variant="ghost" size="sm" onClick={() => removeRace(idx)} className="text-red-400">Remove</Button>
                    </div>
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
        </Card>
      </div>
    </div>
  );
}
