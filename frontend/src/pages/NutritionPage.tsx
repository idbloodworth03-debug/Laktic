import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { AppLayout, Card, Button, Input, Alert, Spinner } from '../components/ui';
import { supabase } from '../lib/supabaseClient';

type BodyMetrics = {
  weight_kg: number | null;
  height_cm: number | null;
  sweat_rate_ml_per_hr: number | null;
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

type NutritionAdvice = {
  workout: { title: string; date: string; distance_miles: number; pace_guideline?: string } | null;
  advice: { night_before: string; morning_of: string; during: string | null; after: string } | null;
  generated_at: string;
};

type Tab = 'metrics' | 'advice' | 'calculator';

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
  const [metricsView, setMetricsView] = useState<'form' | 'card'>('form');

  // AI Nutrition advice
  const [adviceData, setAdviceData] = useState<NutritionAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);

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
    if (tab === 'advice' && !adviceData) loadAdvice();
    if (tab === 'calculator' && !weather) loadWeather();
  }, [tab]);

  async function loadMetrics() {
    setMetricsLoading(true);
    try {
      const data = await apiFetch('/api/athlete/body-metrics');
      if (data && data.weight_kg != null) {
        setMetrics(data);
        setMetricsView('card');
      }
    } catch {
      // no metrics yet
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
      setMetricsView('card');
      setAlert({ type: 'success', message: 'Body metrics saved.' });
    } catch (e: any) {
      setAlert({ type: 'error', message: e.message || 'Failed to save.' });
    } finally {
      setMetricsSaving(false);
    }
  }

  async function loadAdvice() {
    setAdviceLoading(true);
    try {
      const data = await apiFetch('/api/athlete/nutrition/advice');
      setAdviceData(data);
    } catch {
      setAdviceData(null);
    } finally {
      setAdviceLoading(false);
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

  // Computed metrics for the stats card
  const bmi = (metrics.weight_kg && metrics.height_cm)
    ? Math.round((metrics.weight_kg / Math.pow(metrics.height_cm / 100, 2)) * 10) / 10
    : null;
  const waterPerHour = metrics.sweat_rate_ml_per_hr
    ? Math.round((metrics.sweat_rate_ml_per_hr / 1000) * 10) / 10
    : null;
  const dailyBaseline = metrics.weight_kg
    ? Math.round(metrics.weight_kg * 0.033 * 10) / 10
    : null;
  const raceDayTarget = dailyBaseline
    ? Math.round(dailyBaseline * 1.5 * 10) / 10
    : null;

  const TAB_LABELS: Record<Tab, string> = { metrics: 'Body Metrics', advice: 'AI Nutrition', calculator: 'Calculator' };

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
            {(['metrics', 'advice', 'calculator'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all capitalize"
                style={tab === t
                  ? { background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }
                  : { color: 'var(--color-text-tertiary)' }
                }
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {/* ── Body Metrics ─────────────────────────────────── */}
          {tab === 'metrics' && (
            metricsLoading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : metricsView === 'card' && metrics.weight_kg != null ? (
              <Card>
                <div className="flex flex-col gap-5">
                  {/* Icon + heading */}
                  <div className="flex items-center gap-3">
                    <div className="text-4xl" style={{ color: 'var(--color-accent)' }}>🏃</div>
                    <div>
                      <div className="font-bold text-lg" style={{ color: 'var(--color-text-primary)' }}>Your Body Profile</div>
                      <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Used to personalise all fueling recommendations</div>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Weight', value: `${metrics.weight_kg} kg` },
                      { label: 'Height', value: metrics.height_cm ? `${metrics.height_cm} cm` : '—' },
                      { label: 'BMI', value: bmi ? String(bmi) : '—' },
                      { label: 'Sweat Rate', value: metrics.sweat_rate_ml_per_hr ? `${metrics.sweat_rate_ml_per_hr} ml/hr` : '—' },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg p-3" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                        <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-tertiary)' }}>{s.label}</div>
                        <div className="font-mono text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Hydration profile */}
                  <div className="rounded-xl p-4" style={{ background: 'rgba(0,229,160,0.05)', border: '1px solid rgba(0,229,160,0.15)' }}>
                    <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--color-accent)' }}>Your Hydration Profile</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {waterPerHour != null && (
                        <div>
                          <div className="font-mono text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{waterPerHour} L/hr</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>Water per hour running</div>
                        </div>
                      )}
                      {dailyBaseline != null && (
                        <div>
                          <div className="font-mono text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{dailyBaseline} L</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>Daily baseline hydration</div>
                        </div>
                      )}
                      {raceDayTarget != null && (
                        <div>
                          <div className="font-mono text-xl font-bold" style={{ color: 'var(--color-accent)' }}>{raceDayTarget} L</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>Race day target</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setMetricsView('form')}>Edit Metrics</Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card title="Body Metrics">
                <div className="flex flex-col gap-5">
                  <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
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
                    <strong style={{ color: 'var(--color-text-primary)' }}>Tip:</strong> Average sweat rate is 400–1,000 ml/hr.
                    If you finish runs feeling very thirsty with visible salt on skin, try 800–1,200.
                    If you rarely feel thirsty, use 300–500.
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={saveMetrics} loading={metricsSaving}>Save Metrics</Button>
                  </div>
                </div>
              </Card>
            )
          )}

          {/* ── AI Nutrition Advice ───────────────────────────── */}
          {tab === 'advice' && (
            <div className="flex flex-col gap-4">
              {adviceLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Spinner size="lg" />
                  <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Generating your nutrition plan…</p>
                </div>
              ) : !adviceData?.workout ? (
                <Card>
                  <div className="text-center py-10">
                    <div className="text-4xl mb-3">🥗</div>
                    <p className="text-sm mb-1 font-medium" style={{ color: 'var(--color-text-primary)' }}>No upcoming workout found</p>
                    <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                      Add a training plan to get personalised nutrition advice for your next run.
                    </p>
                  </div>
                </Card>
              ) : (
                <>
                  {/* Next workout header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--color-text-tertiary)' }}>Next Workout</div>
                      <div className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
                        {adviceData.workout.title} — {adviceData.workout.distance_miles} mi
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                        {new Date(adviceData.workout.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        {adviceData.workout.pace_guideline && ` · ${adviceData.workout.pace_guideline}/mi`}
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => { setAdviceData(null); loadAdvice(); }}>
                      Regenerate
                    </Button>
                  </div>

                  {adviceData.advice && (
                    <div className="flex flex-col gap-3">
                      {[
                        { key: 'night_before', label: 'Night Before', icon: '🌙', text: adviceData.advice.night_before },
                        { key: 'morning_of', label: 'Morning Of', icon: '☀️', text: adviceData.advice.morning_of },
                        ...(adviceData.advice.during ? [{ key: 'during', label: 'During the Run', icon: '🏃', text: adviceData.advice.during }] : []),
                        { key: 'after', label: 'Recovery After', icon: '💪', text: adviceData.advice.after },
                      ].map(section => (
                        <div
                          key={section.key}
                          className="rounded-xl p-4"
                          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-light)' }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-base">{section.icon}</span>
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>{section.label}</span>
                          </div>
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{section.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                    Generated {new Date(adviceData.generated_at).toLocaleTimeString()} · Based on your body metrics and training plan
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── Fueling Calculator ────────────────────────────── */}
          {tab === 'calculator' && (
            <div className="flex flex-col gap-4">
              <Card title="Current Conditions">
                {weatherLoading ? (
                  <div className="flex justify-center py-4"><Spinner /></div>
                ) : weather ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                        {weather.temp_c}°C
                      </div>
                      <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{weather.description}</div>
                      {weather.location_name && (
                        <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{weather.location_name}</div>
                      )}
                    </div>
                    <div className="text-right text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                      Wind: {weather.windspeed_kmh} km/h
                    </div>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    No location data yet. Weather is pulled from your team's practice location.
                  </p>
                )}
              </Card>

              <Card title="Post-Run Fueling Calculator">
                <div className="flex flex-col gap-4">
                  <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    Enter your workout duration to get personalised calorie, carb, protein, and hydration targets.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Workout Duration</label>
                      <div className="flex gap-2">
                        <select
                          value={durationHours}
                          onChange={e => setDurationHours(e.target.value)}
                          className="flex-1 outline-none text-sm"
                          style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px', color: 'var(--color-text-primary)' }}
                        >
                          {Array.from({ length: 13 }, (_, i) => (
                            <option key={i} value={i}>{i}h</option>
                          ))}
                        </select>
                        <select
                          value={durationMinutes}
                          onChange={e => setDurationMinutes(e.target.value)}
                          className="flex-1 outline-none text-sm"
                          style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px', color: 'var(--color-text-primary)' }}
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
                          { label: 'Hydration needed', value: `${recommendation.hydration_ml} ml`, hint: 'Sip every 15-20 min during your run' },
                          { label: 'Calories burned', value: recommendation.cals_burned.toLocaleString(), hint: 'Estimated energy used — replenish within 45 min' },
                          { label: 'Post-run target', value: `${recommendation.post_run.calories} kcal`, hint: 'Recovery meal target — prioritise carbs + protein' },
                          { label: 'Carbs / Protein', value: `${recommendation.post_run.carbs_g}g / ${recommendation.post_run.protein_g}g`, hint: '≈ 2 bagels + banana | 2 eggs + Greek yogurt' },
                        ].map(s => (
                          <div key={s.label} className="rounded-lg p-3" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                            <div className="text-xs mb-1" style={{ color: 'var(--color-text-tertiary)' }}>{s.label}</div>
                            <div className="font-mono text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>{s.value}</div>
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
