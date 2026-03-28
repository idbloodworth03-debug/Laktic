import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Badge, Spinner, Card, Input } from '../components/ui';

type GameplanSummary = {
  id: string;
  race_name: string;
  race_date: string;
  status: 'draft' | 'approved' | 'delivered';
};

const STATUS_BADGE: Record<string, 'gray' | 'amber' | 'green'> = {
  draft:     'amber',
  approved:  'green',
  delivered: 'green',
};

type GenerateForm = {
  race_name: string;
  race_date: string;
  distance: string;
  lat: string;
  lon: string;
};

function emptyForm(): GenerateForm {
  return { race_name: '', race_date: '', distance: '', lat: '', lon: '' };
}

function GenerateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState<GenerateForm>(emptyForm());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.race_name || !form.race_date || !form.distance) {
      setError('Race name, date and distance are required.');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        race_name: form.race_name.trim(),
        race_date: form.race_date,
        distance: form.distance.trim(),
      };
      if (form.lat) body.lat = parseFloat(form.lat);
      if (form.lon) body.lon = parseFloat(form.lon);
      const result = await apiFetch('/api/gameplans/generate', { method: 'POST', body: JSON.stringify(body) });
      onCreated(result.id);
    } catch (e: any) {
      setError(e?.message || 'Failed to generate gameplan');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-[var(--surface)] border border-[var(--border2)] rounded-2xl shadow-2xl p-6 fade-up"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors text-lg"
        >×</button>

        <h3 className="font-display font-bold text-lg mb-5">Generate Gameplan</h3>

        <div className="flex flex-col gap-3">
          <Input
            label="Race Name"
            value={form.race_name}
            onChange={e => setForm(f => ({ ...f, race_name: e.target.value }))}
            placeholder="e.g. Boston Marathon"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Race Date"
              type="date"
              value={form.race_date}
              onChange={e => setForm(f => ({ ...f, race_date: e.target.value }))}
            />
            <Input
              label="Distance"
              value={form.distance}
              onChange={e => setForm(f => ({ ...f, distance: e.target.value }))}
              placeholder="e.g. Marathon"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Latitude (optional)"
              type="number"
              step="any"
              value={form.lat}
              onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
              placeholder="e.g. 42.35"
            />
            <Input
              label="Longitude (optional)"
              type="number"
              step="any"
              value={form.lon}
              onChange={e => setForm(f => ({ ...f, lon: e.target.value }))}
              placeholder="e.g. -71.06"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 justify-end mt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" loading={generating} onClick={submit}>
              Generate
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AthleteGameplans() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [gameplans, setGameplans] = useState<GameplanSummary[]>([]);
  const [loading, setLoading]    = useState(true);
  const [error, setError]        = useState('');
  const [showGenerate, setShowGenerate] = useState(false);

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/gameplans/my')
      .then((data: GameplanSummary[]) => { setGameplans(data); })
      .catch((e: any) => setError(e?.message || 'Failed to load gameplans'))
      .finally(() => setLoading(false));
  }, []);

  const onCreated = (id: string) => {
    nav(`/athlete/gameplan/${id}`);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      {showGenerate && (
        <GenerateModal onClose={() => setShowGenerate(false)} onCreated={onCreated} />
      )}

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-3xl font-bold">Race Gameplans</h1>
            <p className="text-sm text-[var(--muted)] mt-1">AI-generated race day strategies</p>
          </div>
          <Button variant="primary" onClick={() => setShowGenerate(true)}>Generate Gameplan</Button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : gameplans.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-[var(--muted)] mb-5">No gameplans yet. Generate one for your next race.</p>
              <Button variant="primary" onClick={() => setShowGenerate(true)}>Generate Your First Gameplan</Button>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-3 fade-up-1">
            {gameplans.map(gp => (
              <Link key={gp.id} to={`/athlete/gameplan/${gp.id}`}>
                <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border2)] transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--text)]">{gp.race_name}</div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">
                      {new Date(gp.race_date + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge label={gp.status} color={STATUS_BADGE[gp.status] || 'gray'} />
                    <span className="text-[var(--muted)] text-sm">›</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
