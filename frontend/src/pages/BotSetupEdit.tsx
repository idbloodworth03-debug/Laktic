import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Input, Textarea, Select, Card, Toggle, Badge } from '../components/ui';
import { PRESET_PERSONALITIES, PersonalitySelector } from '../components/PersonalitySelector';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EVENT_OPTIONS = [
  { value: '', label: 'Any event' },
  { value: '800m-1500m', label: '800m / 1500m' },
  { value: '5K-10K', label: '5K / 10K' },
  { value: 'Half Marathon', label: 'Half Marathon' },
  { value: 'Marathon', label: 'Marathon' },
  { value: 'Cross Country', label: 'Cross Country' },
  { value: 'Track & Field', label: 'Track & Field' },
];
const LEVEL_OPTIONS = [
  { value: '', label: 'Any level' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'elite', label: 'Elite' },
];

type Workout = {
  day_of_week: number; title: string; description: string;
  distance_miles: string; pace_guideline: string; ai_adjustable: boolean;
};

function emptyWorkout(day: number): Workout {
  return { day_of_week: day, title: '', description: '', distance_miles: '', pace_guideline: '', ai_adjustable: true };
}

export function BotSetupEdit() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const isEdit = window.location.pathname.includes('edit');

  const [bot, setBot] = useState<any>(null);
  const [botForm, setBotForm] = useState({ name: '', philosophy: '', event_focus: '', level_focus: '', personality: 'custom', personality_prompt: '' });
  const [workouts, setWorkouts] = useState<Workout[]>(DAYS.map((_, i) => emptyWorkout(i + 1)));
  const [saving, setSaving] = useState(false);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/coach/bot').then((data: any) => {
      if (data.bot) {
        setBot(data.bot);
        setBotForm({ name: data.bot.name || '', philosophy: data.bot.philosophy || '', event_focus: data.bot.event_focus || '', level_focus: data.bot.level_focus || '', personality: data.bot.personality || 'custom', personality_prompt: data.bot.personality_prompt || '' });
        const filled = data.workouts || [];
        setWorkouts(DAYS.map((_, i) => {
          const existing = filled.find((w: any) => w.day_of_week === i + 1);
          return existing ? { ...existing, distance_miles: existing.distance_miles?.toString() || '', ai_adjustable: existing.ai_adjustable ?? true } : emptyWorkout(i + 1);
        }));
      }
    });
  }, []);

  const saveDraft = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        ...botForm,
        event_focus: botForm.event_focus || null,
        level_focus: botForm.level_focus || null,
        personality_prompt: botForm.personality_prompt || null,
      };
      if (!bot) {
        const created = await apiFetch('/api/coach/bot', { method: 'POST', body: JSON.stringify(payload) });
        setBot(created);
      } else {
        await apiFetch('/api/coach/bot', { method: 'PATCH', body: JSON.stringify(payload) });
      }
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const saveWorkout = async (wo: Workout) => {
    if (!wo.title) return;
    setSavingDay(wo.day_of_week);
    try {
      await apiFetch('/api/coach/bot/workouts', {
        method: 'POST',
        body: JSON.stringify({ ...wo, distance_miles: wo.distance_miles ? parseFloat(wo.distance_miles) : null })
      });
    } catch (e: any) { setError(e.message); }
    finally { setSavingDay(null); }
  };

  const deleteWorkout = async (day: number) => {
    await apiFetch(`/api/coach/bot/workouts/${day}`, { method: 'DELETE' }).catch(() => {});
    setWorkouts(prev => prev.map(w => w.day_of_week === day ? emptyWorkout(day) : w));
  };

  const updateWo = (day: number, field: keyof Workout, value: any) => {
    setWorkouts(prev => prev.map(w => w.day_of_week === day ? { ...w, [field]: value } : w));
  };

  return (
    <AppLayout role="coach" name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">{isEdit ? 'Edit Your Bot' : 'Create Your Bot'}</h1>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Build your coaching identity. The AI coaches every athlete in your voice.</p>
            </div>
            <Link to="/coach/dashboard"><Button variant="ghost" size="sm">← Dashboard</Button></Link>
          </div>

          {error && (
            <div className="mb-4 text-sm rounded-lg px-3 py-2" style={{ color: 'var(--color-danger)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          {/* Bot info */}
          <Card className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="font-semibold text-[var(--color-text-primary)]">Bot Identity</h3>
              {botForm.personality && botForm.personality !== 'custom' && (() => {
                const preset = PRESET_PERSONALITIES.find(p => p.id === botForm.personality);
                return preset ? (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${preset.color}22`, color: preset.color, border: `1px solid ${preset.color}44` }}>
                    {preset.label}
                  </span>
                ) : null;
              })()}
            </div>
            <div className="flex flex-col gap-4">
              <PersonalitySelector
                value={botForm.personality}
                onSelect={(id, prompt) => setBotForm(f => ({ ...f, personality: id, personality_prompt: prompt }))}
              />
              {botForm.personality === 'custom' && (
                <Textarea
                  label="Personality prompt (custom)"
                  value={botForm.personality_prompt}
                  onChange={e => setBotForm(f => ({ ...f, personality_prompt: e.target.value }))}
                  rows={3}
                  placeholder="Describe how this bot should sound and behave. e.g. 'Speak with calm authority, use military-style brevity, never sugarcoat.'"
                />
              )}
              <Input label="Bot name" value={botForm.name} onChange={e => setBotForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Coach Smith's Distance Training" />
              <Textarea label="Coaching philosophy" value={botForm.philosophy} onChange={e => setBotForm(f => ({ ...f, philosophy: e.target.value }))} rows={6} placeholder="Describe your coaching philosophy in detail. The AI will coach athletes in your voice using this text. Include your training principles, workout philosophy, how you approach periodization, what you believe about recovery, how you motivate athletes..." />
              <div className="grid grid-cols-2 gap-4">
                <Select label="Event focus" value={botForm.event_focus} onChange={e => setBotForm(f => ({ ...f, event_focus: e.target.value }))} options={EVENT_OPTIONS} />
                <Select label="Level focus" value={botForm.level_focus} onChange={e => setBotForm(f => ({ ...f, level_focus: e.target.value }))} options={LEVEL_OPTIONS} />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[var(--color-border)]">
              <Button onClick={saveDraft} loading={saving} variant="secondary">
                {saved ? '✓ Saved' : 'Save Draft'}
              </Button>
              <span className="text-sm text-[var(--color-text-tertiary)]">
                Ready to publish?{' '}
                <Link to="/coach/knowledge" className="hover:underline" style={{ color: 'var(--color-accent)' }}>
                  Upload training documents first →
                </Link>
              </span>
            </div>
          </Card>

          {/* Weekly template */}
          <Card>
            <h3 className="font-semibold mb-1 text-[var(--color-text-primary)]">Weekly Training Template</h3>
            <p className="text-sm text-[var(--color-text-tertiary)] mb-5">Define the structure of a typical training week. The AI adapts this for each athlete's fitness level and race schedule.</p>
            <div className="flex flex-col gap-4">
              {workouts.map((wo) => (
                <WorkoutRow
                  key={wo.day_of_week}
                  day={DAYS[wo.day_of_week - 1]}
                  wo={wo}
                  saving={savingDay === wo.day_of_week}
                  onChange={(field: keyof Workout, val: string) => updateWo(wo.day_of_week, field, val)}
                  onSave={() => saveWorkout(wo)}
                  onDelete={() => deleteWorkout(wo.day_of_week)}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function WorkoutRow({ day, wo, saving, onChange, onSave, onDelete }: any) {
  const [open, setOpen] = useState(false);
  const hasContent = !!wo.title;

  return (
    <div
      className="rounded-xl overflow-hidden transition-colors"
      style={{ border: hasContent ? '1px solid var(--color-border)' : '1px dashed var(--color-border)' }}
    >
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="w-10 text-sm font-medium text-[var(--color-text-tertiary)] shrink-0">{day.slice(0, 3)}</div>
        <div className="flex-1 min-w-0">
          {hasContent ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{wo.title}</span>
              {wo.distance_miles && <Badge label={`${wo.distance_miles}mi`} color="green" />}
              {wo.ai_adjustable && <Badge label="AI-adjustable" color="purple" />}
            </div>
          ) : (
            <span className="text-sm text-[var(--color-text-tertiary)]">No workout — click to add</span>
          )}
        </div>
        <span className="text-[var(--color-text-tertiary)] text-xs">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-[var(--color-border)]">
          <div className="pt-3 grid grid-cols-2 gap-3">
            <Input label="Title" value={wo.title} onChange={e => onChange('title', e.target.value)} placeholder="e.g. Easy Recovery Run" />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Distance (mi)" type="number" value={wo.distance_miles} onChange={e => onChange('distance_miles', e.target.value)} placeholder="6" />
              <Input label="Pace guideline" value={wo.pace_guideline} onChange={e => onChange('pace_guideline', e.target.value)} placeholder="Easy / conversational" />
            </div>
          </div>
          <Textarea label="Description" value={wo.description} onChange={e => onChange('description', e.target.value)} rows={2} placeholder="What does this workout accomplish? What should the athlete feel?" />
          <div className="flex items-center justify-between">
            <Toggle checked={wo.ai_adjustable} onChange={v => onChange('ai_adjustable', v)} label="AI can adjust distance & pace for this athlete" />
            <div className="flex gap-2">
              {hasContent && <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-400">Clear</Button>}
              <Button variant="primary" size="sm" loading={saving} onClick={onSave}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
