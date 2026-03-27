import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import {
  Navbar, Button, Input, Textarea, Select, Card, Toggle, Badge,
  StepIndicator, Alert, Spinner,
} from '../components/ui';

// ── Types ─────────────────────────────────────────────────────────────────────
type Workout = {
  day_of_week: number; title: string; description: string;
  distance_miles: string; pace_guideline: string; ai_adjustable: boolean;
};
type Doc = { title: string; document_type: string; content_text: string };

// ── Constants ─────────────────────────────────────────────────────────────────
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
const DOC_TYPE_OPTIONS = [
  { value: 'philosophy', label: 'Philosophy' },
  { value: 'sample_week', label: 'Sample Week' },
  { value: 'training_block', label: 'Training Block' },
  { value: 'taper', label: 'Taper' },
  { value: 'injury_rule', label: 'Injury Rule' },
  { value: 'faq', label: 'FAQ' },
  { value: 'notes', label: 'Notes' },
];
const STEP_LABELS = ['Bot Identity', 'Workouts', 'Knowledge', 'Team', 'Done'];

function emptyWorkout(day: number): Workout {
  return { day_of_week: day, title: '', description: '', distance_miles: '', pace_guideline: '', ai_adjustable: true };
}

// ── Main Wizard ───────────────────────────────────────────────────────────────
export function CoachOnboarding() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [step, setStep] = useState(0);

  // Step 1 — Bot Identity
  const [bot, setBot] = useState<any>(null);
  const [botForm, setBotForm] = useState({ name: '', philosophy: '', event_focus: '', level_focus: '' });
  const [savingBot, setSavingBot] = useState(false);
  const [botError, setBotError] = useState('');

  // Step 2 — Workouts
  const [workouts, setWorkouts] = useState<Workout[]>(DAYS.map((_, i) => emptyWorkout(i + 1)));
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [workoutError, setWorkoutError] = useState('');

  // Step 3 — Knowledge
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docForm, setDocForm] = useState<Doc>({ title: '', document_type: 'sample_week', content_text: '' });
  const [savingDoc, setSavingDoc] = useState(false);
  const [docError, setDocError] = useState('');
  const [docSuccess, setDocSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 4 — Team
  const [team, setTeam] = useState<any>(null);
  const [teamName, setTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  // ── Step 1 handlers ─────────────────────────────────────────────────────────
  const saveBot = async () => {
    if (!botForm.name.trim() || !botForm.philosophy.trim()) {
      setBotError('Bot name and coaching philosophy are required.');
      return;
    }
    setSavingBot(true); setBotError('');
    try {
      const created = await apiFetch('/api/coach/bot', { method: 'POST', body: JSON.stringify(botForm) });
      setBot(created);
      setStep(1);
    } catch (e: any) {
      // If bot already exists, just advance (returning coaches who hit onboarding again)
      if (e.message?.includes('already')) {
        setStep(1);
      } else {
        setBotError(e.message || 'Failed to save bot.');
      }
    } finally {
      setSavingBot(false);
    }
  };

  // ── Step 2 handlers ─────────────────────────────────────────────────────────
  const saveWorkout = async (wo: Workout) => {
    if (!wo.title) return;
    setSavingDay(wo.day_of_week); setWorkoutError('');
    try {
      await apiFetch('/api/coach/bot/workouts', {
        method: 'POST',
        body: JSON.stringify({ ...wo, distance_miles: wo.distance_miles ? parseFloat(wo.distance_miles) : null }),
      });
    } catch (e: any) {
      setWorkoutError(e.message || 'Failed to save workout.');
    } finally {
      setSavingDay(null);
    }
  };

  const updateWo = (day: number, field: keyof Workout, value: any) => {
    setWorkouts(prev => prev.map(w => w.day_of_week === day ? { ...w, [field]: value } : w));
  };

  const filledWorkouts = workouts.filter(w => w.title.trim());

  // ── Step 3 handlers ─────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocError('');
    try {
      let text = '';
      if (file.name.endsWith('.txt')) {
        text = await file.text();
      } else if (file.name.endsWith('.docx')) {
        // @ts-ignore
        const mammoth = await import('mammoth');
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        text = result.value;
      } else {
        setDocError('Only .txt and .docx files are supported.'); return;
      }
      setDocForm(f => ({ ...f, content_text: text, title: f.title || file.name.replace(/\.[^.]+$/, '') }));
    } catch (err: any) {
      setDocError('Failed to read file: ' + err.message);
    }
  };

  const saveDoc = async () => {
    if (!docForm.title || !docForm.content_text) { setDocError('Title and content are required.'); return; }
    setSavingDoc(true); setDocError('');
    try {
      await apiFetch('/api/coach/bot/knowledge', { method: 'POST', body: JSON.stringify(docForm) });
      setDocs(prev => [...prev, docForm]);
      setDocForm({ title: '', document_type: 'sample_week', content_text: '' });
      setDocSuccess('Document saved!');
      setTimeout(() => setDocSuccess(''), 3000);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) { setDocError(e.message); }
    finally { setSavingDoc(false); }
  };

  // ── Step 4 handlers ─────────────────────────────────────────────────────────
  const createTeam = async () => {
    if (!teamName.trim()) return;
    setTeamError(''); setCreatingTeam(true);
    try {
      const body: any = { name: teamName.trim() };
      if (bot?.id) body.default_bot_id = bot.id;
      const created = await apiFetch('/api/coach/team', { method: 'POST', body: JSON.stringify(body) });
      setTeam(created);
    } catch (e: any) { setTeamError(e.message || 'Failed to create team.'); }
    finally { setCreatingTeam(false); }
  };

  const copyCode = () => {
    if (team?.invite_code) {
      navigator.clipboard.writeText(team.invite_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
      <div className="max-w-2xl mx-auto px-6 py-10 fade-up">
        <div className="mb-2">
          <h1 className="font-display text-2xl font-bold">Welcome to Laktic</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Set up your coaching bot in a few steps. You can always edit everything later.</p>
        </div>

        <div className="mt-6">
          <StepIndicator steps={STEP_LABELS} current={step} />
        </div>

        {/* ── Step 0: Bot Identity ─────────────────────────────────────────── */}
        {step === 0 && (
          <Card>
            <h2 className="font-display text-lg font-semibold mb-1">Build your coaching identity</h2>
            <p className="text-sm text-[var(--muted)] mb-5">The AI will coach every athlete in your voice using this information.</p>
            <div className="flex flex-col gap-4">
              <Input
                label="Bot name"
                value={botForm.name}
                onChange={e => setBotForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Coach Smith's Distance Training"
              />
              <Textarea
                label="Coaching philosophy"
                value={botForm.philosophy}
                onChange={e => setBotForm(f => ({ ...f, philosophy: e.target.value }))}
                rows={7}
                placeholder="Describe your coaching philosophy in detail. What are your training principles? How do you approach periodization, recovery, and race prep? How do you motivate athletes? The more detail you give, the more your bot sounds like you."
              />
              <div className="grid grid-cols-2 gap-4">
                <Select label="Event focus" value={botForm.event_focus} onChange={e => setBotForm(f => ({ ...f, event_focus: e.target.value }))} options={EVENT_OPTIONS} />
                <Select label="Level focus" value={botForm.level_focus} onChange={e => setBotForm(f => ({ ...f, level_focus: e.target.value }))} options={LEVEL_OPTIONS} />
              </div>
              {botError && <Alert type="error" message={botError} onClose={() => setBotError('')} />}
              <div className="flex justify-end">
                <Button onClick={saveBot} loading={savingBot} variant="primary" size="lg">
                  Continue →
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Step 1: Workouts ─────────────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <h2 className="font-display text-lg font-semibold mb-1">Define your weekly training template</h2>
            <p className="text-sm text-[var(--muted)] mb-5">
              The AI adapts this template for each athlete's fitness level and race schedule. Add at least 5 days to publish.
            </p>
            {workoutError && <Alert type="error" message={workoutError} onClose={() => setWorkoutError('')} />}
            <div className="flex flex-col gap-3 mb-6">
              {workouts.map(wo => (
                <WizardWorkoutRow
                  key={wo.day_of_week}
                  day={DAYS[wo.day_of_week - 1]}
                  wo={wo}
                  saving={savingDay === wo.day_of_week}
                  onChange={(field, val) => updateWo(wo.day_of_week, field, val)}
                  onSave={() => saveWorkout(wo)}
                />
              ))}
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
              <Button variant="ghost" onClick={() => setStep(0)}>← Back</Button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--muted)]">{filledWorkouts.length} workouts added</span>
                <Button variant="primary" size="lg" onClick={() => setStep(2)}>
                  Continue →
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Step 2: Knowledge Docs ───────────────────────────────────────── */}
        {step === 2 && (
          <Card>
            <h2 className="font-display text-lg font-semibold mb-1">Upload training knowledge</h2>
            <p className="text-sm text-[var(--muted)] mb-5">
              These documents are injected into every AI response as context. Athletes can't read them — they just make your bot smarter.
              Add at least one document to publish.
            </p>

            {/* Saved docs */}
            {docs.length > 0 && (
              <div className="flex flex-col gap-2 mb-5">
                {docs.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 bg-[var(--surface2)] rounded-lg px-3 py-2 text-sm">
                    <Badge label={d.document_type.replace('_', ' ')} color="gray" />
                    <span className="flex-1 truncate font-medium">{d.title}</span>
                    <span className="text-xs text-[var(--muted)]">saved</span>
                  </div>
                ))}
              </div>
            )}

            {docSuccess && <Alert type="success" message={docSuccess} onClose={() => setDocSuccess('')} />}
            {docError && <Alert type="error" message={docError} onClose={() => setDocError('')} />}

            <div className="flex flex-col gap-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Title" value={docForm.title} onChange={e => setDocForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Base Phase Sample Week" />
                <Select label="Type" value={docForm.document_type} onChange={e => setDocForm(f => ({ ...f, document_type: e.target.value }))} options={DOC_TYPE_OPTIONS} />
              </div>
              <Textarea
                label="Content"
                value={docForm.content_text}
                onChange={e => setDocForm(f => ({ ...f, content_text: e.target.value }))}
                rows={6}
                placeholder="Paste your coaching material here — sample week breakdowns, training block templates, injury rules, taper notes..."
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-xs text-brand-400 hover:underline"
                  >
                    or upload .txt / .docx
                  </button>
                  <input ref={fileRef} type="file" accept=".txt,.docx" onChange={handleFile} className="hidden" />
                  <span className="text-xs text-[var(--muted)]">{docForm.content_text.length}/20000</span>
                </div>
                <Button onClick={saveDoc} loading={savingDoc} variant="secondary" size="sm">Add Document</Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-5 mt-2 border-t border-[var(--border)]">
              <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
              <div className="flex items-center gap-3">
                {docs.length === 0 && (
                  <span className="text-xs text-[var(--muted)]">You can add more later</span>
                )}
                <Button variant="primary" size="lg" onClick={() => setStep(3)}>
                  Continue →
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Step 3: Create Team ──────────────────────────────────────────── */}
        {step === 3 && (
          <Card>
            <h2 className="font-display text-lg font-semibold mb-1">Create your team</h2>
            <p className="text-sm text-[var(--muted)] mb-5">
              Your team has an invite code. Share it with athletes so they can join and get a personalized plan.
            </p>

            {!team ? (
              <div className="flex flex-col gap-4">
                <Input
                  label="Team name"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createTeam()}
                  placeholder="e.g. Eastside Track Club"
                />
                {teamError && <Alert type="error" message={teamError} onClose={() => setTeamError('')} />}
                <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                  <Button variant="ghost" onClick={() => setStep(2)}>← Back</Button>
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={() => setStep(4)}>Skip for now</Button>
                    <Button variant="primary" size="lg" loading={creatingTeam} disabled={!teamName.trim()} onClick={createTeam}>
                      Create Team →
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Alert type="success" message={`Team "${team.name}" created!`} />
                <div className="flex items-center justify-between bg-dark-700 rounded-xl px-4 py-3">
                  <div>
                    <div className="text-xs text-[var(--muted)] mb-1">Invite Code</div>
                    <div className="font-mono text-2xl font-bold tracking-widest text-brand-400">{team.invite_code}</div>
                  </div>
                  <Button onClick={copyCode} variant="secondary">
                    {codeCopied ? '✓ Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  Athletes enter this code on the <strong className="text-[var(--text)]">Join Team</strong> page after registering.
                </p>
                <div className="flex justify-end pt-2">
                  <Button variant="primary" size="lg" onClick={() => setStep(4)}>Finish setup →</Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── Step 4: Done ────────────────────────────────────────────────── */}
        {step === 4 && (
          <Card>
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <div className="w-16 h-16 rounded-full bg-brand-950 border border-brand-700 flex items-center justify-center text-3xl">
                ✓
              </div>
              <div>
                <h2 className="font-display text-xl font-bold mb-2">You're set up!</h2>
                <p className="text-sm text-[var(--muted)] max-w-sm leading-relaxed">
                  Your coaching bot is ready. Publish it from your dashboard so athletes can subscribe and get personalized plans.
                </p>
              </div>

              <div className="w-full flex flex-col gap-3 mt-2">
                <div className="grid grid-cols-2 gap-3 text-left">
                  <SummaryItem
                    icon="◈"
                    label="Bot identity"
                    value={botForm.name || '—'}
                    done={!!botForm.name}
                  />
                  <SummaryItem
                    icon="◷"
                    label="Workouts"
                    value={`${filledWorkouts.length} of 7 days`}
                    done={filledWorkouts.length >= 5}
                    warn={filledWorkouts.length < 5 ? 'Need 5+ to publish' : undefined}
                  />
                  <SummaryItem
                    icon="📄"
                    label="Knowledge docs"
                    value={docs.length > 0 ? `${docs.length} uploaded` : 'None yet'}
                    done={docs.length > 0}
                    warn={docs.length === 0 ? 'Add at least 1 to publish' : undefined}
                  />
                  <SummaryItem
                    icon="◎"
                    label="Team"
                    value={team ? team.name : 'Not created'}
                    done={!!team}
                  />
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <Button variant="primary" size="lg" className="w-full" onClick={() => nav('/coach/dashboard')}>
                    Go to Dashboard
                  </Button>
                  <Link to="/coach/knowledge">
                    <Button variant="ghost" size="sm" className="w-full">Upload more knowledge documents</Button>
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── SummaryItem ───────────────────────────────────────────────────────────────
function SummaryItem({ icon, label, value, done, warn }: { icon: string; label: string; value: string; done: boolean; warn?: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${done ? 'border-brand-800/40 bg-brand-950/30' : 'border-[var(--border)] bg-[var(--surface2)]'}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-sm">{icon}</span>
        <span className="text-xs text-[var(--muted)] font-medium uppercase tracking-wide">{label}</span>
        {done && <span className="ml-auto text-brand-400 text-xs">✓</span>}
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
      {warn && <div className="text-xs text-amber-400 mt-0.5">{warn}</div>}
    </div>
  );
}

// ── WizardWorkoutRow ──────────────────────────────────────────────────────────
function WizardWorkoutRow({ day, wo, saving, onChange, onSave }: {
  day: string; wo: Workout; saving: boolean;
  onChange: (field: keyof Workout, val: any) => void;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasContent = !!wo.title;

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${hasContent ? 'border-[var(--border)] bg-[var(--surface)]' : 'border-dashed border-dark-500'}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="w-10 text-sm font-medium text-[var(--muted)] shrink-0">{day.slice(0, 3)}</div>
        <div className="flex-1 min-w-0">
          {hasContent ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{wo.title}</span>
              {wo.distance_miles && <Badge label={`${wo.distance_miles}mi`} color="green" />}
            </div>
          ) : (
            <span className="text-sm text-[var(--muted)]">Click to add</span>
          )}
        </div>
        <span className="text-[var(--muted)] text-xs">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-[var(--border)]">
          <div className="pt-3 grid grid-cols-2 gap-3">
            <Input label="Title" value={wo.title} onChange={e => onChange('title', e.target.value)} placeholder="e.g. Easy Recovery Run" />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Distance (mi)" type="number" value={wo.distance_miles} onChange={e => onChange('distance_miles', e.target.value)} placeholder="6" />
              <Input label="Pace" value={wo.pace_guideline} onChange={e => onChange('pace_guideline', e.target.value)} placeholder="Easy" />
            </div>
          </div>
          <Textarea label="Description" value={wo.description} onChange={e => onChange('description', e.target.value)} rows={2} placeholder="What should the athlete feel during this workout?" />
          <div className="flex items-center justify-between">
            <Toggle checked={wo.ai_adjustable} onChange={v => onChange('ai_adjustable', v)} label="AI can adjust distance & pace" />
            <Button variant="primary" size="sm" loading={saving} onClick={onSave}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}
