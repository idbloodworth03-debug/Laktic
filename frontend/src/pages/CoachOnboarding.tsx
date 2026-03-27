import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input, Textarea, Select, Toggle } from '../components/ui';
import { PhilosophyEnhancer } from '../components/PhilosophyEnhancer';

// ── Types ─────────────────────────────────────────────────────────────────────
type Workout = {
  day_of_week: number;
  title: string;
  description: string;
  distance_miles: string;
  pace_guideline: string;
  ai_adjustable: boolean;
};

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

const STEPS = [
  { n: 1, label: 'Bot Identity' },
  { n: 2, label: 'Training Template' },
  { n: 3, label: 'Knowledge Docs' },
  { n: 4, label: 'Create Team' },
];

function emptyWorkout(day: number): Workout {
  return { day_of_week: day, title: '', description: '', distance_miles: '', pace_guideline: '', ai_adjustable: true };
}

// ── Step Indicator ────────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={[
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
              s.n < current ? 'bg-brand-600 border-brand-600 text-white' :
              s.n === current ? 'bg-brand-500 border-brand-500 text-white shadow-glow-sm' :
              'bg-[var(--surface2)] border-[var(--border)] text-[var(--muted)]',
            ].join(' ')}>
              {s.n < current ? '✓' : s.n}
            </div>
            <span className={`text-xs mt-1.5 font-medium whitespace-nowrap ${s.n === current ? 'text-brand-400' : 'text-[var(--muted)]'}`}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 mb-5 transition-colors ${s.n < current ? 'bg-brand-600' : 'bg-[var(--border)]'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function Shell({ step, children, onBack, onNext, nextLabel = 'Continue →', nextDisabled = false, nextLoading = false, onSkip }: {
  step: number; children: React.ReactNode;
  onBack?: () => void; onNext: () => void;
  nextLabel?: string; nextDisabled?: boolean; nextLoading?: boolean;
  onSkip?: () => void;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)] relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: 'linear-gradient(var(--green) 1px, transparent 1px), linear-gradient(90deg, var(--green) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] rounded-full bg-brand-500/8 blur-[80px] pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-8 fade-up">
          <div className="font-display font-black text-2xl text-brand-400 tracking-tighter mb-1">LAKTIC</div>
          <p className="text-sm text-[var(--muted)]">Coach Setup — Step {step} of {STEPS.length}</p>
        </div>

        <StepIndicator current={step} />

        <div className="fade-up-1">
          {children}
        </div>

        <div className="flex items-center justify-between mt-8">
          <div>
            {onBack && <Button variant="ghost" onClick={onBack}>← Back</Button>}
          </div>
          <div className="flex items-center gap-3">
            {onSkip && <Button variant="ghost" onClick={onSkip}>Skip for now</Button>}
            <Button variant="primary" onClick={onNext} disabled={nextDisabled} loading={nextLoading} size="lg">
              {nextLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function CoachOnboarding() {
  const { profile } = useAuthStore();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  // Step 1 — Bot Identity
  const [botForm, setBotForm] = useState({ name: '', philosophy: '', event_focus: '', level_focus: '' });
  const [botSaving, setBotSaving] = useState(false);
  const [botId, setBotId] = useState<string | null>(null);

  // Step 2 — Workouts
  const [workouts, setWorkouts] = useState<Workout[]>(DAYS.map((_, i) => emptyWorkout(i + 1)));
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [savedDays, setSavedDays] = useState<Set<number>>(new Set());

  // Step 3 — Knowledge Docs
  const [docForm, setDocForm] = useState({ title: '', document_type: 'sample_week', content_text: '' });
  const [docSaving, setDocSaving] = useState(false);
  const [docs, setDocs] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 4 — Team
  const [teamName, setTeamName] = useState('');
  const [teamSaving, setTeamSaving] = useState(false);
  const [team, setTeam] = useState<any>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // ── Step 1 handlers ──────────────────────────────────────────────────────
  const saveBot = async () => {
    if (!botForm.name || !botForm.philosophy) { setError('Bot name and philosophy are required'); return; }
    setError(''); setBotSaving(true);
    try {
      const payload = {
        ...botForm,
        event_focus: botForm.event_focus || null,
        level_focus: botForm.level_focus || null,
      };
      const created = await apiFetch('/api/coach/bot', { method: 'POST', body: JSON.stringify(payload) });
      setBotId(created.id);
      setStep(2);
    } catch (e: any) {
      if (e.message?.includes('already')) {
        setStep(2);
      } else {
        setError(e.message);
      }
    }
    finally { setBotSaving(false); }
  };

  // ── Step 2 handlers ──────────────────────────────────────────────────────
  const saveWorkout = async (wo: Workout) => {
    if (!wo.title) return;
    setSavingDay(wo.day_of_week);
    try {
      await apiFetch('/api/coach/bot/workouts', {
        method: 'POST',
        body: JSON.stringify({ ...wo, distance_miles: wo.distance_miles ? parseFloat(wo.distance_miles) : null })
      });
      setSavedDays(prev => new Set(prev).add(wo.day_of_week));
    } catch (e: any) { setError(e.message); }
    finally { setSavingDay(null); }
  };

  const updateWo = (day: number, field: keyof Workout, value: any) => {
    setWorkouts(prev => prev.map(w => w.day_of_week === day ? { ...w, [field]: value } : w));
  };

  const filledCount = workouts.filter(w => w.title).length;

  // ── Step 3 handlers ──────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      } else { setError('Only .txt and .docx supported'); return; }
      setDocForm(f => ({ ...f, content_text: text, title: f.title || file.name.replace(/\.[^.]+$/, '') }));
    } catch (err: any) { setError('Failed to read file: ' + err.message); }
  };

  const saveDoc = async () => {
    if (!docForm.title || !docForm.content_text) { setError('Title and content are required'); return; }
    setError(''); setDocSaving(true);
    try {
      const doc = await apiFetch('/api/coach/bot/knowledge', { method: 'POST', body: JSON.stringify(docForm) });
      setDocs(prev => [doc, ...prev]);
      setDocForm({ title: '', document_type: 'sample_week', content_text: '' });
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) { setError(e.message); }
    finally { setDocSaving(false); }
  };

  // ── Step 4 handlers ──────────────────────────────────────────────────────
  const createTeam = async () => {
    if (!teamName.trim()) { setError('Team name is required'); return; }
    setError(''); setTeamSaving(true);
    try {
      const body: any = { name: teamName.trim() };
      if (botId) body.default_bot_id = botId;
      const created = await apiFetch('/api/coach/team', { method: 'POST', body: JSON.stringify(body) });
      setTeam(created);
    } catch (e: any) { setError(e.message); }
    finally { setTeamSaving(false); }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(team.invite_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const renderError = () => error ? (
    <div className="mb-4 text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">{error}</div>
  ) : null;

  if (step === 1) return (
    <Shell step={1} onNext={saveBot} nextLabel="Save & Continue →" nextDisabled={!botForm.name || !botForm.philosophy} nextLoading={botSaving}>
      <h2 className="font-display text-xl font-bold mb-1">Create Your Coaching Bot</h2>
      <p className="text-sm text-[var(--muted)] mb-6">Your bot coaches every athlete in your voice. The more detail you add, the better it performs.</p>
      {renderError()}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4 shadow-card">
        <Input
          label="Bot name"
          value={botForm.name}
          onChange={e => setBotForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Coach Smith's Distance Training"
        />
        <PhilosophyEnhancer
          value={botForm.philosophy}
          onChange={v => setBotForm(f => ({ ...f, philosophy: v }))}
          rows={7}
          placeholder="Describe your coaching philosophy in detail. Include: training principles, periodization approach, workout types you believe in, how you approach recovery, how you motivate athletes, what you expect in terms of effort and consistency..."
        />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Event focus" value={botForm.event_focus} onChange={e => setBotForm(f => ({ ...f, event_focus: e.target.value }))} options={EVENT_OPTIONS} />
          <Select label="Level focus" value={botForm.level_focus} onChange={e => setBotForm(f => ({ ...f, level_focus: e.target.value }))} options={LEVEL_OPTIONS} />
        </div>
      </div>
    </Shell>
  );

  if (step === 2) return (
    <Shell step={2} onBack={() => { setError(''); setStep(1); }} onNext={() => { setError(''); setStep(3); }} nextLabel="Continue →" onSkip={() => { setError(''); setStep(3); }}>
      <h2 className="font-display text-xl font-bold mb-1">Weekly Training Template</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Define a typical training week. Save each day — the AI adapts distances and paces for each athlete.
        <span className="ml-2 text-brand-400 font-medium">{filledCount}/7 days filled</span>
      </p>
      {renderError()}
      <div className="flex flex-col gap-3">
        {workouts.map(wo => (
          <WorkoutRowSimple
            key={wo.day_of_week}
            day={DAYS[wo.day_of_week - 1]}
            wo={wo}
            saving={savingDay === wo.day_of_week}
            saved={savedDays.has(wo.day_of_week)}
            onChange={(field, val) => updateWo(wo.day_of_week, field, val)}
            onSave={() => saveWorkout(wo)}
          />
        ))}
      </div>
    </Shell>
  );

  if (step === 3) return (
    <Shell step={3} onBack={() => { setError(''); setStep(2); }} onNext={() => { setError(''); setStep(4); }} nextLabel="Continue →" onSkip={() => { setError(''); setStep(4); }}>
      <h2 className="font-display text-xl font-bold mb-1">Upload Knowledge Documents</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        These documents teach the AI your coaching system. Upload sample weeks, training blocks, taper notes, injury rules, etc.
        {docs.length > 0 && <span className="ml-2 text-brand-400 font-medium">{docs.length} saved</span>}
      </p>
      {renderError()}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4 shadow-card mb-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Title" value={docForm.title} onChange={e => setDocForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Base Building Sample Week" />
          <Select label="Document type" value={docForm.document_type} onChange={e => setDocForm(f => ({ ...f, document_type: e.target.value }))} options={DOC_TYPE_OPTIONS} />
        </div>
        <Textarea
          label="Content"
          value={docForm.content_text}
          onChange={e => setDocForm(f => ({ ...f, content_text: e.target.value }))}
          rows={6}
          placeholder="Paste your coaching material here — sample week breakdowns, injury protocols, taper guidelines, FAQs..."
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>📄 Upload .txt / .docx</Button>
            <input ref={fileRef} type="file" accept=".txt,.docx" onChange={handleFile} className="hidden" />
            <span className="text-xs text-[var(--muted)]">{docForm.content_text.length}/20000 chars</span>
          </div>
          <Button variant="primary" size="sm" loading={docSaving} onClick={saveDoc} disabled={!docForm.title || !docForm.content_text}>
            Save Document
          </Button>
        </div>
      </div>

      {docs.length > 0 && (
        <div className="flex flex-col gap-2">
          {docs.map(d => (
            <div key={d.id} className="flex items-center justify-between px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
              <div>
                <span className="text-sm font-medium">{d.title}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">{d.document_type.replace('_', ' ')}</span>
              </div>
              <span className="text-brand-400 text-xs">✓ Saved</span>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );

  if (step === 4) return (
    <Shell
      step={4}
      onBack={() => { setError(''); setStep(3); }}
      onNext={() => nav('/coach/dashboard')}
      nextLabel={team ? 'Go to Dashboard →' : 'Skip to Dashboard →'}
    >
      <h2 className="font-display text-xl font-bold mb-1">Create Your Team</h2>
      <p className="text-sm text-[var(--muted)] mb-6">Create a team and share the invite code with your athletes. They'll join and connect directly to your coaching bot.</p>
      {renderError()}

      {!team ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4 shadow-card">
          <Input
            label="Team name"
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            placeholder="e.g. Eastside Track Club"
            onKeyDown={e => e.key === 'Enter' && createTeam()}
          />
          <Button variant="primary" onClick={createTeam} loading={teamSaving} disabled={!teamName.trim()}>
            Create Team
          </Button>
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-6 shadow-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-900/40 border border-brand-700/30 flex items-center justify-center">
              <span className="text-brand-400">✓</span>
            </div>
            <div>
              <div className="font-semibold">{team.name}</div>
              <div className="text-xs text-[var(--muted)]">Team created successfully</div>
            </div>
          </div>

          <div className="bg-[var(--surface2)] border border-[var(--border2)] rounded-xl p-5 text-center">
            <div className="text-xs text-[var(--muted)] mb-2 uppercase tracking-wide font-medium">Invite Code</div>
            <div className="font-mono text-3xl font-black tracking-[0.2em] text-brand-400 mb-4">{team.invite_code}</div>
            <Button variant="secondary" onClick={copyCode}>{codeCopied ? '✓ Copied!' : 'Copy Code'}</Button>
          </div>

          <p className="text-xs text-[var(--muted)] text-center">
            Share this code with athletes. They enter it when they sign up to join your team and connect to your coaching bot.
          </p>
        </div>
      )}
    </Shell>
  );

  return null;
}

// ── Compact workout row for the wizard ───────────────────────────────────────
function WorkoutRowSimple({ day, wo, saving, saved, onChange, onSave }: {
  day: string; wo: Workout; saving: boolean; saved: boolean;
  onChange: (field: keyof Workout, val: any) => void;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasContent = !!wo.title;

  return (
    <div className={`bg-[var(--surface)] border rounded-xl overflow-hidden transition-all ${hasContent ? 'border-[var(--border)]' : 'border-dashed border-[var(--border)]'}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="w-10 text-xs font-semibold text-[var(--muted)] shrink-0">{day.slice(0, 3)}</div>
        <div className="flex-1 min-w-0">
          {hasContent ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{wo.title}</span>
              {wo.distance_miles && <span className="text-xs text-brand-400">{wo.distance_miles}mi</span>}
            </div>
          ) : (
            <span className="text-sm text-[var(--muted)]">Rest day — click to add workout</span>
          )}
        </div>
        {saved && <span className="text-xs text-brand-400 shrink-0">✓</span>}
        <span className="text-[var(--muted)] text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-[var(--border)]">
          <div className="pt-3 grid grid-cols-2 gap-3">
            <Input label="Workout title" value={wo.title} onChange={e => onChange('title', e.target.value)} placeholder="e.g. Easy Recovery Run" />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Distance (mi)" type="number" value={wo.distance_miles} onChange={e => onChange('distance_miles', e.target.value)} placeholder="6" />
              <Input label="Pace target" value={wo.pace_guideline} onChange={e => onChange('pace_guideline', e.target.value)} placeholder="Easy" />
            </div>
          </div>
          <Textarea label="Description" value={wo.description} onChange={e => onChange('description', e.target.value)} rows={2} placeholder="What should the athlete feel during this workout?" />
          <div className="flex items-center justify-between">
            <Toggle checked={wo.ai_adjustable} onChange={v => onChange('ai_adjustable', v)} label="AI can adjust this workout" />
            <Button variant="primary" size="sm" loading={saving} onClick={onSave}>Save Day</Button>
          </div>
        </div>
      )}
    </div>
  );
}
