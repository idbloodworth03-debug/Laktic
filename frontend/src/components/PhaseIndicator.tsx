interface PhaseIndicatorProps {
  phase: string;
  weeksToRace?: number | null;
}

const PHASE_CONFIG: Record<string, { label: string; color: string; desc: string }> = {
  ease_in:         { label: 'Ease-In',        color: '#6b7280', desc: 'Rebuilding base fitness' },
  base:            { label: 'Base',            color: '#60a5fa', desc: 'Building aerobic foundation' },
  pre_competition: { label: 'Pre-Competition', color: '#a78bfa', desc: 'Sharpening race fitness' },
  competition:     { label: 'Competition',     color: '#00E5A0', desc: 'Race-ready, stay sharp' },
  build:           { label: 'Build',           color: '#f59e0b', desc: 'Adding volume and intensity' },
  taper:           { label: 'Taper',           color: '#f97316', desc: 'Reducing load for race day' },
  recovery:        { label: 'Recovery',        color: '#6b7280', desc: 'Active recovery week' },
};

export function PhaseIndicator({ phase, weeksToRace }: PhaseIndicatorProps) {
  const config = PHASE_CONFIG[phase] ?? { label: phase, color: '#6b7280', desc: '' };

  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-4 shadow-card">
      <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Training Phase</p>
      <div className="flex items-center gap-3">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: config.color, boxShadow: `0 0 8px ${config.color}60` }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]" style={{ color: config.color }}>
            {config.label}
          </p>
          {config.desc && (
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">{config.desc}</p>
          )}
        </div>
        {weeksToRace != null && weeksToRace > 0 && (
          <div className="text-right flex-shrink-0">
            <p className="font-mono text-sm font-semibold text-[var(--color-text-primary)]">{weeksToRace}</p>
            <p className="text-[10px] text-[var(--color-text-tertiary)]">wks to race</p>
          </div>
        )}
      </div>
    </div>
  );
}
