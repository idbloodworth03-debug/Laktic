import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Card, Badge, Spinner, Input } from '../components/ui';
import { derivePaceBands, deriveEventPaces } from '../utils/paceCalculator';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Phase color mappings for badge component
const PHASE_BADGE_COLOR: Record<string, 'gray' | 'blue' | 'purple' | 'amber' | 'green'> = {
  base: 'gray', build: 'blue', sharpening: 'purple',
  taper: 'amber', race: 'green', recovery: 'gray',
};

// Phase left-border colors for workout cards
const PHASE_BORDER_COLOR: Record<string, string> = {
  base:       '#4B5563',
  build:      '#60A5FA',
  sharpening: '#C084FC',
  taper:      '#FBBF24',
  race:       '#00E5A0',
  recovery:   '#4B5563',
};

// ── Workout type detection + color system ─────────────────────────────────────
type WorkoutType = 'easy' | 'tempo' | 'intervals' | 'long' | 'race' | 'rest' | 'default';

function getWorkoutType(title: string, isRestDay: boolean): WorkoutType {
  if (isRestDay) return 'rest';
  const t = title.toLowerCase();
  if (/race/.test(t)) return 'race';
  if (/long run|long$/.test(t)) return 'long';
  if (/tempo|threshold|comfortably hard|lactate/.test(t)) return 'tempo';
  if (/interval|repeat|track|speed|fartlek|vo2|mile rep/.test(t)) return 'intervals';
  if (/easy|recovery run|recovery|jog|aerobic/.test(t)) return 'easy';
  return 'default';
}

const WORKOUT_TYPE_STYLE: Record<WorkoutType, { border: string; bg: string; dot: string }> = {
  easy:      { border: 'rgba(0,229,160,0.75)',  bg: 'rgba(0,229,160,0.13)',   dot: '#00E5A0' },
  tempo:     { border: 'rgba(251,146,60,0.80)',  bg: 'rgba(251,146,60,0.13)',  dot: '#fb923c' },
  intervals: { border: 'rgba(248,113,113,0.80)', bg: 'rgba(239,68,68,0.13)',   dot: '#f87171' },
  long:      { border: 'rgba(192,132,252,0.80)', bg: 'rgba(168,85,247,0.13)',  dot: '#c084fc' },
  race:      { border: 'rgba(0,229,160,0.95)',   bg: 'rgba(0,229,160,0.14)',   dot: '#00E5A0' },
  rest:      { border: 'rgba(255,255,255,0.12)', bg: 'rgba(255,255,255,0.03)', dot: 'var(--color-text-tertiary)' },
  default:   { border: 'rgba(255,255,255,0.18)', bg: 'rgba(255,255,255,0.05)', dot: 'var(--color-text-tertiary)' },
};

// Phase pill styles (week selector)
const PHASE_PILL_STYLE = (phase: string, active: boolean, isToday: boolean): React.CSSProperties => {
  if (active) {
    const bg: Record<string, string> = {
      base:       'var(--color-bg-hover)',
      build:      'rgba(59,130,246,0.15)',
      sharpening: 'rgba(168,85,247,0.15)',
      taper:      'rgba(245,158,11,0.15)',
      race:       'var(--color-accent-dim)',
      recovery:   'var(--color-bg-hover)',
    };
    const border: Record<string, string> = {
      base:       'var(--color-border-light)',
      build:      'rgba(96,165,250,0.5)',
      sharpening: 'rgba(192,132,252,0.5)',
      taper:      'rgba(251,191,36,0.5)',
      race:       'rgba(0,229,160,0.5)',
      recovery:   'var(--color-border-light)',
    };
    const color: Record<string, string> = {
      base:       'var(--color-text-primary)',
      build:      '#93C5FD',
      sharpening: '#D8B4FE',
      taper:      '#FCD34D',
      race:       'var(--color-accent)',
      recovery:   'var(--color-text-primary)',
    };
    return {
      background: bg[phase] ?? bg.base,
      border: `1px solid ${border[phase] ?? border.base}`,
      color: color[phase] ?? color.base,
    };
  }
  if (isToday) {
    return {
      background: 'var(--color-accent-dim)',
      border: '1px solid rgba(0,229,160,0.3)',
      color: 'var(--color-accent)',
    };
  }
  const color: Record<string, string> = {
    base:       'var(--color-text-tertiary)',
    build:      '#60A5FA',
    sharpening: '#C084FC',
    taper:      '#FBBF24',
    race:       'var(--color-accent)',
    recovery:   'var(--color-text-tertiary)',
  };
  return {
    background: 'transparent',
    border: '1px solid var(--color-border)',
    color: color[phase] ?? color.base,
  };
};

// Phase calendar cell styles
const PHASE_CAL: Record<string, { background: string; color: string; border: string }> = {
  base:       { background: 'var(--color-bg-hover)',         color: 'var(--color-text-secondary)', border: 'var(--color-border-light)' },
  build:      { background: 'rgba(59,130,246,0.12)',         color: '#93C5FD',                     border: 'rgba(59,130,246,0.2)' },
  sharpening: { background: 'rgba(168,85,247,0.12)',         color: '#D8B4FE',                     border: 'rgba(168,85,247,0.2)' },
  taper:      { background: 'rgba(245,158,11,0.12)',         color: '#FCD34D',                     border: 'rgba(245,158,11,0.2)' },
  race:       { background: 'var(--color-accent-dim)',       color: 'var(--color-accent)',          border: 'rgba(0,229,160,0.2)' },
  recovery:   { background: 'var(--color-bg-tertiary)',      color: 'var(--color-text-tertiary)',   border: 'var(--color-border)' },
};

type CalWorkout = {
  title: string;
  distance_miles?: number;
  pace_guideline?: string;
  description?: string;
  library_description?: string;
  workout_key?: string;
  change_reason?: string;
  why?: string;
  phase: string;
  dateLabel: string;
  date?: string;
  type?: string;
};

// ── Placeholder substitution ──────────────────────────────────────────────────
function replacePlaceholders(
  text: string,
  paceBands: { LT2: string; LT1: string; steady: string; easy: string; recovery: string; needs_aerobic_pr: boolean } | null | undefined,
  eventPaces: { mile_pace: string | null; pace_1500: string | null; pace_800: string | null; pace_5k: string | null } | null | undefined,
  wo: CalWorkout,
): string {
  const warmup  = wo.type === 'long_run' || wo.type === 'easy' ? '' : '1';
  const cooldown = wo.type === 'long_run' || wo.type === 'easy' ? '' : '1';
  let out = text;
  if (paceBands && !paceBands.needs_aerobic_pr) {
    out = out.replace(/\{lt2_pace\}/g, paceBands.LT2);
    out = out.replace(/\{lt1_pace\}/g, paceBands.LT1);
    out = out.replace(/\{easy_pace\}/g, paceBands.easy);
  }
  if (eventPaces?.mile_pace) out = out.replace(/\{mile_pace\}/g, eventPaces.mile_pace);
  if (eventPaces?.pace_800)  out = out.replace(/\{pace_800\}/g, eventPaces.pace_800);
  out = out.replace(/\{warmup_distance\}/g, warmup || '1');
  out = out.replace(/\{cooldown_distance\}/g, cooldown || '1');
  // Remove any remaining unmatched placeholders
  out = out.replace(/\{[a-z_]+\}/g, '');
  return out;
}

