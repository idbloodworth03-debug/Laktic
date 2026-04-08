import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../lib/api';

interface TrendPoint {
  week: number;
  prediction: string;
  predictionSecs: number;
  phase: string;
}

interface Prediction {
  targetDistance: string;
  currentPrediction: string;
  raceWeekPrediction: string;
  potentialPR: string;
  confidenceLevel: 'low' | 'medium' | 'high';
  basedOn: string;
  weeksToImprovement: number;
  needsMoreData: boolean;
  complianceWarning: boolean;
  trend: TrendPoint[];
}

interface PredictionsResponse {
  predictions: Prediction[];
  primaryPrediction: Prediction | null;
  complianceRate: number;
  weeksOfTraining: number;
  weeksToRace: number | null;
}

const CONFIDENCE_LABEL: Record<string, { text: string; color: string; bg: string }> = {
  high:   { text: 'High confidence',   color: '#00E5A0', bg: 'rgba(0,229,160,0.1)' },
  medium: { text: 'Medium confidence', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  low:    { text: 'Low confidence — add a PR to improve accuracy', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' },
};

// Format seconds → mm:ss for chart tooltip
function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Custom tooltip for recharts
function PredTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as TrendPoint;
  return (
    <div
      style={{
        background: '#0a0a0a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '6px 10px',
      }}
    >
      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: '#00E5A0', margin: 0 }}>
        {d.prediction}
      </p>
      <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', margin: '2px 0 0' }}>
        Wk {d.week} · {d.phase.replace('_', ' ')}
      </p>
    </div>
  );
}

export function RacePredictionsCard() {
  const [data, setData] = useState<PredictionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    apiFetch('/api/athlete/predictions')
      .then((d: PredictionsResponse) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card">
        <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-4">Where you're headed</p>
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-[var(--color-bg-tertiary)] rounded" />
          <div className="h-4 bg-[var(--color-bg-tertiary)] rounded w-3/4" />
          <div className="h-4 bg-[var(--color-bg-tertiary)] rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!data || data.predictions.length === 0) return null;

  const pred = data.predictions[selectedIdx] ?? data.predictions[0];
  const conf = CONFIDENCE_LABEL[pred.confidenceLevel] ?? CONFIDENCE_LABEL.low;

  if (pred.needsMoreData) {
    return (
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card">
        <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Where you're headed</p>
        <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed mb-3">
          Add your 5K PR to unlock race time predictions.
        </p>
        <Link to="/athlete/settings" className="text-xs font-medium text-[var(--color-accent)] hover:opacity-80 transition-opacity">
          Update profile →
        </Link>
      </div>
    );
  }

  const trendData = pred.trend.length > 0 ? pred.trend : null;
  // Y-axis domain: pad 5 seconds around the range
  const trendMin = trendData ? Math.min(...trendData.map(t => t.predictionSecs)) - 5 : 0;
  const trendMax = trendData ? Math.max(...trendData.map(t => t.predictionSecs)) + 5 : 100;

  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Where you're headed</p>
        {data.predictions.length > 1 && (
          <div className="flex gap-1">
            {data.predictions.map((p, i) => (
              <button
                key={p.targetDistance}
                onClick={() => setSelectedIdx(i)}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all"
                style={i === selectedIdx ? {
                  background: '#00E5A0',
                  color: '#000',
                } : {
                  background: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {p.targetDistance}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Race week prediction — primary */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-0.5">Race week</p>
        <p
          className="font-semibold leading-none"
          style={{ fontFamily: 'DM Mono, monospace', fontSize: 28, color: '#00E5A0' }}
        >
          {pred.raceWeekPrediction}
        </p>
        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">{pred.targetDistance}</p>
      </div>

      {/* Current + potential */}
      <div className="space-y-1.5 mb-4">
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-[var(--color-text-tertiary)]">Right now</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--color-text-primary)' }}>
            {pred.currentPrediction}
          </span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-[var(--color-text-tertiary)]">If you stay consistent</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'rgba(0,229,160,0.8)' }}>
            {pred.potentialPR}
          </span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-[10px] text-[var(--color-text-tertiary)]">Based on</span>
          <span className="text-[10px] text-[var(--color-text-tertiary)]">{pred.basedOn}</span>
        </div>
      </div>

      {/* Trend chart */}
      {trendData && trendData.length >= 2 && (
        <div className="mb-4" style={{ height: 80 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="week"
                tick={{ fontSize: 9, fill: 'var(--color-text-tertiary)', fontFamily: 'DM Mono, monospace' }}
                tickFormatter={w => `Wk ${w}`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis domain={[trendMin, trendMax]} hide />
              <Tooltip content={<PredTooltip />} />
              <Line
                type="monotone"
                dataKey="predictionSecs"
                stroke="#00E5A0"
                strokeWidth={1.5}
                dot={{ r: 3, fill: '#00E5A0', strokeWidth: 0 }}
                activeDot={{ r: 4, fill: '#00E5A0', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Confidence badge */}
      <div className="mb-3">
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: conf.bg, color: conf.color }}
        >
          {conf.text}
        </span>
      </div>

      {/* Compliance warning */}
      {pred.complianceWarning && (
        <div
          className="rounded-xl px-3 py-2 mb-3 text-xs leading-snug"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}
        >
          Your predictions assume consistent training. Missed workouts will slow your progress.
        </div>
      )}

      <Link to="/athlete/progress" className="flex items-center gap-1 text-[11px] text-[var(--color-accent)] font-medium hover:opacity-80 transition-opacity">
        Full analytics →
      </Link>
    </div>
  );
}
