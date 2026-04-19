import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

interface PaceBands {
  LT2: string;
  LT1: string;
  steady: string;
  easy: string;
  recovery: string;
  needs_aerobic_pr: boolean;
  source_pr: string | null;
}

interface EventPaces {
  mile_pace: string | null;
  rep_pace: string | null;
  pace_800: string | null;
  pace_1500: string | null;
  pace_5k: string | null;
}

interface PaceZonesData {
  bands: PaceBands;
  eventPaces: EventPaces;
  tier: 'beginner' | 'intermediate' | 'advanced';
}

const ZONE_ROWS: { key: keyof PaceBands; label: string; desc: string }[] = [
  { key: 'LT2',      label: 'LT2 / Threshold',  desc: 'Race-effort threshold' },
  { key: 'LT1',      label: 'LT1 / Tempo',       desc: 'Comfortably hard' },
  { key: 'steady',   label: 'Steady State',       desc: 'Aerobic development' },
  { key: 'easy',     label: 'Easy',               desc: 'Conversational pace' },
  { key: 'recovery', label: 'Recovery',            desc: 'Very easy, shake-out' },
];

export function PaceZonesCard() {
  const [data, setData] = useState<PaceZonesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/athlete/pace-zones')
      .then((d: PaceZonesData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card">
        <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-4">Pace Zones</p>
        <div className="animate-pulse space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-8 bg-[var(--color-bg-tertiary)] rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.bands.needs_aerobic_pr) {
    return (
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card">
        <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Pace Zones</p>
        <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
          Add a 3000m, 3200m, 5K, or 10K PR in Settings to unlock your personalized pace zones.
        </p>
        <a href="/athlete/settings" className="inline-block mt-3 text-xs font-medium text-[var(--color-accent)] hover:opacity-80 transition-opacity">
          Update profile →
        </a>
      </div>
    );
  }

  const { bands, eventPaces } = data;
  const hasEventPaces = eventPaces.mile_pace || eventPaces.pace_1500 || eventPaces.pace_800;

  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Pace Zones</p>
        {bands.source_pr && (
          <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono">from {bands.source_pr}</span>
        )}
      </div>

      <div className="space-y-1.5">
        {ZONE_ROWS.map(row => {
          const val = bands[row.key] as string;
          if (!val) return null;
          return (
            <div key={row.key} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
              <div>
                <p className="text-xs font-medium text-[var(--color-text-primary)]">{row.label}</p>
                <p className="text-[10px] text-[var(--color-text-tertiary)]">{row.desc}</p>
              </div>
              <span className="font-mono text-xs text-[var(--color-accent)]">{val}</span>
            </div>
          );
        })}
      </div>

      {hasEventPaces && (
        <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
          <p className="text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Event Paces</p>
          <div className="space-y-1">
            {eventPaces.mile_pace && (
              <div className="flex justify-between">
                <span className="text-[11px] text-[var(--color-text-tertiary)]">Mile / Rep pace</span>
                <span className="font-mono text-[11px] text-[var(--color-text-primary)]">{eventPaces.mile_pace}</span>
              </div>
            )}
            {eventPaces.pace_1500 && (
              <div className="flex justify-between">
                <span className="text-[11px] text-[var(--color-text-tertiary)]">1500m per 400m</span>
                <span className="font-mono text-[11px] text-[var(--color-text-primary)]">{eventPaces.pace_1500}</span>
              </div>
            )}
            {eventPaces.pace_800 && (
              <div className="flex justify-between">
                <span className="text-[11px] text-[var(--color-text-tertiary)]">800m per 400m</span>
                <span className="font-mono text-[11px] text-[var(--color-text-primary)]">{eventPaces.pace_800}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
