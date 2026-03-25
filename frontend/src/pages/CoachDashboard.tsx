import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Badge, Spinner, EmptyState, Input, Alert } from '../components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_COLORS: Record<string, 'green' | 'amber' | 'gray'> = {
  active: 'green',
  injured: 'amber',
  inactive: 'gray'
};

export function CoachDashboard() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [botData, setBotData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  // Team state
  const [teamData, setTeamData] = useState<any>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/coach/bot').then(setBotData).catch(console.error).finally(() => setLoading(false));
    apiFetch('/api/coach/team').then(setTeamData).catch(console.error).finally(() => setTeamLoading(false));
  }, []);

  const handlePublish = async () => {
    setPublishError(''); setPublishing(true);
    try {
      const updated = await apiFetch('/api/coach/bot/publish', { method: 'POST' });
      setBotData((prev: any) => ({ ...prev, bot: updated }));
    } catch (e: any) { setPublishError(e.message); }
    finally { setPublishing(false); }
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim()) return;
    setTeamError('');
    setCreatingTeam(true);
    try {
      const bot = botData?.bot;
      const body: any = { name: teamName.trim() };
      if (bot?.is_published) {
        body.default_bot_id = bot.id;
      }
      const team = await apiFetch('/api/coach/team', { method: 'POST', body: JSON.stringify(body) });
      setTeamData({ team, members: [] });
      setShowCreateTeam(false);
      setTeamName('');
    } catch (e: any) {
      setTeamError(e.message || 'Failed to create team.');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleRegenerateInvite = async () => {
    try {
      const updated = await apiFetch('/api/coach/team/invite/regenerate', { method: 'POST' });
      setTeamData((prev: any) => ({ ...prev, team: updated }));
    } catch (e: any) {
      setTeamError(e.message);
    }
  };

  const copyInviteCode = () => {
    const code = teamData?.team?.invite_code;
    if (code) {
      navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  if (loading) return <PageLoader />;

  const bot = botData?.bot;
  const workouts = botData?.workouts || [];
  const knowledge = botData?.knowledge || [];
  const team = teamData?.team;
  const members = teamData?.members || [];

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />

      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8 fade-up">
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text)]">Coach Dashboard</h1>
            <p className="text-sm text-[var(--muted)] mt-1 leading-snug">
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
          {bot && (
            <Link to="/coach/bot/edit">
              <Button variant="secondary">Edit Bot</Button>
            </Link>
          )}
        </div>

        {!bot && (
          <EmptyState
            title="No bot yet"
            message="Create your coaching bot to start generating personalized plans for athletes."
            action={<Link to="/coach/bot/setup"><Button>Create Bot</Button></Link>}
          />
        )}

        {bot && (
          <div className="flex flex-col gap-5 fade-up-1">
            {/* Bot header */}
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="font-display text-xl font-semibold text-[var(--text)]">{bot.name}</h2>
                    {bot.is_published
                      ? <Badge label="Published" color="green" dot />
                      : <Badge label="Draft" color="gray" />}
                  </div>
                  <div className="flex gap-2 mb-3">
                    {bot.event_focus && <Badge label={bot.event_focus} color="blue" />}
                    {bot.level_focus && <Badge label={bot.level_focus} color="purple" />}
                  </div>
                  <p className="text-sm text-[var(--muted)] leading-relaxed line-clamp-3">{bot.philosophy}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="text-right text-xs text-[var(--muted)] space-y-0.5">
                    <div className={`font-medium ${workouts.length >= 5 ? 'text-brand-400' : 'text-[var(--muted)]'}`}>{workouts.length}/7 workouts</div>
                    <div>{knowledge.length} knowledge docs</div>
                  </div>
                </div>
              </div>

              {!bot.is_published && (
                <div className="mt-4 pt-4 border-t border-[var(--border)]/70 flex items-center justify-between gap-4">
                  <div className="text-sm text-[var(--muted)] leading-snug">
                    Ready to publish? Add 5+ workouts and at least one knowledge document.
                    {' '}<Link to="/coach/knowledge" className="text-brand-400 hover:text-brand-300 transition-colors">Upload training documents →</Link>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Button onClick={handlePublish} loading={publishing} variant="primary">Publish Bot</Button>
                    {publishError && <span className="text-xs text-red-400">{publishError}</span>}
                  </div>
                </div>
              )}
            </Card>

            {/* Team Roster */}
            <Card title="Team Roster">
              {teamLoading ? (
                <div className="flex justify-center py-6"><Spinner /></div>
              ) : !team ? (
                showCreateTeam ? (
                  <div className="flex flex-col gap-3">
                    <Input
                      label="Team Name"
                      placeholder="e.g. Eastside Track Club"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
                    />
                    {teamError && <Alert type="error" message={teamError} onClose={() => setTeamError('')} />}
                    <div className="flex gap-2">
                      <Button onClick={handleCreateTeam} loading={creatingTeam} variant="primary" disabled={!teamName.trim()}>
                        Create Team
                      </Button>
                      <Button onClick={() => { setShowCreateTeam(false); setTeamError(''); }} variant="ghost">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-[var(--muted)] mb-4 leading-relaxed">
                      Create a team to manage your athletes and share your coaching bot.
                    </p>
                    <Button onClick={() => setShowCreateTeam(true)} variant="primary">
                      Create Team
                    </Button>
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Invite code section */}
                  <div className="flex items-center justify-between bg-[var(--surface2)] border border-[var(--border)] rounded-xl px-4 py-3">
                    <div>
                      <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Invite Code</div>
                      <div className="font-mono text-xl font-bold tracking-[0.25em] text-brand-400">
                        {team.invite_code}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={copyInviteCode} variant="secondary" size="sm">
                        {codeCopied ? '✓ Copied' : 'Copy'}
                      </Button>
                      <Button onClick={handleRegenerateInvite} variant="ghost" size="sm">
                        Regenerate
                      </Button>
                    </div>
                  </div>

                  {teamError && <Alert type="error" message={teamError} onClose={() => setTeamError('')} />}

                  {/* Member list */}
                  {members.length === 0 ? (
                    <div className="text-sm text-[var(--muted)] text-center py-6 leading-relaxed">
                      No athletes yet. Share your invite code to get started.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-2">
                        {members.length} athlete{members.length !== 1 ? 's' : ''}
                      </div>
                      {members.map((m: any) => {
                        const athlete = m.athlete_profiles;
                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-[var(--surface2)] transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[var(--surface2)] border border-[var(--border2)] flex items-center justify-center text-xs font-semibold text-brand-400">
                                {athlete?.name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-[var(--text)]">{athlete?.name || 'Unknown'}</div>
                                <div className="text-xs text-[var(--muted)]">
                                  Joined {new Date(m.joined_at).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <Badge
                              label={m.status}
                              color={STATUS_COLORS[m.status] || 'gray'}
                              dot
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Weekly template */}
            <Card title="Weekly Training Template">
              <div className="grid grid-cols-7 gap-2">
                {DAYS.map((day, i) => {
                  const wo = workouts.find((w: any) => w.day_of_week === i + 1);
                  return (
                    <div key={day} className={`rounded-lg border p-2 text-center min-h-[80px] flex flex-col gap-1 transition-colors ${
                      wo
                        ? 'border-[var(--border)] bg-[var(--surface2)] hover:border-[var(--border2)]'
                        : 'border-dashed border-[var(--border)] opacity-40'
                    }`}>
                      <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">{day}</div>
                      {wo ? (
                        <>
                          <div className="text-xs font-medium leading-tight text-[var(--text)]">{wo.title}</div>
                          {wo.distance_miles && <div className="text-xs text-brand-400 font-medium">{wo.distance_miles}mi</div>}
                          {wo.ai_adjustable && <div className="text-[10px] text-purple-400 font-medium">AI</div>}
                        </>
                      ) : (
                        <div className="text-xs text-[var(--muted2)] mt-2">Rest</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Link to="/coach/bot/edit" className="inline-block mt-4">
                <Button variant="ghost" size="sm">Edit Template</Button>
              </Link>
            </Card>

            {/* Knowledge docs */}
            <Card title="Training Knowledge Documents">
              {knowledge.length === 0 ? (
                <div className="text-sm text-[var(--muted)] text-center py-4 leading-relaxed">
                  No documents yet. Upload your coaching materials to make the AI smarter.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {knowledge.slice(0, 5).map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between py-2 border-b border-[var(--border)]/60 last:border-0">
                      <span className="text-sm text-[var(--text)]">{doc.title}</span>
                      <Badge label={doc.document_type.replace('_', ' ')} color="gray" />
                    </div>
                  ))}
                  {knowledge.length > 5 && (
                    <div className="text-xs text-[var(--muted)] text-center pt-1">+{knowledge.length - 5} more</div>
                  )}
                </div>
              )}
              <Link to="/coach/knowledge" className="inline-block mt-4">
                <Button variant={knowledge.length === 0 ? 'primary' : 'ghost'} size="sm">
                  {knowledge.length === 0 ? 'Upload Documents' : 'Manage Documents'}
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
