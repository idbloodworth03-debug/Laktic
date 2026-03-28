import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Button, Card, Badge, Spinner } from './ui';

type Distance = '5K' | '10K' | 'Half' | 'Full';

type Prediction = {
  distance: string;
  predicted_time_seconds: number;
  confidence: 'low' | 'medium' | 'high';
  trend: 'improving' | 'plateau' | 'declining';
  explanation: string;
};

function formatSeconds(s: number): string {
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const DISTANCES: Distance[] = ['5K', '10K', 'Half', 'Full'];

const DISTANCE_MAP: Record<Distance, string> = {
  '5K': '5k',
  '10K': '10k',
  'Half': 'half_marathon',
  'Full': 'marathon',
};

const CONFIDENCE_COLORS: Record<string, 'gray' | 'amber' | 'green'> = {
  low: 'gray',
  medium: 'amber',
  high: 'green',
};

const TREND_STYLES: Record<string, { label: string; className: string }> = {
  improving: { label: 'Improving', className: 'text-green-400' },
  plateau:   { label: 'Plateau',   className: 'text-amber-400' },
  declining: { label: 'Declining', className: 'text-red-400'   },
};

export function PredictionWidget() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading]         = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError]             = useState('');
  const [selected, setSelected]       = useState<Distance>('5K');

  const load = () => {
    setLoading(true);
    apiFetch('/api/predictions/my')
      .then((data: Prediction[]) => { setPredictions(data); setError(''); })
      .catch((e: any) => setError(e?.message || 'Failed to load predictions'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const recompute = async () => {
    setRecomputing(true);
    setError('');
    try {
      await apiFetch('/api/predictions/compute', { method: 'POST' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to recompute');
    } finally {
      setRecomputing(false);
    }
  };

  const current = predictions.find(p => {
    const key = DISTANCE_MAP[selected];
    return p.distance === key || p.distance === selected;
  });

  return (
    <Card title="Performance Predictions">
      {/* Distance selector */}
      <div className="flex gap-1.5 mb-5">
        {DISTANCES.map(d => (
          <button
            key={d}
            onClick={() => setSelected(d)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              selected === d
                ? 'bg-brand-950/60 border-brand-800/60 text-brand-300'
                : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border2)]'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : error ? (
        <p className="text-sm text-red-400 py-4">{error}</p>
      ) : !current ? (
        <div className="py-6 text-center">
          <p className="text-sm text-[var(--muted)] mb-4">No prediction available for {selected} yet.</p>
          <Button size="sm" variant="secondary" onClick={recompute} loading={recomputing}>
            Compute Predictions
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-4">
            <div className="font-display text-4xl font-bold text-[var(--text)]">
              {formatSeconds(current.predicted_time_seconds)}
            </div>
            <div className="flex items-center gap-2 mb-1">
              <Badge label={current.confidence} color={CONFIDENCE_COLORS[current.confidence] || 'gray'} />
              {current.trend && TREND_STYLES[current.trend] && (
                <span className={`text-xs font-semibold ${TREND_STYLES[current.trend].className}`}>
                  {TREND_STYLES[current.trend].label}
                </span>
              )}
            </div>
          </div>
          {current.explanation && (
            <p className="text-sm text-[var(--muted)] leading-relaxed">{current.explanation}</p>
          )}
          <div className="pt-1">
            <Button size="sm" variant="ghost" onClick={recompute} loading={recomputing}>
              Recompute
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
