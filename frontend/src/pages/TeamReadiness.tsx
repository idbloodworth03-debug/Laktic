import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Badge, Spinner, Card } from '../components/ui';

type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

type AthleteRisk = {
  athlete_id: string;
  athlete_name: string;
  score: number;
  risk_level: RiskLevel;
  factors: Record<string, unknown>;
  explanation: string;
  recommendation: string;
  computed_at: string;
};

const RISK_CARD: Record<RiskLevel, string> = {
  low:      'bg-brand-950/40 border-brand-800/40',
  moderate: 'bg-amber-950/40 border-amber-800/40',
  high:     'bg-orange-950/40 border-orange-800/40',
  critical: 'bg-red-950/40 border-red-800/40',
};

const RISK_SCORE: Record<RiskLevel, string> = {
  low:      'text-brand-400',
  moderate: 'text-amber-300',
  high:     'text-orange-300',
  critical: 'text-red-300',
};

const RISK_BADGE: Record<RiskLevel, 'green' | 'amber' | 'red'> = {
  low:      'green',
  moderate: 'amber',
  high:     'red',
  critical: 'red',
};

function DetailModal({ athlete, onClose }: { athlete: AthleteRisk; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border2)] rounded-2xl shadow-2xl p-6 fade-up overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors text-lg"
        >×</button>

        <div className="mb-4">
          <h3 className="font-display font-bold text-lg text-[var(--text)]">{athlete.athlete_name}</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Computed {new Date(athlete.computed_at).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-4 mb-5">
          <div className={`text-5xl font-bold font-display ${RISK_SCORE[athlete.risk_level]}`}>
            {athlete.score}
          </div>
          <div className="flex flex-col gap-1">
            <Badge label={athlete.risk_level} color={RISK_BADGE[athlete.risk_level]} />
            <span className="text-xs text-[var(--muted)]">Injury Risk Score</span>
          </div>
        </div>

        {athlete.explanation && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wide mb-1.5">Explanation</h4>
            <p className="text-sm text-[var(--muted)] leading-relaxed">{athlete.explanation}</p>
          </div>
        )}

        {athlete.factors && Object.keys(athlete.factors).length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wide mb-2">Risk Factors</h4>
            <div className="flex flex-col gap-1.5">
              {Object.entries(athlete.factors).map(([key, val]) => (
                <div key={key} className="flex items-start justify-between gap-3 text-sm py-1 border-b border-[var(--border)]/50 last:border-0">
                  <span className="text-[var(--muted)] capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-[var(--text)] text-right">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {athlete.recommendation && (
          <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-4">
            <h4 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wide mb-1.5">AI Recommendation</h4>
            <p className="text-sm text-[var(--muted)] leading-relaxed">{athlete.recommendation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function TeamReadiness() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [athletes, setAthletes] = useState<AthleteRisk[]>([]);
  const [loading, setLoading]   = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError]       = useState('');
  const [selected, setSelected] = useState<AthleteRisk | null>(null);

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const load = () => {
    setLoading(true);
    apiFetch('/api/injury-risk/team')
      .then((data: AthleteRisk[]) => { setAthletes(data); setError(''); })
      .catch((e: any) => setError(e?.message || 'Failed to load team readiness'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const recomputeAll = async () => {
    setComputing(true);
    setError('');
    try {
      await apiFetch('/api/injury-risk/compute', { method: 'POST' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to recompute');
    } finally {
      setComputing(false);
    }
  };

  const moderatePlus = athletes.filter(a => a.risk_level === 'moderate' || a.risk_level === 'high' || a.risk_level === 'critical');

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
      {selected && <DetailModal athlete={selected} onClose={() => setSelected(null)} />}

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-3xl font-bold">Team Readiness</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              {moderatePlus.length > 0
                ? `${moderatePlus.length} athlete${moderatePlus.length !== 1 ? 's' : ''} at moderate+ risk`
                : 'All athletes in good shape'}
            </p>
          </div>
          <Button variant="secondary" onClick={recomputeAll} loading={computing}>
            Recompute All
          </Button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : athletes.length === 0 ? (
          <Card>
            <div className="text-center py-10">
              <p className="text-[var(--muted)]">No readiness data yet. Click Recompute All to generate scores.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 fade-up-1">
            {athletes.map(a => (
              <button
                key={a.athlete_id}
                onClick={() => setSelected(a)}
                className={`text-left rounded-xl border p-5 transition-all hover:scale-[1.01] cursor-pointer ${RISK_CARD[a.risk_level]}`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="font-medium text-[var(--text)] leading-snug">{a.athlete_name}</div>
                  <Badge label={a.risk_level} color={RISK_BADGE[a.risk_level]} />
                </div>
                <div className={`font-display text-4xl font-bold mb-1 ${RISK_SCORE[a.risk_level]}`}>
                  {a.score}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {new Date(a.computed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