// ── Description section parser ────────────────────────────────────────────────
type DescSection = { label: string; text: string; color: string; italic?: boolean; noBorder?: boolean };

function parseDescription(desc: string): DescSection[] | null {
  const SECTION_PATTERNS: { re: RegExp; label: string; color: string; italic?: boolean; noBorder?: boolean }[] = [
    { re: /^Warmup:/i,                     label: 'Warmup',           color: '#9ca3af' },
    { re: /^Main\s*[Ss]et:/i,             label: 'Main Set',          color: '#00E5A0' },
    { re: /^Cooldown:/i,                   label: 'Cooldown',          color: '#9ca3af' },
    { re: /^Coaching\s*[Cc]ue:/i,         label: 'Pace Says',         color: '#f59e0b' },
    { re: /^Focus:/i,                      label: 'Focus',             color: 'var(--color-text-tertiary)', italic: true, noBorder: true },
    { re: /^Why\s+it'?s?\s+in\s+your\s+plan:/i, label: 'Why This Workout', color: 'var(--color-text-tertiary)', italic: true, noBorder: true },
  ];

  // Split on double-newlines first (canonical format from new prompt)
  const blocks = desc.split(/\n\n+/).map(b => b.trim()).filter(Boolean);

  if (blocks.length >= 2) {
    // Check if any block starts with a known section label
    const hasLabels = blocks.some(b => SECTION_PATTERNS.some(p => p.re.test(b)));
    if (hasLabels) {
      return blocks.map(block => {
        for (const p of SECTION_PATTERNS) {
          if (p.re.test(block)) {
            const text = block.replace(p.re, '').trim();
            return { label: p.label, text, color: p.color };
          }
        }
        return { label: '', text: block, color: 'rgba(255,255,255,0.15)' };
      });
    }
  }

  // Fallback: try inline section splitting (old format)
  const inlineParts = desc.split(/(?=Warmup:|Main\s*[Ss]et:|Cooldown:|Coaching\s*[Cc]ue:|Focus:|Why\s+it)/i).filter(Boolean);
  if (inlineParts.length >= 2) {
    return inlineParts.map(part => {
      for (const p of SECTION_PATTERNS) {
        if (p.re.test(part)) {
          return { label: p.label, text: part.replace(p.re, '').trim().replace(/\.$/, ''), color: p.color };
        }
      }
      return { label: '', text: part.trim(), color: 'rgba(255,255,255,0.15)' };
    });
  }

  return null;
}

// ── Workout detail modal ──────────────────────────────────────────────────────
interface WorkoutModalProps {
  wo: CalWorkout;
  onClose: () => void;
  isCompleted?: boolean;
  onComplete?: () => void;
  togglingComplete?: boolean;
  paceBands?: { LT2: string; LT1: string; steady: string; easy: string; recovery: string; needs_aerobic_pr: boolean } | null;
  eventPaces?: { mile_pace: string | null; pace_1500: string | null; pace_800: string | null; pace_5k: string | null } | null;
  onAskPace?: () => void;
  primaryPrediction?: { raceWeekPrediction: string; targetDistance: string } | null;
}

// Replaces technical running terms with plain-language equivalents
function simplifyText(text: string): string {
  return text
    .replace(/\bLT2 effort\b/gi, 'hard effort')
    .replace(/\bLT1 effort\b/gi, 'steady effort')
    .replace(/\bat LT2 effort\b/gi, 'at a hard effort')
    .replace(/\bat LT1 effort\b/gi, 'at a steady effort')
    .replace(/\bthreshold effort\b/gi, 'comfortably hard effort')
    .replace(/\bthreshold pace\b/gi, 'comfortably hard pace')
    .replace(/\bat threshold\b/gi, 'at a comfortably hard pace')
    .replace(/\bthreshold\b/gi, 'comfortably hard')
    .replace(/\bat LT2\b/gi, 'at a hard pace')
    .replace(/\bat LT1\b/gi, 'at a steady pace')
    .replace(/\bLT2\b/gi, 'hard pace')
    .replace(/\bLT1\b/gi, 'steady pace')
    .replace(/\blactate threshold\b/gi, 'sustainable top pace')
    .replace(/\bVO2 ?max\b/gi, 'max effort')
    .replace(/\baerobic base\b/gi, 'endurance base');
}

function WorkoutModal({ wo, onClose, isCompleted, onComplete, togglingComplete, paceBands, eventPaces, onAskPace, primaryPrediction }: WorkoutModalProps) {
  const [tab, setTab] = useState<'overview' | 'details'>('overview');
  const typeStyle = WORKOUT_TYPE_STYLE[getWorkoutType(wo.title, false)];
  const rawDesc = wo.description || wo.library_description || '';
  const resolvedDesc = rawDesc ? replacePlaceholders(rawDesc, paceBands, eventPaces, wo) : '';
  const sections = resolvedDesc ? parseDescription(resolvedDesc) : null;
  const simplifiedSections = sections
    ? sections.map(s => ({ ...s, text: simplifyText(s.text) }))
    : null;

  // Derive display paces
  const wt = getWorkoutType(wo.title, false);
  const derivedPace = (() => {
    if (!paceBands || paceBands.needs_aerobic_pr) return null;
    if (wt === 'easy' || wt === 'long') return { label: 'Easy', value: paceBands.easy };
    if (wt === 'tempo') return { label: 'LT1/Tempo', value: paceBands.LT1 };
    if (wt === 'intervals') return { label: 'LT2/Threshold', value: paceBands.LT2 };
    return null;
  })();
  const simplifiedPaceLabel = (() => {
    if (!derivedPace) return null;
    if (wt === 'easy' || wt === 'long') return 'Easy effort';
    if (wt === 'tempo') return 'Comfortably hard';
    if (wt === 'intervals') return 'Hard effort';
    return derivedPace.label;
  })();
  const eventPaceDisplay = (() => {
    if (!eventPaces) return null;
    if (wt === 'intervals' && eventPaces.mile_pace) return { label: 'Mile', value: eventPaces.mile_pace };
    if (wt === 'race' && eventPaces.pace_5k) return { label: '5K', value: eventPaces.pace_5k };
    return null;
  })();

  const PHASE_BADGE: Record<string, { bg: string; color: string }> = {
    ease_in:       { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
    base:          { bg: 'rgba(0,229,160,0.1)',   color: '#00E5A0' },
    build:         { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
    pre_competition:{ bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
    competition:   { bg: 'rgba(0,229,160,0.12)',   color: '#00E5A0' },
    taper:         { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
    recovery:      { bg: 'rgba(75,85,99,0.2)',     color: '#6b7280' },
    sharpening:    { bg: 'rgba(192,132,252,0.15)', color: '#c084fc' },
  };
  const phaseBadge = PHASE_BADGE[wo.phase] ?? PHASE_BADGE.base;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-[600px] sm:mx-4 sm:mb-0 sm:rounded-[20px] fade-up"
        style={{
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTop: `3px solid ${typeStyle.dot}`,
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.8)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-lg transition-all"
            style={{ borderRadius: '50%', color: 'var(--color-text-tertiary)', background: 'rgba(255,255,255,0.05)' }}
          >
            ×
          </button>

          <div className="flex items-center gap-2 mb-2 pr-8">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full capitalize"
              style={{ background: phaseBadge.bg, color: phaseBadge.color }}
            >
              {wo.phase.replace('_', ' ')}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{wo.dateLabel}</span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold leading-snug" style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif' }}>
              {wo.title}
            </h2>
            {wo.distance_miles != null && (
              <div className="text-right shrink-0">
                <div
                  className="font-semibold leading-none"
                  style={{ fontFamily: 'DM Mono, monospace', fontSize: 22, color: typeStyle.dot }}
                >
                  {wo.distance_miles}
                  <span className="text-xs font-normal ml-1" style={{ color: 'var(--color-text-tertiary)' }}>mi</span>
                </div>
                <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: 'var(--color-text-tertiary)' }}>total</div>
              </div>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 mt-4" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 3 }}>
            {(['overview', 'details'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize"
                style={tab === t ? {
                  background: '#1a1a1a',
                  color: 'var(--color-text-primary)',
                  border: '1px solid rgba(255,255,255,0.1)',
                } : {
                  background: 'transparent',
                  color: 'var(--color-text-tertiary)',
                  border: '1px solid transparent',
                }}
              >
                {t === 'details' ? 'Run Description' : 'Overview'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">

          {tab === 'overview' ? (
            <>
              {/* Simplified workout steps */}
              {resolvedDesc && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-tertiary)' }}>The Workout</p>
                  {simplifiedSections ? (
                    <div className="space-y-3">
                      {simplifiedSections.map((s, i) => (
                        <div
                          key={i}
                          className={s.noBorder ? 'py-1' : 'pl-3 py-1'}
                          style={s.noBorder ? undefined : { borderLeft: `2px solid ${s.color}` }}
                        >
                          {s.label && (
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: s.color }}>{s.label}</p>
                          )}
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)', fontStyle: s.italic ? 'italic' : undefined }}>
                            {s.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{simplifyText(resolvedDesc)}</p>
                  )}
                </div>
              )}

              {/* Simplified performance impact */}
              {primaryPrediction && (() => {
                const wt2 = getWorkoutType(wo.title, false);
                if (wt2 === 'rest' || !wo.title) return null;
                let benefit = '';
                let blurb = '';
                if (wt2 === 'easy') {
                  benefit = 'Recovery & base building';
                  blurb = `Easy runs let your body recover and adapt. They're what makes the harder days possible — and key to reaching ${primaryPrediction.raceWeekPrediction} on race day.`;
                } else if (wt2 === 'long') {
                  benefit = 'Builds endurance';
                  blurb = `The long run trains your body to go the distance. Each one pushes your ceiling closer to ${primaryPrediction.raceWeekPrediction} for ${primaryPrediction.targetDistance}.`;
                } else if (wt2 === 'tempo') {
                  benefit = 'Improves your race pace';
                  blurb = `This run teaches your body to hold a faster pace for longer. Consistent tempo work is how you get from where you are to ${primaryPrediction.raceWeekPrediction}.`;
                } else if (wt2 === 'intervals' || wt2 === 'race') {
                  benefit = 'Race-day sharpness';
                  blurb = `Interval workouts push your speed ceiling. They directly target your ${primaryPrediction.targetDistance} goal pace — projected race week: ${primaryPrediction.raceWeekPrediction}.`;
                } else {
                  benefit = 'General fitness';
                  blurb = `Contributes to your overall progression toward ${primaryPrediction.raceWeekPrediction} at race week.`;
                }
                return (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-tertiary)' }}>What this does for you</p>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif' }}>{benefit}</p>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{blurb}</p>
                      <p className="font-mono text-[11px]" style={{ color: '#00E5A0', fontFamily: 'DM Mono, monospace' }}>Race week target: {primaryPrediction.raceWeekPrediction}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Simplified pace display */}
              {(wo.pace_guideline || derivedPace || eventPaceDisplay) && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-tertiary)' }}>Your Target Pace</p>
                  <div className="space-y-2">
                    {wo.pace_guideline && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Target</span>
                        <span className="font-mono text-xs font-medium" style={{ color: '#00E5A0', fontFamily: 'DM Mono, monospace' }}>{wo.pace_guideline}</span>
                      </div>
                    )}
                    {derivedPace && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{simplifiedPaceLabel}</span>
                        <span className="font-mono text-xs" style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Mono, monospace' }}>{derivedPace.value}</span>
                      </div>
                    )}
                    {eventPaceDisplay && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{eventPaceDisplay.label} pace</span>
                        <span className="font-mono text-xs" style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Mono, monospace' }}>{eventPaceDisplay.value}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Technical workout description (original) */}
              {resolvedDesc && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-tertiary)' }}>The Workout</p>
                  {sections ? (
                    <div className="space-y-3">
                      {sections.map((s, i) => (
                        <div
                          key={i}
                          className={s.noBorder ? 'py-1' : 'pl-3 py-1'}
                          style={s.noBorder ? undefined : { borderLeft: `2px solid ${s.color}` }}
                        >
                          {s.label && (
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: s.color }}>{s.label}</p>
                          )}
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)', fontStyle: s.italic ? 'italic' : undefined }}>
                            {s.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{resolvedDesc}</p>
                  )}
                </div>
              )}

              {/* Technical performance impact */}
              {primaryPrediction && (() => {
                const wt2 = getWorkoutType(wo.title, false);
                if (wt2 === 'rest' || !wo.title) return null;
                let primaryBenefit = '';
                let estimatedContribution = '';
                if (wt2 === 'easy') {
                  primaryBenefit = 'Aerobic recovery';
                  estimatedContribution = `Keeps training load sustainable — essential to reaching ${primaryPrediction.raceWeekPrediction} on race week.`;
                } else if (wt2 === 'long') {
                  primaryBenefit = 'Endurance base';
                  estimatedContribution = `Extends your aerobic ceiling, pushing your race week projection toward ${primaryPrediction.raceWeekPrediction} for ${primaryPrediction.targetDistance}.`;
                } else if (wt2 === 'tempo') {
                  primaryBenefit = 'Lactate threshold';
                  estimatedContribution = `Raises your sustainable race pace — each week of consistent threshold work moves you closer to ${primaryPrediction.raceWeekPrediction}.`;
                } else if (wt2 === 'intervals' || wt2 === 'race') {
                  primaryBenefit = 'Race-specific sharpness';
                  estimatedContribution = `Directly targets your ${primaryPrediction.targetDistance} race pace. Projected race week: ${primaryPrediction.raceWeekPrediction}.`;
                } else {
                  primaryBenefit = 'General fitness';
                  estimatedContribution = `Contributes to your overall progression toward ${primaryPrediction.raceWeekPrediction} at race week.`;
                }
                return (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-tertiary)' }}>Performance Impact</p>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'DM Sans, sans-serif' }}>{primaryBenefit}</p>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{estimatedContribution}</p>
                      <p className="font-mono text-[11px]" style={{ color: '#00E5A0', fontFamily: 'DM Mono, monospace' }}>Race week target: {primaryPrediction.raceWeekPrediction}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Technical paces */}
              {(wo.pace_guideline || derivedPace || eventPaceDisplay) && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-tertiary)' }}>Your Paces</p>
                  <div className="space-y-2">
                    {wo.pace_guideline && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Target</span>
                        <span className="font-mono text-xs font-medium" style={{ color: '#00E5A0', fontFamily: 'DM Mono, monospace' }}>{wo.pace_guideline}</span>
                      </div>
                    )}
                    {derivedPace && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{derivedPace.label}</span>
                        <span className="font-mono text-xs" style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Mono, monospace' }}>{derivedPace.value}</span>
                      </div>
                    )}
                    {eventPaceDisplay && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{eventPaceDisplay.label} pace</span>
                        <span className="font-mono text-xs" style={{ color: 'var(--color-text-secondary)', fontFamily: 'DM Mono, monospace' }}>{eventPaceDisplay.value}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Why this workout */}
              {(wo.why || wo.change_reason) && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-tertiary)' }}>Why this workout</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{wo.why || wo.change_reason}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {(onComplete || onAskPace) && (
          <div
            className="px-5 py-4 flex gap-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            {onComplete && (
              <button
                onClick={() => { onComplete(); onClose(); }}
                disabled={togglingComplete}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all"
                style={isCompleted ? {
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid rgba(255,255,255,0.1)',
                } : {
                  background: '#00E5A0',
                  color: '#000',
                  border: '1px solid transparent',
                }}
              >
                {togglingComplete ? '...' : isCompleted ? 'Mark Incomplete' : 'Mark Complete'}
              </button>
            )}
            {onAskPace && (
              <button
                onClick={onAskPace}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                Ask Pace about this
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Monthly calendar view ─────────────────────────────────────────────────────
function PlanMonthView({ plan }: { plan: any[] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<CalWorkout | null>(null);

  const workoutsByDate: Record<string, CalWorkout[]> = {};
  plan.forEach((week: any) => {
    week.workouts?.forEach((wo: any) => {
      if (wo.date && wo.title) {
        if (!workoutsByDate[wo.date]) workoutsByDate[wo.date] = [];
        workoutsByDate[wo.date].push({
          title: wo.title,
          distance_miles: wo.distance_miles ?? wo.total_distance,
          pace_guideline: wo.pace_guideline,
          description: wo.description,
          library_description: wo.library_description,
          workout_key: wo.workout_key,
          change_reason: wo.change_reason,
          why: wo.why,
          phase: week.phase || 'base',
          dateLabel: new Date(wo.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        });
      }
    });
  });

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      {selected && <WorkoutModal wo={selected} onClose={() => setSelected(null)} />}

      <div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="w-9 h-9 flex items-center justify-center text-xl transition-all"
            style={{
              borderRadius: 8,
              color: 'var(--color-text-secondary)',
              background: 'transparent',
            }}
          >
            ‹
          </button>
          <span className="font-semibold text-base" style={{ color: 'var(--color-text-primary)' }}>{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="w-9 h-9 flex items-center justify-center text-xl transition-all"
            style={{
              borderRadius: 8,
              color: 'var(--color-text-secondary)',
              background: 'transparent',
            }}
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 text-center mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-[11px] uppercase tracking-wide py-1" style={{ color: 'var(--color-text-tertiary)' }}>{d}</div>
          ))}
        </div>

        <div
          className="grid grid-cols-7 gap-px rounded-xl overflow-hidden"
          style={{ background: 'var(--color-border)' }}
        >
          {cells.map((day, i) => {
            const dateKey = day
              ? `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              : '';
            const dayWorkouts = dateKey ? (workoutsByDate[dateKey] || []) : [];
            const isToday =
              day === today.getDate() &&
              viewMonth === today.getMonth() &&
              viewYear === today.getFullYear();
            const hasWorkout = dayWorkouts.length > 0;

            return (
              <div
                key={i}
                onClick={() => hasWorkout && setSelected(dayWorkouts[0])}
                className="transition-colors"
                style={{
                  background: 'var(--color-bg-secondary)',
                  minHeight: 88,
                  padding: 6,
                  opacity: !day ? 0.2 : 1,
                  cursor: hasWorkout ? 'pointer' : 'default',
                }}
                onMouseEnter={e => {
                  if (hasWorkout) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-secondary)';
                }}
              >
                {day && (
                  <>
                    <div
                      className="text-xs w-6 h-6 flex items-center justify-center rounded-full mb-1 font-medium"
                      style={isToday ? {
                        background: 'var(--color-accent)',
                        color: '#000',
                        fontWeight: 700,
                      } : {
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      {day}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {dayWorkouts.map((wo, wi) => {
                        const cal = PHASE_CAL[wo.phase] ?? PHASE_CAL.base;
                        return (
                          <div
                            key={wi}
                            className="text-[10px] leading-tight px-1.5 py-0.5 rounded-md truncate font-medium"
                            style={{
                              background: cal.background,
                              color: cal.color,
                              border: `1px solid ${cal.border}`,
                            }}
                          >
                            {wo.title}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {['base', 'build', 'sharpening', 'taper', 'race', 'recovery'].map(phase => {
            const cal = PHASE_CAL[phase] ?? PHASE_CAL.base;
            return (
              <span key={phase} className="flex items-center gap-1.5 capitalize">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ background: cal.background, border: `1px solid ${cal.border}` }}
                />
                {phase}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Team Switcher ─────────────────────────────────────────────────────────────
function TeamSwitcher({ onTeamChange }: { onTeamChange: () => void }) {
  const [teams, setTeams] = useState<any[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState<any | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const load = () =>
    apiFetch('/api/athlete/teams').then(setTeams).catch(console.error);

  useEffect(() => { load(); }, []);

  const switchTeam = async (teamId: string) => {
    setSwitching(teamId);
    try {
      await apiFetch('/api/athlete/active-team', {
        method: 'PUT',
        body: JSON.stringify({ team_id: teamId }),
      });
      await load();
      onTeamChange();
    } catch (e: any) { console.error(e); }
    finally { setSwitching(null); }
  };

  const leaveTeam = async (team: any) => {
    setLeaving(team.id);
    try {
      await apiFetch('/api/athlete/teams/leave', {
        method: 'POST',
        body: JSON.stringify({ team_id: team.id }),
      });
      setConfirmLeave(null);
      await load();
      onTeamChange();
    } catch (e: any) { console.error(e); }
    finally { setLeaving(null); }
  };

  const joinTeam = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinError('');
    setJoining(true);
    try {
      await apiFetch(`/api/athlete/join/${code}`, { method: 'POST' });
      setJoinCode('');
      setShowJoin(false);
      await load();
      onTeamChange();
    } catch (e: any) { setJoinError(e.message || 'Invalid invite code'); }
    finally { setJoining(false); }
  };

  if (teams.length === 0 && !showJoin) return null;

  return (
    <>
      {confirmLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setConfirmLeave(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative p-6 w-full max-w-sm"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-light)',
              borderRadius: 20,
              boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-base mb-2" style={{ color: 'var(--color-text-primary)' }}>Leave {confirmLeave.name}?</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--color-text-secondary)' }}>
              You will lose access to this team's training plan. You can rejoin later with an invite code.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setConfirmLeave(null)}>Cancel</Button>
              <Button variant="danger" size="sm" loading={leaving === confirmLeave.id} onClick={() => leaveTeam(confirmLeave)}>Leave Team</Button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-5 fade-up">
        <div className="flex items-center gap-2 flex-wrap">
          {teams.map(t => (
            <div key={t.id} className="flex items-center gap-1">
              <button
                onClick={() => !t.is_active && switchTeam(t.id)}
                disabled={!!switching}
                className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-all duration-150"
                style={t.is_active ? {
                  background: 'var(--color-accent)',
                  border: '1px solid var(--color-accent)',
                  borderRadius: 8,
                  color: '#000',
                } : {
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  color: 'var(--color-text-secondary)',
                }}
              >
                {switching === t.id && <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />}
                {t.name}
                {t.is_active && <span className="text-[10px] opacity-75">· active</span>}
              </button>
              <button
                onClick={() => setConfirmLeave(t)}
                className="w-5 h-5 flex items-center justify-center text-xs transition-all"
                style={{ borderRadius: 4, color: 'var(--color-text-tertiary)' }}
                title={`Leave ${t.name}`}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#F87171'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-tertiary)'; }}
              >
                ×
              </button>
            </div>
          ))}

          {showJoin ? (
            <div className="flex items-center gap-2">
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && joinTeam()}
                placeholder="INVITE CODE"
                maxLength={8}
                autoFocus
                className="w-28 text-xs uppercase tracking-widest outline-none transition-all"
                style={{
                  background: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border-light)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  color: 'var(--color-text-primary)',
                }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--color-accent)'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--color-border-light)'; }}
              />
              <Button size="sm" variant="primary" loading={joining} onClick={joinTeam}>Join</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowJoin(false); setJoinCode(''); setJoinError(''); }}>Cancel</Button>
              {joinError && <span className="text-xs text-red-400">{joinError}</span>}
            </div>
          ) : (
            <button
              onClick={() => setShowJoin(true)}
              className="px-3 py-1.5 text-xs font-medium transition-all duration-150"
              style={{
                background: 'transparent',
                border: '1px dashed var(--color-border)',
                borderRadius: 8,
                color: 'var(--color-text-tertiary)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-tertiary)';
              }}
            >
              + Join Another Team
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Season Plan ───────────────────────────────────────────────────────────────
export function SeasonPlan() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();

  // Compute pace bands client-side from profile so workout cards can show target paces
  const paceBands = useMemo(() => profile ? derivePaceBands(profile as Record<string, unknown>) : null, [profile]);
  const eventPaces = useMemo(() => profile ? deriveEventPaces(profile as Record<string, unknown>) : null, [profile]);

  const [season, setSeason] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<CalWorkout | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [planView, setPlanView] = useState<'weekly' | 'monthly'>('weekly');
  const [pollJobId, setPollJobId] = useState<string | null>(null);
  const [regenSuccess, setRegenSuccess] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [sharingMilestone, setSharingMilestone] = useState<string | null>(null);
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [togglingDate, setTogglingDate] = useState<string | null>(null);
  const [primaryPrediction, setPrimaryPrediction] = useState<{ raceWeekPrediction: string; targetDistance: string } | null>(null);
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const loadSeason = () => {
    setLoading(true);
    apiFetch('/api/athlete/season').then(({ season }) => {
      setSeason(season);
      if (season?.season_plan?.length) {
        const today = new Date().toISOString().split('T')[0];
        const idx = season.season_plan.findIndex((w: any) => w.week_start_date <= today && (
          !season.season_plan[season.season_plan.indexOf(w) + 1] ||
          season.season_plan[season.season_plan.indexOf(w) + 1].week_start_date > today
        ));
        setCurrentWeek(Math.max(0, idx));
      }
    }).catch(console.error).finally(() => setLoading(false));
  };

  const loadCompletions = () => {
    apiFetch('/api/athlete/workouts/completions')
      .then((dates: string[]) => setCompletedDates(new Set(dates)))
      .catch(console.error);
  };

  useEffect(() => {
    loadSeason();
    loadCompletions();
    apiFetch('/api/athlete/predictions')
      .then((d: any) => {
        const p = d?.primaryPrediction ?? d?.predictions?.[0] ?? null;
        if (p && !p.needsMoreData) {
          setPrimaryPrediction({ raceWeekPrediction: p.raceWeekPrediction, targetDistance: p.targetDistance });
        }
      })
      .catch(() => {});
  }, []);

  // Auto-refetch when the coaching agent updates the plan via tool calls
  useEffect(() => {
    const channel = supabase
      .channel('season-plan-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'athlete_seasons' }, () => {
        loadSeason();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    apiFetch('/api/milestones/check', { method: 'POST' })
      .then(({ unshared }) => setMilestones(unshared || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!pollJobId) return;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const data = await apiFetch(`/api/plans/status/${pollJobId}`);
        if (data.status === 'complete') {
          clearInterval(interval);
          setPollJobId(null);
          const { season: updated } = await apiFetch('/api/athlete/season');
          setSeason(updated);
          setCurrentWeek(0);
          setRegenerating(false);
          setRegenSuccess(true);
          setTimeout(() => setRegenSuccess(false), 2000);
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setPollJobId(null);
          setRegenerating(false);
          setRegenError(data.jobError || 'Plan generation failed. Please try again.');
        } else if (attempts >= MAX_ATTEMPTS) {
          clearInterval(interval);
          setPollJobId(null);
          setRegenerating(false);
          setRegenError('Plan generation is taking longer than expected. Refresh the page in a minute.');
        }
      } catch {
        // transient network error — keep polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pollJobId]);

  const shareMilestone = async (id: string) => {
    setSharingMilestone(id);
    try {
      await apiFetch(`/api/milestones/${id}/share`, { method: 'POST' });
      setMilestones(prev => prev.filter(m => m.id !== id));
    } catch (e: any) { console.error(e); }
    finally { setSharingMilestone(null); }
  };

  const toggleComplete = async (date: string) => {
    if (togglingDate === date) return;
    setTogglingDate(date);
    const isCompleted = completedDates.has(date);
    try {
      await apiFetch(`/api/athlete/workouts/${date}/complete`, {
        method: isCompleted ? 'DELETE' : 'POST',
      });
      setCompletedDates(prev => {
        const next = new Set(prev);
        if (isCompleted) next.delete(date); else next.add(date);
        return next;
      });
    } catch (e: any) { console.error(e); }
    finally { setTogglingDate(null); }
  };

  const generateInitialPlan = async () => {
    setRegenError(null);
    setRegenerating(true);
    try {
      const data = await apiFetch('/api/athlete/season/generate', { method: 'POST' });
      if (data.status === 'generating' && data.jobId) {
        setPollJobId(data.jobId);
      } else {
        const { season: updated } = await apiFetch('/api/athlete/season');
        setSeason(updated);
        setRegenerating(false);
      }
    } catch (e: any) {
      setRegenerating(false);
      setRegenError(e?.message || 'Something went wrong. Please try again.');
    }
  };

  const regenerate = async () => {
    setConfirmRegen(false);
    setRegenError(null);
    const prevSeason = season;
    setRegenerating(true);
    setSeason(null);
    try {
      const data = await apiFetch('/api/athlete/season/regenerate', { method: 'POST' });
      if (data.status === 'generating' && data.jobId) {
        // Timeout path — keep spinner up, poll until complete
        setPollJobId(data.jobId);
      } else if (data.season_plan) {
        // Sync path — backend returned the new plan directly
        setSeason({ ...(prevSeason ?? {}), season_plan: data.season_plan });
        setCurrentWeek(0);
        setRegenerating(false);
        setRegenSuccess(true);
        setTimeout(() => setRegenSuccess(false), 2000);
      } else {
        // Response came back but no plan data — force reload as fallback
        window.location.reload();
      }
    } catch (e: any) {
      // Restore the previous plan view so the athlete isn't stuck on a blank screen
      setSeason(prevSeason);
      setRegenerating(false);
      setRegenError(e?.message || 'Something went wrong. Please try again.');
    }
  };

  if (loading) {
    return (
      <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
          <Spinner size="lg" />
        </div>
      </AppLayout>
    );
  }

  if (!season) {
    return (
      <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
        <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
          <div className="max-w-xl mx-auto px-6 py-20 text-center">
            {regenerating ? (
              <>
                <div className="flex justify-center mb-6"><Spinner size="lg" /></div>
                <h1 className="font-bold text-xl mb-2" style={{ color: 'var(--color-text-primary)' }}>Building your plan…</h1>
                <p style={{ color: 'var(--color-text-secondary)' }}>Pace is putting together your personalized training plan. This usually takes under a minute.</p>
              </>
            ) : (
              <>
                <h1 className="font-bold text-xl mb-2" style={{ color: 'var(--color-text-primary)' }}>Your plan is being built.</h1>
                <p className="mb-6 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  Pace is putting together your personalized training plan. Check back in a moment.
                </p>
                {regenError && (
                  <p className="mb-4 text-sm text-red-400">{regenError}</p>
                )}
                <Button onClick={generateInitialPlan}>Generate My Plan</Button>
              </>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  const plan = season.season_plan || [];
  const week = plan[currentWeek];

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      {/* Workout detail modal */}
      {selectedWorkout && (
        <WorkoutModal
          wo={selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
          isCompleted={selectedWorkout.date ? completedDates.has(selectedWorkout.date) : false}
          onComplete={selectedWorkout.date ? () => toggleComplete(selectedWorkout.date!) : undefined}
          togglingComplete={selectedWorkout.date ? togglingDate === selectedWorkout.date : false}
          paceBands={paceBands}
          eventPaces={eventPaces}
          primaryPrediction={primaryPrediction}
          onAskPace={() => {
            const msg = encodeURIComponent(`Can you explain this workout: ${selectedWorkout.title}${selectedWorkout.distance_miles ? ` (${selectedWorkout.distance_miles} mi)` : ''}${selectedWorkout.date ? ` on ${selectedWorkout.dateLabel}` : ''}?`);
            nav(`/athlete/chat?q=${msg}`);
            setSelectedWorkout(null);
          }}
        />
      )}

      <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="max-w-5xl mx-auto px-6 py-8">

          {/* Header */}
          <div className="flex items-start justify-between mb-4 fade-up gap-4">
            <div>
              <h1 className="font-bold text-3xl" style={{ color: 'var(--color-text-primary)' }}>Season Plan</h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                Pace · {plan.length} weeks
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Link to="/athlete/races"><Button variant="ghost" size="sm">Races</Button></Link>
              <Link to="/athlete/chat"><Button variant="secondary" size="sm">Chat with Pace</Button></Link>
              {regenerating ? (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <Spinner size="sm" />
                  Your AI coach is building your new plan…
                </div>
              ) : confirmRegen ? (
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-xs max-w-xs text-right" style={{ color: 'var(--color-text-secondary)' }}>
                    This will replace your current training plan with a freshly generated one based on your latest data and race calendar. Continue?
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="danger" size="sm" onClick={regenerate}>Confirm</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRegen(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setConfirmRegen(true)}>Regenerate</Button>
              )}
            </div>
          </div>

          {/* Milestone banners */}
          {milestones.length > 0 && (
            <div className="mb-4 space-y-2 fade-up">
              {milestones.map(m => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl"
                  style={{
                    background: 'rgba(245,158,11,0.1)',
                    border: '1px solid rgba(245,158,11,0.3)',
                  }}
                >
                  <div>
                    <span className="text-xs font-medium" style={{ color: '#FCD34D' }}>New milestone</span>
                    <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{m.label}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="secondary" loading={sharingMilestone === m.id} onClick={() => shareMilestone(m.id)}>Share</Button>
                    <button
                      onClick={() => setMilestones(prev => prev.filter(x => x.id !== m.id))}
                      className="w-5 h-5 flex items-center justify-center text-sm transition-all"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Team switcher */}
          <TeamSwitcher onTeamChange={loadSeason} />

          {/* Regen success / error banners */}
          {regenSuccess && (
            <div
              className="mb-4 fade-up flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm"
              style={{
                background: 'rgba(0,229,160,0.08)',
                border: '1px solid rgba(0,229,160,0.25)',
                color: 'var(--color-accent)',
              }}
            >
              Your new plan is ready!
            </div>
          )}
          {regenError && (
            <div
              className="mb-4 fade-up flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-sm"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#F87171',
              }}
            >
              <span>{regenError}</span>
              <button onClick={() => setRegenError(null)} className="ml-2 shrink-0" style={{ color: '#F87171' }}>×</button>
            </div>
          )}

          {/* View toggle */}
          <div className="flex justify-center mb-6 fade-up-1">
            <div
              className="flex items-center gap-0.5 p-0.5"
              style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
              }}
            >
              {(['weekly', 'monthly'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setPlanView(v)}
                  className="px-5 py-1.5 text-sm font-medium capitalize transition-all duration-150"
                  style={planView === v ? {
                    background: 'var(--color-bg-hover)',
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 8,
                    color: 'var(--color-text-primary)',
                  } : {
                    background: 'transparent',
                    border: '1px solid transparent',
                    borderRadius: 8,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Monthly View */}
          {planView === 'monthly' && (
            <div className="fade-up-1">
              <Card>
                <PlanMonthView plan={plan} />
              </Card>
            </div>
          )}

          {/* Weekly View */}
          {planView === 'weekly' && (
            <>
              {/* Week selector — horizontal pill tabs with phase color coding */}
              <div className="flex gap-1.5 mb-6 overflow-x-auto pb-2 fade-up-1" style={{ scrollbarWidth: 'none' }}>
                {plan.filter((w: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.week_number === w.week_number) === i).map((w: any, i: number, deduped: any[]) => {
                  const originalIdx = plan.findIndex((x: any) => x.week_number === w.week_number);
                  const isToday = new Date().toISOString().split('T')[0] >= w.week_start_date &&
                    (originalIdx === plan.length - 1 || new Date().toISOString().split('T')[0] < plan[originalIdx + 1]?.week_start_date);
                  const phase = w.phase || 'base';
                  const isActive = originalIdx === currentWeek;
                  return (
                    <button
                      key={i}
                      onClick={() => setCurrentWeek(plan.findIndex((x: any) => x.week_number === w.week_number))}
                      className="px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-150 shrink-0"
                      style={{ borderRadius: 8, ...PHASE_PILL_STYLE(phase, isActive, isToday) }}
                    >
                      Wk {w.week_number}
                      {isToday && ' •'}
                    </button>
                  );
                })}
              </div>

              {week && (
                <div className="fade-up-2">
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="font-bold text-xl" style={{ color: 'var(--color-text-primary)' }}>Week {week.week_number}</h2>
                    <Badge label={week.phase || 'base'} color={PHASE_BADGE_COLOR[week.phase] ?? 'gray'} />
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      {new Date(week.week_start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="ml-auto flex gap-1.5">
                      <Button variant="ghost" size="sm" disabled={currentWeek === 0} onClick={() => setCurrentWeek(w => w - 1)}>Prev</Button>
                      <Button variant="ghost" size="sm" disabled={currentWeek === plan.length - 1} onClick={() => setCurrentWeek(w => w + 1)}>Next</Button>
                    </div>
                  </div>

                  {/* Week progress bar */}
                  {(() => {
                    const weekWorkouts = (week.workouts || []).filter((w: any) => !w.is_rest_day && (w.distance_miles > 0 || w.title));
                    const totalWorkouts = weekWorkouts.length;
                    const completedThisWeek = weekWorkouts.filter((w: any) => w.date && completedDates.has(w.date)).length;
                    if (totalWorkouts === 0) return null;
                    return (
                      <div className="mb-4 flex items-center gap-3">
                        <span className="text-xs shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                          {completedThisWeek}/{totalWorkouts} complete
                        </span>
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-tertiary)' }}>
                          <div className="h-full rounded-full" style={{ width: `${(completedThisWeek / totalWorkouts) * 100}%`, background: 'linear-gradient(to right, #00b87a, #00E5A0)' }} />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Calendar grid — dark cards with phase-color left border */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {DAYS.map((dayLabel, i) => {
                      const wo = week.workouts?.find((w: any) => w.day_of_week === i + 1);
                      const phase = week.phase || 'base';
                      const isCompleted = wo?.date ? completedDates.has(wo.date) : false;
                      const isToggling = wo?.date ? togglingDate === wo.date : false;
                      const canComplete = !!wo && !wo.is_rest_day && !!wo.date;
                      const woType = wo
                        ? WORKOUT_TYPE_STYLE[getWorkoutType(wo.title || '', !!wo.is_rest_day)]
                        : WORKOUT_TYPE_STYLE.default;

                      return (
                        <div
                          key={i}
                          onClick={() => {
                            if (!wo) return;
                            const dateStr = wo.date ?? '';
                            const dateLabel = dateStr
                              ? new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                              : dayLabel;
                            setSelectedWorkout({
                              title: wo.title || '',
                              distance_miles: wo.distance_miles ?? wo.total_distance,
                              pace_guideline: wo.pace_guideline,
                              description: wo.description,
                              library_description: wo.library_description,
                              workout_key: wo.workout_key,
                              change_reason: wo.change_reason,
                              why: wo.why,
                              phase: week.phase || 'base',
                              dateLabel,
                              date: wo.date,
                              type: wo.type,
                            });
                          }}
                          className="transition-all duration-150"
                          style={{
                            borderRadius: 14,
                            border: `1px solid ${wo ? (isCompleted ? 'rgba(0,229,160,0.25)' : 'rgba(255,255,255,0.13)') : 'var(--color-border)'}`,
                            borderLeft: wo ? `3px solid ${isCompleted ? 'var(--color-accent)' : woType.border}` : `1px dashed var(--color-border)`,
                            background: wo ? (isCompleted ? 'rgba(0,229,160,0.07)' : woType.bg) : 'rgba(255,255,255,0.02)',
                            padding: 16,
                            cursor: wo ? 'pointer' : 'default',
                            opacity: wo ? (isCompleted ? 0.6 : 1) : 0.35,
                          }}
                          onMouseEnter={e => {
                            if (wo && !isCompleted) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.26)';
                          }}
                          onMouseLeave={e => {
                            if (wo && !isCompleted) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.13)';
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                              {dayLabel}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {wo?.date && (
                                <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                  {new Date(wo.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                              {canComplete && (
                                <button
                                  onClick={e => { e.stopPropagation(); toggleComplete(wo.date); }}
                                  disabled={isToggling}
                                  title={isCompleted ? 'Mark incomplete' : 'Mark complete'}
                                  className="w-5 h-5 flex items-center justify-center rounded-full transition-all duration-150 shrink-0"
                                  style={isCompleted ? {
                                    background: 'var(--color-accent)',
                                    color: '#000',
                                    fontSize: 11,
                                    fontWeight: 700,
                                  } : {
                                    background: 'transparent',
                                    border: '1.5px solid var(--color-border-light)',
                                    color: 'var(--color-text-tertiary)',
                                    fontSize: 10,
                                  }}
                                >
                                  {isToggling ? (
                                    <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin block" />
                                  ) : isCompleted ? '✓' : ''}
                                </button>
                              )}
                            </div>
                          </div>
                          {wo ? (
                            <>
                              {/* Type dot + title */}
                              <div className="flex items-start gap-2 mb-2">
                                <span
                                  className="shrink-0 rounded-full"
                                  style={{
                                    width: 6, height: 6, marginTop: 5,
                                    background: isCompleted ? 'var(--color-text-tertiary)' : woType.dot,
                                  }}
                                />
                                <span
                                  className="text-sm leading-snug"
                                  style={{
                                    fontWeight: 500,
                                    color: isCompleted ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                                    textDecoration: isCompleted ? 'line-through' : 'none',
                                    textDecorationColor: 'rgba(255,255,255,0.15)',
                                  }}
                                >
                                  {wo.title}
                                </span>
                              </div>
                              {/* Distance + pace — prominent */}
                              {(wo.distance_miles || wo.pace_guideline) && (
                                <div className="flex items-baseline gap-3 pl-4">
                                  {wo.distance_miles && (
                                    <span
                                      className="font-mono font-semibold leading-none"
                                      style={{
                                        fontSize: 15,
                                        color: isCompleted ? 'var(--color-text-tertiary)' : woType.dot,
                                      }}
                                    >
                                      {wo.distance_miles}
                                      <span className="text-[10px] font-normal ml-0.5" style={{ color: 'var(--color-text-tertiary)' }}>mi</span>
                                    </span>
                                  )}
                                  {wo.pace_guideline && (
                                    <span
                                      className="font-mono text-xs"
                                      style={{ color: isCompleted ? 'rgba(255,255,255,0.18)' : 'var(--color-text-secondary)' }}
                                    >
                                      {wo.pace_guideline}
                                    </span>
                                  )}
                                  {/* Computed target pace from PR data */}
                                  {!isCompleted && (() => {
                                    const wt = getWorkoutType(wo.title || '', !!wo.is_rest_day);
                                    let target: string | null = null;
                                    if (paceBands && !paceBands.needs_aerobic_pr) {
                                      if (wt === 'easy' || wt === 'long') target = paceBands.easy;
                                      else if (wt === 'tempo') target = paceBands.LT1;
                                      else if (wt === 'intervals') target = paceBands.LT2;
                                    }
                                    if (!target && eventPaces) {
                                      if (wt === 'intervals' && eventPaces.mile_pace) target = eventPaces.mile_pace;
                                      else if (wt === 'race' && eventPaces.pace_5k) target = eventPaces.pace_5k;
                                    }
                                    if (!target) return null;
                                    return (
                                      <span className="font-mono text-[10px]" style={{ color: 'var(--color-accent)', opacity: 0.75 }}>
                                        {target}
                                      </span>
                                    );
                                  })()}
                                </div>
                              )}
                              {/* Prediction impact line */}
                              {primaryPrediction && !isCompleted && !wo.is_rest_day && (() => {
                                const wt = getWorkoutType(wo.title || '', false);
                                if (wt === 'easy') {
                                  return (
                                    <p className="text-[10px] pl-4 mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                                      Recovery — key to hitting {primaryPrediction.raceWeekPrediction}
                                    </p>
                                  );
                                }
                                if (wt === 'intervals' || wt === 'race') {
                                  return (
                                    <p className="font-mono text-[10px] pl-4 mt-0.5" style={{ color: '#00E5A0' }}>
                                      Sharpens race pace — projected {primaryPrediction.raceWeekPrediction} for {primaryPrediction.targetDistance}
                                    </p>
                                  );
                                }
                                // tempo, long, general
                                return (
                                  <p className="font-mono text-[10px] pl-4 mt-0.5" style={{ color: '#00E5A0' }}>
                                    Builds toward {primaryPrediction.raceWeekPrediction} at race week
                                  </p>
                                );
                              })()}
                            </>
                          ) : (
                            <div className="text-xs pl-1" style={{ color: 'var(--color-text-tertiary)' }}>Rest</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <div className="flex gap-5">
                      <span>
                        Total:{' '}
                        <strong className="font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                          {week.workouts?.reduce((sum: number, w: any) => sum + (w.distance_miles || 0), 0).toFixed(1)}mi
                        </strong>
                      </span>
                      <span>{week.workouts?.filter((w: any) => w.title).length} workouts</span>
                    </div>
                    {currentWeek > 0 && (() => {
                      const prevWeek = plan[currentWeek - 1];
                      const thisTotal = week.workouts?.reduce((s: number, w: any) => s + (w.distance_miles || 0), 0) || 0;
                      const prevTotal = prevWeek?.workouts?.reduce((s: number, w: any) => s + (w.distance_miles || 0), 0) || 0;
                      if (!prevTotal) return null;
                      const diff = ((thisTotal - prevTotal) / prevTotal * 100).toFixed(0);
                      const sign = Number(diff) >= 0 ? '+' : '';
                      return (
                        <span className="text-xs" style={{ color: Number(diff) >= 0 ? 'var(--color-accent)' : '#f87171' }}>
                          Last wk: {prevTotal.toFixed(1)}mi → This wk: {thisTotal.toFixed(1)}mi ({sign}{diff}%)
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
