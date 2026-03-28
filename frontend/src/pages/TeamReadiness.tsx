import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Badge, Spinner, Card } from '../components/ui';

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

const RISK_CARD_STYLE: Record<RiskLevel, React.CSSProperties> = {
  low:      { background: 'var(--color-accent-dim)',          border: '1px solid rgba(0,229,160,0.2)' },
  moderate: { background: 'rgba(245,158,11,0.08)',            border: '1px solid rgba(245,158,11,0.2)' },
  high:     { background: 'rgba(249,115,22,0.08)',            border: '1px solid rgba(249,115,22,0.2)' },
  critical: { background: 'rgba(239,68,68,0.08)',             border: '1px solid rgba(239,68,68,0.2)' },
};

const RISK_COLOR: Record<RiskLevel, string> = {
  low:      'var(--color-accent)',
  moderate: '#FCD34D',
  high:     '#FB923C',
  critical: 'var(--color-danger)',
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
        className="relative w-full max-w-lg rounded-2xl shadow-2xl p-6 fade-up overflow-y-auto max-h-[90vh]"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-light)' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-lg transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-tertiary)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >×</button>

        <div className="mb-4">
          <h3 className="font-bold text-lg text-[var(--color-text-primary)]">{athlete.athlete_name}</h3>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            Computed {new Date(athlete.computed_at).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-4 mb-5">
          <div className="font-mono text-5xl font-medium" style={{ color: RISK_COLOR[athlete.risk_level] }}>
            {athlete.score}
          </div>
          <div className="flex flex-col gap-1">
            <Badge label={athlete.risk_level} color={RISK_BADGE[athlete.risk_level]} />
            <span className="text-xs text-[var(--color-text-tertiary)]">Injury Risk Score</span>
          </div>
        </div>

        {athlete.explanation && (
          <div className="mb-4">
            <h4 className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">Explanation</h4>
            <p className="text-sm text-[var(--color-text-tertiary)] leading-relaxed">{athlete.explanation}</p>
          </div>
        )}

        {athlete.factors && Object.keys(athlete.factors).length > 0 && (
          <div className="mb-4">
            <h4 className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Risk Factors</h4>
            <div className="flex flex-col gap-1.5">
              {Object.entries(athlete.factors).map(([key, val]) => (
                <div key={key} className="flex items-start justify-between gap-3 text-sm py-1 border-b border-[var(--color-border)]/50 last:border-0">
                  <span className="text-[var(--color-text-tertiary)] capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-[var(--color-text-primary)] text-right font-mono">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {athlete.recommendation && (
          <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
            <h4 className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">AI Recommendation</h4>
            <p className="text-sm text-[var(--color-text-tertiary)] leading-relaxed">{athlete.recommendation}</p>
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
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState('');
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
    <AppLayout role="coach" name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        {selected && <DetailModal athlete={selected} onClose={() => setSelected(null)} />}

        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-6 fade-up">
            <div>
              <h1 className="text-3xl font-bold">Team Readiness</h1>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
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
            <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : athletes.length === 0 ? (
            <Card>
              <div className="text-center py-10">
                <p className="text-[var(--color-text-tertiary)]">No readiness data yet. Click Recompute All to generate scores.</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 fade-up-1">
              {athletes.map(a => (
                <button
                  key={a.athlete_id}
                  onClick={() => setSelected(a)}
                  className="text-left rounded-xl p-5 transition-all hover:scale-[1.01] cursor-pointer"
                  style={RISK_CARD_STYLE[a.risk_level]}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="font-medium text-[var(--color-text-primary)] leading-snug">{a.athlete_name}</div>
                    <Badge label={a.risk_level} color={RISK_BADGE[a.risk_level]} />
                  </div>
                  <div className="font-mono text-4xl font-medium mb-1" style={{ color: RISK_COLOR[a.risk_level] }}>
                    {a.score}
                  </div>
                  <div className="text-xs text-[var(--color-text-tertiary)]">
                    {new Date(a.computed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
