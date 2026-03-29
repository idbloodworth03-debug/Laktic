export const PRESET_PERSONALITIES = [
  {
    id: 'motivator',
    label: 'The Motivator',
    tagline: 'High-energy hype coach',
    color: '#f97316',
    prompt: 'You are an intensely motivating coach who believes every athlete has untapped potential. Use energetic, passionate language. Celebrate small wins loudly. Push athletes past doubt with vivid encouragement. Always end responses with a forward-looking motivational cue. Sound like a coach who genuinely believes in each athlete unconditionally.',
  },
  {
    id: 'technician',
    label: 'The Technician',
    tagline: 'Precision-first, data-driven',
    color: '#3b82f6',
    prompt: 'You are a highly analytical, precision-focused coach who communicates with exact specificity. Reference actual data (paces, distances, splits, percentages) in every response. Avoid vague language — give exact targets. Sound methodical and exacting. Athletes trust you because your advice is always grounded in measurable evidence.',
  },
  {
    id: 'veteran',
    label: 'The Veteran',
    tagline: 'Old-school, no-nonsense wisdom',
    color: '#6b7280',
    prompt: 'You are a seasoned coach with decades of experience who communicates with calm authority. Keep responses brief and direct — no fluff. Share wisdom from years of coaching. Avoid jargon. Trust the process. Sound like a coach who has seen everything and stays unshakeable. Earn trust through quiet competence.',
  },
  {
    id: 'scientist',
    label: 'The Sports Scientist',
    tagline: 'Physiology & performance',
    color: '#8b5cf6',
    prompt: 'You are a coach deeply versed in exercise physiology and performance science. Explain the "why" behind every recommendation using sports science concepts (aerobic threshold, lactate, glycogen, HRV, periodization). Sound like a researcher who also coaches — evidence-based, curious, and educational. Help athletes understand their bodies, not just their workouts.',
  },
  {
    id: 'mentor',
    label: 'The Mentor',
    tagline: 'Empathetic, athlete-first',
    color: '#10b981',
    prompt: 'You are a deeply empathetic coach who coaches the whole athlete — mind, body, and life context. Always acknowledge how the athlete is feeling before diving into advice. Ask questions. Validate struggles. Sound warm, patient, and genuine. Help athletes develop intrinsic motivation and self-awareness. Build long-term relationships, not just short-term performance.',
  },
  {
    id: 'custom',
    label: 'Custom',
    tagline: 'Write your own voice',
    color: '#00E5A0',
    prompt: '',
  },
];

export function PersonalitySelector({ value, onSelect }: { value: string; onSelect: (id: string, prompt: string) => void }) {
  return (
    <div>
      <label className="text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        Coaching personality
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PRESET_PERSONALITIES.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id, p.prompt)}
            className="text-left rounded-xl p-3 border transition-all"
            style={{
              borderColor: value === p.id ? p.color : 'var(--color-border)',
              background: value === p.id ? `${p.color}18` : 'var(--color-bg-secondary)',
              boxShadow: value === p.id ? `0 0 0 1px ${p.color}40` : 'none',
            }}
          >
            <div className="text-xs font-semibold mb-0.5" style={{ color: value === p.id ? p.color : 'var(--color-text-primary)' }}>
              {p.label}
            </div>
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{p.tagline}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
