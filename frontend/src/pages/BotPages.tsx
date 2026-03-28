import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Card, Badge, Spinner, Select } from '../components/ui';

const EVENT_FILTER = [
  { value: '', label: 'All events' },
  { value: '800m-1500m', label: '800m / 1500m' },
  { value: '5K-10K', label: '5K / 10K' },
  { value: 'Half Marathon', label: 'Half Marathon' },
  { value: 'Marathon', label: 'Marathon' },
  { value: 'Cross Country', label: 'Cross Country' },
  { value: 'Track & Field', label: 'Track & Field' },
];
const LEVEL_FILTER = [
  { value: '', label: 'All levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'elite', label: 'Elite' },
];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Browse Bots ───────────────────────────────────────────────────────────────
export function BrowseBots() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    setLoading(true);
    setFetchError('');
    const params = new URLSearchParams();
    if (eventFilter) params.set('event_focus', eventFilter);
    if (levelFilter) params.set('level_focus', levelFilter);
    apiFetch(`/api/bots?${params}`)
      .then(setBots)
      .catch((e: any) => setFetchError(e.message || 'Failed to load bots'))
      .finally(() => setLoading(false));
  }, [eventFilter, levelFilter]);

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-end justify-between mb-6 fade-up">
            <div>
              <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Find Your Coach Bot</h1>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Subscribe to get a personalized season plan built on your coach's methods.</p>
            </div>
            <div className="flex gap-3">
              <Select value={eventFilter} onChange={e => setEventFilter(e.target.value)} options={EVENT_FILTER} />
              <Select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} options={LEVEL_FILTER} />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : fetchError ? (
            <div className="text-center py-20">
              <p className="text-sm mb-4" style={{ color: 'var(--color-danger)' }}>{fetchError}</p>
              <Button variant="secondary" onClick={() => { clearAuth(); nav('/'); }}>Sign in again</Button>
            </div>
          ) : bots.length === 0 ? (
            <div className="text-center py-20 text-[var(--color-text-tertiary)]">No bots found matching your filters.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 fade-up-1">
              {bots.map((bot: any) => (
                <Link key={bot.id} to={`/athlete/bots/${bot.id}`} className="block group">
                  <div
                    className="h-full rounded-xl p-4 transition-colors cursor-pointer"
                    style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,229,160,0.3)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                  >
                    <div className="flex flex-col gap-3">
                      <div>
                        <h3 className="font-semibold text-base text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-accent)]">{bot.name}</h3>
                        <p className="text-sm text-[var(--color-text-tertiary)]">
                          {bot.coach?.name}{bot.coach?.school_or_org ? ` · ${bot.coach.school_or_org}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {bot.event_focus && <Badge label={bot.event_focus} color="blue" />}
                        {bot.level_focus && <Badge label={bot.level_focus} color="purple" />}
                        <Badge label={`${bot.knowledge_document_count} training docs`} color="gray" />
                      </div>
                      <p className="text-sm text-[var(--color-text-tertiary)] leading-relaxed line-clamp-3">
                        {bot.philosophy_excerpt}{bot.philosophy?.length > 200 ? '...' : ''}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ── Bot Detail ────────────────────────────────────────────────────────────────
export function BotDetail() {
  const { botId } = useParams();
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [bot, setBot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState('');
  const [pollJobId, setPollJobId] = useState<string | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch(`/api/bots/${botId}`).then(setBot).catch(console.error).finally(() => setLoading(false));
  }, [botId]);

  // Poll job status every 3s; give up after 60s and show escape hatch
  useEffect(() => {
    if (!pollJobId) return;
    let cancelled = false;
    const deadline = Date.now() + 60000;

    const poll = async () => {
      if (cancelled) return;
      if (Date.now() >= deadline) {
        setPollTimedOut(true);
        return;
      }
      try {
        const result = await apiFetch(`/api/plans/status/${pollJobId}`);
        if (result.status === 'complete') { nav('/athlete/plan'); return; }
        if (result.status === 'failed') {
          setError(result.jobError || 'Plan generation failed. Please try again.');
          setPollJobId(null);
          return;
        }
      } catch { /* network blip — keep polling */ }
      setTimeout(poll, 3000);
    };

    setTimeout(poll, 3000);
    return () => { cancelled = true; };
  }, [pollJobId]);

  const subscribe = async () => {
    setSubscribing(true); setError(''); setPollTimedOut(false);
    try {
      const result = await apiFetch(`/api/athlete/subscribe/${botId}`, { method: 'POST' });
      if (result.status === 'generating' && result.jobId) {
        setPollJobId(result.jobId);
      } else {
        nav('/athlete/plan');
      }
    } catch (e: any) { setError(e.message); }
    finally { setSubscribing(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}><Spinner size="lg" /></div>;
  if (!bot) return <div className="min-h-screen flex items-center justify-center text-[var(--color-text-tertiary)]" style={{ background: 'var(--color-bg-primary)' }}>Bot not found</div>;

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <Link to="/athlete/browse"><Button variant="ghost" size="sm" className="mb-6">← Browse Bots</Button></Link>

          {/* Async plan generation progress banner */}
          {pollJobId && (
            <div className="mb-6 rounded-xl p-4" style={{ background: 'var(--color-accent-dim)', border: '1px solid rgba(0,229,160,0.2)' }}>
              {pollTimedOut ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">This is taking longer than usual.</p>
                  <p className="text-sm text-[var(--color-text-tertiary)]">
                    We'll notify you when your plan is ready. You can close this page safely.
                  </p>
                  <div className="flex gap-3 mt-1">
                    <Button variant="ghost" size="sm" onClick={() => nav('/athlete/plan')}>Go to My Plan</Button>
                    <Button variant="ghost" size="sm" onClick={() => nav('/athlete/races')}>Set Up Race Calendar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Spinner size="sm" />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">Your AI coach is building your plan…</p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">This usually takes 15–30 seconds. Hang tight.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="fade-up">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold mb-1 text-[var(--color-text-primary)]">{bot.name}</h1>
                <p className="text-[var(--color-text-tertiary)]">{bot.coach?.name}{bot.coach?.school_or_org ? ` · ${bot.coach.school_or_org}` : ''}</p>
                <div className="flex gap-2 mt-2">
                  {bot.event_focus && <Badge label={bot.event_focus} color="blue" />}
                  {bot.level_focus && <Badge label={bot.level_focus} color="purple" />}
                </div>
              </div>
              <div className="text-right shrink-0">
                {!pollJobId && (
                  <Button onClick={subscribe} loading={subscribing} size="lg">Subscribe & Get Plan</Button>
                )}
                {subscribing && <p className="text-xs text-[var(--color-text-tertiary)] mt-2">Sending request…</p>}
                {error && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{error}</p>}
              </div>
            </div>

            <Card className="mb-6">
              <h3 className="font-semibold mb-2 text-[var(--color-text-primary)]">Coaching Philosophy</h3>
              <p className="text-sm text-[var(--color-text-tertiary)] leading-relaxed whitespace-pre-wrap">{bot.philosophy}</p>
            </Card>

            <Card className="mb-6">
              <h3 className="font-semibold mb-4 text-[var(--color-text-primary)]">Sample Training Week</h3>
              <div className="grid grid-cols-7 gap-2">
                {DAYS.map((day, i) => {
                  const wo = bot.workouts?.find((w: any) => w.day_of_week === i + 1);
                  return (
                    <div
                      key={day}
                      className="rounded-lg p-2 text-center min-h-[90px] flex flex-col gap-1"
                      style={wo
                        ? { border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)' }
                        : { border: '1px dashed var(--color-border)', background: 'transparent' }
                      }
                    >
                      <div className="text-xs font-medium text-[var(--color-text-tertiary)]">{day}</div>
                      {wo ? (
                        <>
                          <div className="text-xs font-medium text-[var(--color-text-primary)] leading-tight">{wo.title}</div>
                          {wo.distance_miles && <div className="text-xs font-mono" style={{ color: 'var(--color-accent)' }}>{wo.distance_miles}mi</div>}
                          {wo.pace_guideline && <div className="text-xs text-[var(--color-text-tertiary)]">{wo.pace_guideline}</div>}
                        </>
                      ) : (
                        <div className="text-xs text-[var(--color-text-tertiary)] mt-2">Rest</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold mb-3 text-[var(--color-text-primary)]">Training Knowledge Base</h3>
              <p className="text-sm text-[var(--color-text-tertiary)] mb-3">The AI uses these documents to coach in your coach's voice. Content is private.</p>
              <div className="flex flex-col gap-2">
                {bot.knowledge_titles?.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                    <span className="text-sm text-[var(--color-text-primary)]">{doc.title}</span>
                    <Badge label={doc.document_type.replace('_', ' ')} color="gray" />
                  </div>
                ))}
                {(!bot.knowledge_titles || bot.knowledge_titles.length === 0) && (
                  <p className="text-sm text-[var(--color-text-tertiary)]">No documents listed</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
