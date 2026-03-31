import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { AppLayout, Card, Button, Input, Textarea, Alert, Spinner, Badge } from '../components/ui';
import { supabase } from '../lib/supabaseClient';

type BodyMetrics = {
  weight_kg: number | null;
  height_cm: number | null;
  sweat_rate_ml_per_hr: number | null;
};

type FuelEntry = {
  id: string;
  logged_at: string;
  calories: number | null;
  carbs_g: number | null;
  protein_g: number | null;
  hydration_ml: number | null;
  notes: string | null;
};

type WeatherData = {
  temp_c: number;
  windspeed_kmh: number;
  description: string;
  location_name: string | null;
};

type FuelRecommendation = {
  duration_min: number;
  temp_c: number | null;
  heat_multiplier: number;
  hydration_ml: number;
  cals_burned: number;
  post_run: {
    calories: number;
    carbs_g: number;
    protein_g: number;
    window_minutes: number;
    tip: string;
  };
};

type Tab = 'metrics' | 'log' | 'calculator';

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', weekday: 'short'
  });
}

export function NutritionPage() {
  const { role, profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('metrics');
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  // Body metrics
  const [metrics, setMetrics] = useState<BodyMetrics>({ weight_kg: null, height_cm: null, sweat_rate_ml_per_hr: null });
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsSaving, setMetricsSaving] = useState(false);

  // Fuel log
  const [fuelLog, setFuelLog] = useState<FuelEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({
    logged_at: new Date().toISOString().slice(0, 10),
    calories: '',
    carbs_g: '',
    protein_g: '',
    hydration_ml: '',
    notes: ''
  });
  const [addingEntry, setAddingEntry] = useState(false);

  // Calculator
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [durationHours, setDurationHours] = useState('0');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [customTempC, setCustomTempC] = useState('');
  const [recommendation, setRecommendation] = useState<FuelRecommendation | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  useEffect(() => {
    if (!role) { nav('/'); return; }
    loadMetrics();
  }, []);

  useEffect(() => {
    if (tab === 'log' && fuelLog.length === 0) loadFuelLog();
    if (tab === 'calculator' && !weather) loadWeather();
  }, [tab]);

  async function loadMetrics() {
    setMetricsLoading(true);
    try {
      const data = await apiFetch('/api/athlete/body-metrics');
      if (data) setMetrics(data);
    } catch {
      // no metrics yet — fine
    } finally {
      setMetricsLoading(false);
    }
  }

  async function saveMetrics() {
    setMetricsSaving(true);
    try {
      const payload: Partial<BodyMetrics> = {};
      if (metrics.weight_kg != null) payload.weight_kg = metrics.weight_kg;
      if (metrics.height_cm != null) payload.height_cm = metrics.height_cm;
      if (metrics.sweat_rate_ml_per_hr != null) payload.sweat_rate_ml_per_hr = metrics.sweat_rate_ml_per_hr;
      await apiFetch('/api/athlete/body-metrics', { method: 'PUT', body: JSON.stringify(payload) });
      setAlert({ type: 'success', message: 'Body metrics saved.' });
    } catch (e: any) {
      setAlert({ type: 'error', message: e.message || 'Failed to save.' });
    } finally {
      setMetricsSaving(false);
    }
  }

  async function loadFuelLog() {
    setLogLoading(true);
    try {
      const data = await apiFetch('/api/athlete/fuel-log?days=30');
      setFuelLog(data);
    } catch {
      setFuelLog([]);
    } finally {
      setLogLoading(false);
    }
  }

  async function addFuelEntry() {
    setAddingEntry(true);
    try {
      const body: any = { logged_at: newEntry.logged_at };
      if (newEntry.calories) body.calories = parseInt(newEntry.calories);
      if (newEntry.carbs_g) body.carbs_g = parseFloat(newEntry.carbs_g);
      if (newEntry.protein_g) body.protein_g = parseFloat(newEntry.protein_g);
      if (newEntry.hydration_ml) body.hydration_ml = parseInt(newEntry.hydration_ml);
      if (newEntry.notes.trim()) body.notes = newEntry.notes.trim();

      const entry = await apiFetch('/api/athlete/fuel-log', { method: 'POST', body: JSON.stringify(body) });
      setFuelLog(prev => [entry, ...prev]);
      setNewEntry({ logged_at: new Date().toISOString().slice(0, 10), calories: '', carbs_g: '', protein_g: '', hydration_ml: '', notes: '' });
      setShowAddEntry(false);
      setAlert({ type: 'success', message: 'Entry logged.' });
    } catch (e: any) {
      setAlert({ type: 'error', message: e.message || 'Failed to add entry.' });
    } finally {
      setAddingEntry(false);
    }
  }

  async function deleteEntry(id: string) {
    try {
      await apiFetch(`/api/athlete/fuel-log/${id}`, { method: 'DELETE' });
      setFuelLog(prev => prev.filter(e => e.id !== id));
    } catch (e: any) {
      setAlert({ type: 'error', message: e.message || 'Failed to delete.' });
    }
  }

  async function loadWeather() {
    setWeatherLoading(true);
    try {
      const data = await apiFetch('/api/athlete/weather');
      setWeather(data);
    } catch {
      setWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  }

  async function runCalculator() {
    const dur = parseInt(durationHours) * 60 + parseInt(durationMinutes || '0');
    if (!dur || dur < 1) {
      setAlert({ type: 'error', message: 'Enter a valid duration.' });
      return;
    }
    setCalcLoading(true);
    try {
      const tempParam = customTempC !== '' ? `&temp_c=${customTempC}` : (weather ? `&temp_c=${weather.temp_c}` : '');
      const rec = await apiFetch(`/api/athlete/fueling-calculator?duration_min=${dur}${tempParam}`);
      setRecommendation(rec);
    } catch (e: any) {
      setAlert({ type: 'error', message: e.message || 'Calculation failed.' });
    } finally {
      setCalcLoading(false);
    }
  }

  // 7-day totals for fuel log
  const last7 = fuelLog.filter(e => {
    const d = new Date(e.logged_at + 'T00:00:00');
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
    return d >= cutoff;
  });
  const totals7 = {
    calories: last7.reduce((s, e) => s + (e.calories || 0), 0),
    carbs_g: last7.reduce((s, e) => s + (e.carbs_g || 0), 0),
    protein_g: last7.reduce((s, e) => s + (e.protein_g || 0), 0),
    hydration_ml: last7.reduce((s, e) => s + (e.hydration_ml || 0), 0)
  };

  return (
    <AppLayout role={role ?? 'athlete'} name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Nutrition & Hydration</h1>
          </div>

          {alert && (
            <div className="mb-6">
              <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
            {(['metrics', 'log', 'calculator'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all capitalize"
                style={tab === t
                  ? { background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }
                  : { color: 'var(--color-text-tertiary)' }
                }
              >
                {t === 'metrics' ? 'Body Metrics' : t === 'log' ? 'Fuel Log' : 'Calculator'}
              </button>
            ))}
          </div>

          {/* ── Body Metrics ─────────────────────────────────── */}
          {tab === 'metrics' && (
            <Card title="Body Metrics">
              {metricsLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : (
                <div className="flex flex-col gap-5">
                  <p className="text-sm text-[var(--color-text-tertiary)]">
                    These metrics personalise your hydration and fueling recommendations.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      label="Weight (kg)"
                      type="number"
                      min={20} max={300} step={0.1}
                      value={metrics.weight_kg ?? ''}
                      onChange={e => setMetrics(m => ({ ...m, weight_kg: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="e.g. 68"
                    />
                    <Input
                      label="Height (cm)"
                      type="number"
                      min={100} max={250}
                      value={metrics.height_cm ?? ''}
                      onChange={e => setMetrics(m => ({ ...m, height_cm: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="e.g. 175"
                    />
                    <Input
                      label="Sweat rate (ml/hr)"
                      type="number"
                      min={100} max={3000} step={50}
                      value={metrics.sweat_rate_ml_per_hr ?? ''}
                      onChange={e => setMetrics(m => ({ ...m, sweat_rate_ml_per_hr: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="e.g. 500"
                    />
                  </div>
                  <div className="text-xs rounded-lg p-3" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                    <strong className="text-[var(--color-text-primary)]">Tip:</strong> Average sweat rate is 400–1,000 ml/hr.
                    If you finish runs feeling very thirsty with visible salt on skin, try 800–1,200.
                    If you rarely feel thirsty, use 300–500.
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={saveMetrics} loading={metricsSaving}>Save Metrics</Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── Fuel Log ─────────────────────────────────────── */}
          {tab === 'log' && (
            <div className="flex flex-col gap-4">
              {/* 7-day totals */}
              {last7.length > 0 && (
                <Card title="Last 7 Days">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'Calories', value: totals7.calories.toLocaleString(), unit: 'kcal' },
                      { label: 'Carbs', value: totals7.carbs_g.toFixed(0), unit: 'g' },
                      { label: 'Protein', value: totals7.protein_g.toFixed(0), unit: 'g' },
                      { label: 'Hydration', value: (totals7.hydration_ml / 1000).toFixed(1), unit: 'L' },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg p-3" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                        <div className="text-xs text-[var(--color-text-tertiary)] mb-1">{s.label}</div>
                        <div className="font-mono text-lg font-bold text-[var(--color-text-primary)]">
                          {s.value}<span className="text-xs font-normal text-[var(--color-text-tertiary)] ml-1">{s.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card title="Fuel Log (Last 30 Days)">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-[var(--color-text-tertiary)]">Log your daily nutrition to track patterns over time.</p>
                  <Button size="sm" onClick={() => setShowAddEntry(v => !v)}>
                    {showAddEntry ? 'Cancel' : '+ Log Entry'}
                  </Button>
                </div>

                {showAddEntry && (
                  <div className="mb-5 p-4 rounded-lg flex flex-col gap-3" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <Input
                        label="Date"
                        type="date"
                        value={newEntry.logged_at}
                        onChange={e => setNewEntry(n => ({ ...n, logged_at: e.target.value }))}
                      />
                      <Input
                        label="Calories (kcal)"
                        type="number" min={0} max={10000}
                        value={newEntry.calories}
                        onChange={e => setNewEntry(n => ({ ...n, calories: e.target.value }))}
                        placeholder="e.g. 350"
                      />
                      <Input
                        label="Carbs (g)"
                        type="number" min={0} step={0.5}
                        value={newEntry.carbs_g}
                        onChange={e => setNewEntry(n => ({ ...n, carbs_g: e.target.value }))}
                        placeholder="e.g. 60"
                      />
                      <Input
                        label="Protein (g)"
                        type="number" min={0} step={0.5}
                        value={newEntry.protein_g}
                        onChange={e => setNewEntry(n => ({ ...n, protein_g: e.target.value }))}
                        placeholder="e.g. 20"
                      />
                      <Input
                        label="Hydration (ml)"
                        type="number" min={0}
                        value={newEntry.hydration_ml}
                        onChange={e => setNewEntry(n => ({ ...n, hydration_ml: e.target.value }))}
                        placeholder="e.g. 600"
                      />
                    </div>
                    <Textarea
                      label="Notes (optional)"
                      rows={2}
                      value={newEntry.notes}
                      onChange={e => setNewEntry(n => ({ ...n, notes: e.target.value }))}
                      placeholder="e.g. Post-run smoothie, gel mid-race..."
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={addFuelEntry} loading={addingEntry}
                        disabled={!newEntry.logged_at}>
                        Save Entry
                      </Button>
                    </div>
                  </div>
                )}

                {logLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : fuelLog.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">No entries yet. Log your first entry above.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {fuelLog.map(entry => (
                      <div key={entry.id} className="flex items-start justify-between gap-3 py-3 border-b border-[var(--color-border)] last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[var(--color-text-tertiary)] mb-1">{formatDate(entry.logged_at)}</div>
                          <div className="flex flex-wrap gap-2">
                            {entry.calories != null && (
                              <Badge label={`${entry.calories} kcal`} color="amber" />
                            )}
                            {entry.carbs_g != null && (
                              <Badge label={`${entry.carbs_g}g carbs`} color="blue" />
                            )}
                            {entry.protein_g != null && (
                              <Badge label={`${entry.protein_g}g protein`} color="purple" />
                            )}
                            {entry.hydration_ml != null && (
                              <Badge label={`${entry.hydration_ml}ml`} color="green" />
                            )}
                          </div>
                          {entry.notes && (
                            <p className="text-xs text-[var(--color-text-tertiary)] mt-1 truncate">{entry.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="text-xs transition-colors shrink-0"
                          style={{ color: 'var(--color-text-tertiary)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ── Fueling Calculator ────────────────────────────── */}
          {tab === 'calculator' && (
            <div className="flex flex-col gap-4">
              {/* Weather */}
              <Card title="Current Conditions">
                {weatherLoading ? (
                  <div className="flex justify-center py-4"><Spinner /></div>
                ) : weather ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-2xl font-bold text-[var(--color-text-primary)]">
                        {weather.temp_c}°C
                      </div>
                      <div className="text-sm text-[var(--color-text-tertiary)]">{weather.description}</div>
                      {weather.location_name && (
                        <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{weather.location_name}</div>
                      )}
                    </div>
                    <div className="text-right text-sm text-[var(--color-text-tertiary)]">
                      <div>Wind: {weather.windspeed_kmh} km/h</div>
                      {weather.temp_c > 25 && (
                        <span className="mt-1"><Badge label="Hot — hydrate extra" color="amber" /></span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-text-tertiary)]">
                    No location data yet. Weather is pulled from your team's practice location once your coach adds a GPS-tagged event.
                  </p>
                )}
              </Card>

              <Card title="Post-Run Fueling Calculator">
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-[var(--color-text-tertiary)]">
                    Enter your workout duration to get personalised calorie, carb, protein, and hydration targets.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Workout Duration</label>
                      <div className="flex gap-2">
                        <select
                          value={durationHours}
                          onChange={e => setDurationHours(e.target.value)}
                          className="flex-1 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-btn px-3 py-[10px] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                        >
                          {Array.from({ length: 13 }, (_, i) => (
                            <option key={i} value={i}>{i}h</option>
                          ))}
                        </select>
                        <select
                          value={durationMinutes}
                          onChange={e => setDurationMinutes(e.target.value)}
                          className="flex-1 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-btn px-3 py-[10px] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                        >
                          {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => (
                            <option key={m} value={m}>{m}min</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Input
                      label="Temperature (°C) — leave blank to use live weather"
                      type="number" min={-30} max={55}
                      value={customTempC}
                      onChange={e => setCustomTempC(e.target.value)}
                      placeholder={weather ? `${weather.temp_c}°C (live)` : 'optional'}
                    />
                  </div>
                  <Button onClick={runCalculator} loading={calcLoading} disabled={parseInt(durationHours) === 0 && (!durationMinutes || parseInt(durationMinutes) === 0)}>
                    Calculate Fueling Targets
                  </Button>

                  {recommendation && (
                    <div className="mt-2 flex flex-col gap-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Hydration needed', value: `${recommendation.hydration_ml} ml`, hint: 'Sip every 15-20 min during your run', color: 'blue' as const },
                          { label: 'Calories burned', value: recommendation.cals_burned.toLocaleString(), hint: 'Estimated energy used — replenish within 45 min', color: 'amber' as const },
                          { label: 'Post-run target', value: `${recommendation.post_run.calories} kcal`, hint: 'Recovery meal target — prioritise carbs + protein', color: 'green' as const },
                          { label: 'Carbs / Protein', value: `${recommendation.post_run.carbs_g}g / ${recommendation.post_run.protein_g}g`, hint: `≈ 2 bagels + banana | 2 eggs + Greek yogurt`, color: 'purple' as const },
                        ].map(s => (
                          <div key={s.label} className="rounded-lg p-3" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                            <div className="text-xs text-[var(--color-text-tertiary)] mb-1">{s.label}</div>
                            <div className="font-mono text-base font-bold text-[var(--color-text-primary)]">{s.value}</div>
                            <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{s.hint}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-sm rounded-lg p-3" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                        {recommendation.post_run.tip}
                      </div>
                      {recommendation.heat_multiplier > 1 && (
                        <Alert type="info" message={`Heat adjustment applied (${recommendation.temp_c}°C) — hydration target increased by ${Math.round((recommendation.heat_multiplier - 1) * 100)}%.`} onClose={() => {}} />
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
