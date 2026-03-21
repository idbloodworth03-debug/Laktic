import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Badge, Spinner, EmptyState } from '../components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CoachDashboard() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [botData, setBotData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/coach/bot').then(setBotData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handlePublish = async () => {
    setPublishError(''); setPublishing(true);
    try {
      const updated = await apiFetch('/api/coach/bot/publish', { method: 'POST' });
      setBotData((prev: any) => ({ ...prev, bot: updated }));
    } catch (e: any) { setPublishError(e.message); }
    finally { setPublishing(false); }
  };

  if (loading) return <PageLoader />;

  const bot = botData?.bot;
  const workouts = botData?.workouts || [];
  const knowledge = botData?.knowledge || [];

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />

      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8 fade-up">
          <div>
            <h1 className="font-display text-2xl font-bold">Coach Dashboard</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              {bot?.is_published
                ? 'Your bot is live. Athletes subscribe and train with your methods autonomously.'
                : 'Set up your bot to start coaching athletes.'}
            </p>
          </div>
          {!bot && (
            <Link to="/coach/bot/setup">
              <Button variant="primary">Create Your Bot</Button>
            </Link>
          )}
          {bot && !bot.is_published && (
            <Link to="/coach/bot/edit">
              <Button variant="secondary">Edit Bot</Button>
            </Link>
          )}
          {bot?.is_published && (
            <Link to="/coach/bot/edit">
              <Button variant="secondary">Edit Bot</Button>
            </Link>
          )}
        </div>

        {!bot && (
          <EmptyState
            title="No bot yet"
            message="Create your coaching bot to start generating personalized plans for athletes."
            action={<Link to="/coach/bot/setup"><Button>Create Bot →</Button></Link>}
          />
        )}

        {bot && (
          <div className="flex flex-col gap-6 fade-up-1">
            {/* Bot header */}
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="font-display text-xl font-semibold">{bot.name}</h2>
                    {bot.is_published
                      ? <Badge label="● Published" color="green" />
                      : <Badge label="Draft" color="gray" />}
                  </div>
                  <div className="flex gap-2 mb-3">
                    {bot.event_focus && <Badge label={bot.event_focus} color="blue" />}
                    {bot.level_focus && <Badge label={bot.level_focus} color="purple" />}
                  </div>
                  <p className="text-sm text-[var(--muted)] leading-relaxed line-clamp-3">{bot.philosophy}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="text-right text-sm text-[var(--muted)]">
                    <div>{workouts.length}/7 workouts</div>
                    <div>{knowledge.length} knowledge docs</div>
                  </div>
                </div>
              </div>

              {!bot.is_published && (
                <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center justify-between gap-4">
                  <div className="text-sm text-[var(--muted)]">
                    Ready to publish? Make sure you have 5+ workouts and at least one knowledge document.
                    {' '}<Link to="/coach/knowledge" className="text-brand-400 hover:underline">Upload training documents →</Link>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button onClick={handlePublish} loading={publishing} variant="primary">Publish Bot</Button>
                    {publishError && <span className="text-xs text-red-400">{publishError}</span>}
                  </div>
                </div>
              )}
            </Card>

            {/* Weekly template */}
            <Card title="Weekly Training Template">
              <div className="grid grid-cols-7 gap-2">
                {DAYS.map((day, i) => {
                  const wo = workouts.find((w: any) => w.day_of_week === i + 1);
                  return (
                    <div key={day} className={`rounded-lg border p-2 text-center min-h-[80px] flex flex-col gap-1 ${wo ? 'border-[var(--border)] bg-dark-700' : 'border-dashed border-dark-500'}`}>
                      <div className="text-xs font-medium text-[var(--muted)]">{day}</div>
                      {wo ? (
                        <>
                          <div className="text-xs font-medium leading-tight">{wo.title}</div>
                          {wo.distance_miles && <div className="text-xs text-brand-400">{wo.distance_miles}mi</div>}
                          {wo.ai_adjustable && <div className="text-xs text-purple-400">AI</div>}
                        </>
                      ) : (
                        <div className="text-xs text-dark-500 mt-2">Rest</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Link to="/coach/bot/edit" className="inline-block mt-3">
                <Button variant="ghost" size="sm">Edit Template →</Button>
              </Link>
            </Card>

            {/* Knowledge docs */}
            <Card title="Training Knowledge Documents">
              {knowledge.length === 0 ? (
                <div className="text-sm text-[var(--muted)] text-center py-4">No documents yet. Upload your coaching materials to make the AI smarter.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {knowledge.slice(0, 5).map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                      <span className="text-sm">{doc.title}</span>
                      <Badge label={doc.document_type.replace('_', ' ')} color="gray" />
                    </div>
                  ))}
                  {knowledge.length > 5 && <div className="text-xs text-[var(--muted)] text-center">+{knowledge.length - 5} more</div>}
                </div>
              )}
              <Link to="/coach/knowledge" className="inline-block mt-3">
                <Button variant={knowledge.length === 0 ? 'primary' : 'ghost'} size="sm">
                  {knowledge.length === 0 ? 'Upload Documents →' : 'Manage Documents →'}
                </Button>
              </Link>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
