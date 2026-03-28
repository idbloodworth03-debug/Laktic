import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Trophy } from 'lucide-react';
import { Navbar, Card, Button, Spinner, Badge } from '../components/ui';

interface ModuleMeta {
  id: number;
  title: string;
  question_count: number;
}

interface QuizQuestion {
  index: number;
  q: string;
  options: string[];
}

export function CertificationPage() {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [certified, setCertified] = useState(false);
  const [modules, setModules] = useState<ModuleMeta[]>([]);
  const [certData, setCertData] = useState<any>(null);
  const [activeModule, setActiveModule] = useState<number | null>(null);
  const [quiz, setQuiz] = useState<{ title: string; questions: QuizQuestion[] } | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const logout = async () => { const { supabase } = await import('../lib/supabaseClient'); await supabase.auth.signOut(); useAuthStore.getState().clearAuth(); };

  const load = async () => {
    const data = await apiFetch('/api/certification');
    setCertified(data.certified);
    setModules(data.modules ?? []);
    setCertData(data.certification);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const startModule = async (id: number) => {
    setActiveModule(id);
    setAnswers({});
    setResult(null);
    const data = await apiFetch(`/api/certification/module/${id}`);
    setQuiz(data);
  };

  const submitQuiz = async () => {
    if (!activeModule || !quiz) return;
    const answerArr = quiz.questions.map((_, i) => answers[i] ?? -1);
    if (answerArr.some(a => a === -1)) { alert('Please answer all questions.'); return; }
    setSubmitting(true);
    try {
      const data = await apiFetch(`/api/certification/module/${activeModule}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: answerArr }),
      });
      setResult(data);
      await load();
    } catch (e: any) { alert(e.message); }
    setSubmitting(false);
  };

  const handleCheckout = async () => {
    setCheckingOut(true);
    try {
      const data = await apiFetch('/api/certification/checkout', { method: 'POST' });
      if (data.url) window.location.href = data.url;
    } catch (e: any) { alert(e.message); }
    setCheckingOut(false);
  };

  const moduleScore = (id: number) => (certData?.quiz_scores as any)?.[id];

  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center"><Spinner /></div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Coach Certification</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Complete 5 modules + pay $299 to earn your Laktic Certified badge</p>
          </div>
          <Link to="/coach/dashboard"><Button variant="ghost" size="sm">← Dashboard</Button></Link>
        </div>

        {certified && (
          <div className="mb-6 bg-green-950/30 border border-green-800/40 rounded-xl p-5 flex items-center gap-4">
            <Trophy size={28} style={{ color: 'var(--color-accent)' }} />
            <div>
              <p className="font-bold text-green-400 text-lg">Laktic Certified Coach</p>
              <p className="text-sm text-[var(--muted)]">Your certification badge is live on your public profile.</p>
            </div>
          </div>
        )}

        {/* Module list */}
        {activeModule === null ? (
          <>
            <div className="flex flex-col gap-3 mb-6">
              {modules.map(m => {
                const score = moduleScore(m.id);
                return (
                  <div key={m.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${score?.passed ? 'bg-green-900/40 border border-green-700 text-green-400' : 'bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)]'}`}>
                        {score?.passed ? '✓' : m.id}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{m.title}</p>
                        <p className="text-xs text-[var(--muted)]">{m.question_count} questions · 75% to pass</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {score && (
                        <Badge label={score.passed ? `${Math.round(score.score * 100)}%` : `${Math.round(score.score * 100)}% — Retry`} color={score.passed ? 'green' : 'red'} />
                      )}
                      {!certified && (
                        <Button variant={score?.passed ? 'ghost' : 'secondary'} size="sm" onClick={() => startModule(m.id)}>
                          {score?.passed ? 'Review' : score ? 'Retry' : 'Start'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {certData?.passed && !certified && (
              <Card title="Ready for Certification!" className="mb-6">
                <p className="text-sm text-[var(--muted)] mb-4">You've passed all 5 modules. Pay $299 to receive your Laktic Certified badge.</p>
                <Button variant="primary" loading={checkingOut} onClick={handleCheckout}>
                  Pay $299 — Get Certified
                </Button>
              </Card>
            )}

            {!certData?.passed && (
              <div className="text-center py-4">
                <p className="text-sm text-[var(--muted)]">
                  {certData?.modules_completed ?? 0} / {modules.length} modules completed
                </p>
                <div className="w-full bg-[var(--border)] rounded-full h-2 mt-2">
                  <div
                    className="bg-brand-500 h-2 rounded-full transition-all"
                    style={{ width: `${((certData?.modules_completed ?? 0) / Math.max(modules.length, 1)) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          /* Quiz UI */
          <Card title={quiz?.title ?? 'Loading...'}>
            {result ? (
              <div className="text-center py-4">
                <div className={`text-5xl font-bold mb-2 ${result.passed ? 'text-green-400' : 'text-red-400'}`}>
                  {Math.round(result.score * 100)}%
                </div>
                <p className="text-[var(--muted)] mb-1">{result.correct} / {result.total} correct</p>
                <Badge label={result.passed ? 'Passed!' : 'Failed — Retry'} color={result.passed ? 'green' : 'red'} />
                <div className="mt-4">
                  <Button variant="primary" onClick={() => { setActiveModule(null); setQuiz(null); setResult(null); }}>
                    Back to Modules
                  </Button>
                </div>
              </div>
            ) : quiz ? (
              <div className="flex flex-col gap-5">
                {quiz.questions.map((q, qi) => (
                  <div key={qi}>
                    <p className="text-sm font-medium mb-3">{qi + 1}. {q.q}</p>
                    <div className="grid grid-cols-1 gap-2">
                      {q.options.map((opt, oi) => (
                        <button
                          key={oi}
                          onClick={() => setAnswers(a => ({ ...a, [qi]: oi }))}
                          className={`text-left text-sm px-4 py-2.5 rounded-lg border transition-colors ${answers[qi] === oi ? 'bg-brand-900/40 border-brand-600 text-brand-300' : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--text)]'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex gap-3 pt-2">
                  <Button variant="primary" loading={submitting} onClick={submitQuiz}>
                    Submit Answers
                  </Button>
                  <Button variant="ghost" onClick={() => { setActiveModule(null); setQuiz(null); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-8"><Spinner /></div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
