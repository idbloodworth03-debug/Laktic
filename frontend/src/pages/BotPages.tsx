import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Badge, Spinner, Select } from '../components/ui';

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
  const [eventFilter, setEventFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (eventFilter) params.set('event_focus', eventFilter);
    if (levelFilter) params.set('level_focus', levelFilter);
    apiFetch(`/api/bots?${params}`).then(setBots).catch(console.error).finally(() => setLoading(false));
  }, [eventFilter, levelFilter]);

  return (
    <div className="min-h-screen">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-2xl font-bold">Find Your Coach Bot</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Subscribe to get a personalized season plan built on your coach's methods.</p>
          </div>
          <div className="flex gap-3">
            <Select value={eventFilter} onChange={e => setEventFilter(e.target.value)} options={EVENT_FILTER} />
            <Select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} options={LEVEL_FILTER} />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : bots.length === 0 ? (
          <div className="text-center py-20 text-[var(--muted)]">No bots found matching your filters.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 fade-up-1">
            {bots.map((bot: any) => (
              <Link key={bot.id} to={`/athlete/bots/${bot.id}`} className="block group">
                <Card className="h-full hover:border-brand-700/50 transition-colors cursor-pointer">
                  <div className="flex flex-col gap-3">
                    <div>
                      <h3 className="font-display font-semibold text-base group-hover:text-brand-400 transition-colors">{bot.name}</h3>
                      <p className="text-sm text-[var(--muted)]">
                        {bot.coach?.name}{bot.coach?.school_or_org ? ` · ${bot.coach.school_or_org}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {bot.event_focus && <Badge label={bot.event_focus} color="blue" />}
                      {bot.level_focus && <Badge label={bot.level_focus} color="purple" />}
                      <Badge label={`${bot.knowledge_document_count} training docs`} color="gray" />
                    </div>
                    <p className="text-sm text-[var(--muted)] leading-relaxed line-clamp-3">
                      {bot.philosophy_excerpt}{bot.philosophy?.length > 200 ? '...' : ''}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
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
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch(`/api/bots/${botId}`).then(setBot).catch(console.error).finally(() => setLoading(false));
  }, [botId]);

  const subscribe = async () => {
    setSubscribing(true); setError('');
    try {
      await apiFetch(`/api/athlete/subscribe/${botId}`, { method: 'POST' });
      nav('/athlete/plan');
    } catch (e: any) { setError(e.message); }
    finally { setSubscribing(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!bot) return <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">Bot not found</div>;

  return (
    <div className="min-h-screen">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link to="/athlete/browse"><Button variant="ghost" size="sm" className="mb-6">← Browse Bots</Button></Link>

        <div className="fade-up">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="font-display text-2xl font-bold mb-1">{bot.name}</h1>
              <p className="text-[var(--muted)]">{bot.coach?.name}{bot.coach?.school_or_org ? ` · ${bot.coach.school_or_org}` : ''}</p>
              <div className="flex gap-2 mt-2">
                {bot.event_focus && <Badge label={bot.event_focus} color="blue" />}
                {bot.level_focus && <Badge label={bot.level_focus} color="purple" />}
              </div>
            </div>
            <div className="text-right shrink-0">
              <Button onClick={subscribe} loading={subscribing} size="lg">Subscribe & Get Plan</Button>
              {subscribing && <p className="text-xs text-[var(--muted)] mt-2">Generating your season plan…</p>}
              {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
            </div>
          </div>

          <Card className="mb-6">
            <h3 className="font-display font-semibold mb-2">Coaching Philosophy</h3>
            <p className="text-sm text-[var(--muted)] leading-relaxed whitespace-pre-wrap">{bot.philosophy}</p>
          </Card>

          <Card className="mb-6">
            <h3 className="font-display font-semibold mb-4">Sample Training Week</h3>
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((day, i) => {
                const wo = bot.workouts?.find((w: any) => w.day_of_week === i + 1);
                return (
                  <div key={day} className={`rounded-lg border p-2 text-center min-h-[90px] flex flex-col gap-1 ${wo ? 'border-[var(--border)] bg-dark-700' : 'border-dashed border-dark-500'}`}>
                    <div className="text-xs font-medium text-[var(--muted)]">{day}</div>
                    {wo ? (
                      <>
                        <div className="text-xs font-medium leading-tight">{wo.title}</div>
                        {wo.distance_miles && <div className="text-xs text-brand-400">{wo.distance_miles}mi</div>}
                        {wo.pace_guideline && <div className="text-xs text-[var(--muted)]">{wo.pace_guideline}</div>}
                      </>
                    ) : (
                      <div className="text-xs text-dark-500 mt-2">Rest</div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <h3 className="font-display font-semibold mb-3">Training Knowledge Base</h3>
            <p className="text-sm text-[var(--muted)] mb-3">The AI uses these documents to coach in your coach's voice. Content is private.</p>
            <div className="flex flex-col gap-2">
              {bot.knowledge_titles?.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                  <span className="text-sm">{doc.title}</span>
                  <Badge label={doc.document_type.replace('_', ' ')} color="gray" />
                </div>
              ))}
              {(!bot.knowledge_titles || bot.knowledge_titles.length === 0) && (
                <p className="text-sm text-[var(--muted)]">No documents listed</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
