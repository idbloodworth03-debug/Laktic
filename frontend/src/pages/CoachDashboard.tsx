import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import {
  AppLayout,
  Card,
  StatCard,
  Button,
  Badge,
  Spinner,
  Alert,
  Input,
  EmptyState,
  ChatBubble,
  ProgressBar,
} from '../components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_COLORS: Record<string, 'green' | 'amber' | 'gray'> = {
  active: 'green',
  injured: 'amber',
  inactive: 'gray',
};

// ── Readiness colour helper ───────────────────────────────────────────────────
function readinessColor(score: number): string {
  if (score >= 80) return 'var(--color-accent)';
  if (score >= 50) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function readinessBg(score: number): string {
  if (score >= 80) return 'bg-[var(--color-accent-dim)]';
  if (score >= 50) return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

// ── Alert type derivation from team readiness entry ──────────────────────────
interface TeamAlert {
  athleteId: string;
  name: string;
  type: 'injury' | 'missed' | 'low-readiness';
  description: string;
}

function deriveAlerts(teamReadiness: any[]): TeamAlert[] {
  const alerts: TeamAlert[] = [];
  for (const item of teamReadiness) {
    const name: string = item.athlete_name || item.name || 'Unknown';
    const id: string = item.athlete_id || item.id || '';
    const score: number = item.readiness_score ?? item.score ?? 0;
    const injuryRisk: number = item.injury_risk ?? 0;
    const missedDays: number = item.missed_days ?? 0;

    if (injuryRisk >= 70) {
      alerts.push({ athleteId: id, name, type: 'injury', description: `Injury risk at ${injuryRisk}%` });
    } else if (missedDays >= 3) {
      alerts.push({ athleteId: id, name, type: 'missed', description: `${missedDays} missed sessions this week` });
    } else if (score > 0 && score < 50) {
      alerts.push({ athleteId: id, name, type: 'low-readiness', description: `Readiness critically low (${score})` });
    }
  }
  return alerts;
}

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

  const logout = async () => {
    await supabase.auth.signOut();
    clearAuth();
    nav('/');
  };

  const [marketplaceApp, setMarketplaceApp] = useState<any>(null);
  const [dashTab, setDashTab] = useState<'overview' | 'messages'>('overview');
  const [teamChallenges, setTeamChallenges] = useState<any[]>([]);
  const [showChallengeInvite, setShowChallengeInvite] = useState(false);
  const [challengeInviteCode, setChallengeInviteCode] = useState('');
  const [sendingChallenge, setSendingChallenge] = useState(false);
  const [challengeError, setChallengeError] = useState('');
  // Challenge creation form
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeTarget, setChallengeTarget] = useState('');
  const [challengeMetric, setChallengeMetric] = useState<'miles' | 'workouts' | 'hours'>('miles');
  const [challengeEndsAt, setChallengeEndsAt] = useState('');
  const [createdChallengeCode, setCreatedChallengeCode] = useState<string | null>(null);
  // Accept challenge form
  const [showAcceptChallenge, setShowAcceptChallenge] = useState(false);
  const [acceptCode, setAcceptCode] = useState('');
  const [acceptingChallenge, setAcceptingChallenge] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [inboxError, setInboxError] = useState('');

  // New data for redesigned dashboard
  const [teamReadiness, setTeamReadiness] = useState<any[]>([]);
  const [teamReadinessLoading, setTeamReadinessLoading] = useState(true);
  const [digests, setDigests] = useState<any[]>([]);
  const [digestExpanded, setDigestExpanded] = useState(false);
  const [teamCalendar, setTeamCalendar] = useState<any[]>([]);
  const [communityFeed, setCommunityFeed] = useState<any[]>([]);

  const fetchMessages = () =>
    apiFetch('/api/coach/messages')
      .then((data: any[]) => {
        setConversations(data);
        setInboxError('');
      })
      .catch((e: any) => setInboxError(e?.message || 'Failed to load messages'));

  useEffect(() => {
    apiFetch('/api/coach/bot').then(setBotData).catch(console.error).finally(() => setLoading(false));
    apiFetch('/api/coach/team').then(setTeamData).catch(console.error).finally(() => setTeamLoading(false));
    apiFetch('/api/marketplace/my-application').then(setMarketplaceApp).catch(() => {});
    apiFetch('/api/team-challenges/active').then(setTeamChallenges).catch(() => {});
    fetchMessages();

    // New data fetches
    apiFetch('/api/recovery/team')
      .then(setTeamReadiness)
      .catch(() => {})
      .finally(() => setTeamReadinessLoading(false));
    apiFetch('/api/digest').then(setDigests).catch(() => {});
    apiFetch('/api/coach/team/calendar').then(setTeamCalendar).catch(() => {});
    apiFetch('/api/community/feed?page=1&channel=general').then((d: any) => {
      const posts = Array.isArray(d) ? d : d?.posts ?? [];
      setCommunityFeed(posts.slice(0, 5));
    }).catch(() => {});
  }, []);

  // Poll for new messages every 30s when on the messages tab
  useEffect(() => {
    if (dashTab !== 'messages') return;
    const interval = setInterval(fetchMessages, 30000);
    return () => clearInterval(interval);
  }, [dashTab]);

  const handlePublish = async () => {
    setPublishError('');
    setPublishing(true);
    try {
      const updated = await apiFetch('/api/coach/bot/publish', { method: 'POST' });
      setBotData((prev: any) => ({ ...prev, bot: updated }));
    } catch (e: any) {
      setPublishError(e.message);
    } finally {
      setPublishing(false);
    }
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

  const dismissDigest = async (id: string) => {
    try {
      await apiFetch(`/api/digest/${id}`, { method: 'DELETE' });
      setDigests((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // silent
    }
  };

  if (loading) return <PageLoader />;

  const bot = botData?.bot;
  const workouts = botData?.workouts || [];
  const knowledge = botData?.knowledge || [];
  const team = teamData?.team;
  const members = teamData?.members || [];
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  // Trial banner
  const trialDaysLeft = profile?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const showTrial = trialDaysLeft !== null && trialDaysLeft <= 14;

  // Derived stats
  const totalAthletes = members.length;
  const activePlans = members.filter((m: any) => m.status === 'active').length;
  const avgReadiness =
    teamReadiness.length > 0
      ? Math.round(
          teamReadiness.reduce((sum: number, a: any) => sum + (a.readiness_score ?? a.score ?? 0), 0) /
            teamReadiness.length
        )
      : 0;

  // Alerts derived from team readiness
  const alerts = deriveAlerts(teamReadiness);

  // Upcoming events: next 3 from today
  const today = new Date();
  const upcomingEvents = Array.isArray(teamCalendar)
    ? teamCalendar
        .filter((ev: any) => new Date(ev.event_date ?? ev.date ?? ev.start_date) >= today)
        .sort(
          (a: any, b: any) =>
            new Date(a.event_date ?? a.date ?? a.start_date).getTime() -
            new Date(b.event_date ?? b.date ?? b.start_date).getTime()
        )
        .slice(0, 3)
    : [];

  // Latest digest
  const latestDigest = digests[0] ?? null;

  return (
    <AppLayout role="coach" name={profile?.name} onLogout={logout}>
      {/* ── Banners ─────────────────────────────────────────────────────── */}
      {showTrial && (
        <div className="bg-amber-900/20 border-b border-amber-700/30 px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="text-amber-300 font-medium">
              {trialDaysLeft === 0
                ? 'Your free trial has ended.'
                : trialDaysLeft === 1
                ? 'Last day'
                : `${trialDaysLeft} days`}{' '}
              remaining in your free trial.
            </span>
            <span className="text-amber-500 hidden sm:inline">
              Make sure your bot is published before it ends.
            </span>
          </div>
          <span className="text-xs text-amber-600 bg-amber-900/30 border border-amber-700/40 rounded px-2 py-0.5 shrink-0">
            Payments coming soon
          </span>
        </div>
      )}

      {marketplaceApp?.approval_status === 'approved' &&
        (() => {
          const lastRefresh = marketplaceApp.last_content_refresh_at
            ? new Date(marketplaceApp.last_content_refresh_at)
            : new Date(0);
          const daysSince = Math.floor((Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince < 90) return null;
          return (
            <div className="bg-purple-900/20 border-b border-purple-700/30 px-6 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse shrink-0" />
                <span className="text-purple-300 font-medium">
                  Your marketplace content is {daysSince} days old.
                </span>
                <span className="text-purple-500 hidden sm:inline">
                  Refresh your knowledge docs to stay active on the marketplace.
                </span>
              </div>
              <a href="/coach/knowledge" className="text-xs text-purple-400 hover:underline shrink-0">
                Update content →
              </a>
            </div>
          );
        })()}

      {/* ── Page shell ──────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8 fade-up">
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--color-text-primary)]">
              Coach Dashboard
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {bot?.is_published
                ? 'Your bot is live. Athletes subscribe and train with your methods autonomously.'
                : 'Set up your bot to start coaching athletes.'}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {!bot && (
              <Link to="/coach/bot/setup">
                <Button variant="primary">Create Your Bot</Button>
              </Link>
            )}
            {bot && !bot.is_published && (
              <>
                <Link to="/coach/bot/edit">
                  <Button variant="secondary">Edit Bot</Button>
                </Link>
                <Button variant="primary" onClick={handlePublish} loading={publishing}>
                  Publish Bot
                </Button>
              </>
            )}
            {bot?.is_published && (
              <>
                <Link to="/coach/bot/edit">
                  <Button variant="secondary">Edit Bot</Button>
                </Link>
                <Link to={`/athlete/bots/${bot.id}`}>
                  <Button variant="ghost">View as Athlete</Button>
                </Link>
              </>
            )}
            <Link to="/coach/settings">
              <Button variant="ghost" size="sm">
                Settings
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Tab strip ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-8 border-b border-[var(--color-border)]">
          {(['overview', 'messages'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setDashTab(t)}
              className={`relative px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                dashTab === t
                  ? 'border-[var(--color-accent)] text-[var(--color-text-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {t === 'overview' ? 'Overview' : 'Messages'}
              {t === 'messages' && totalUnread > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[var(--color-danger)] text-white text-[10px] font-bold px-1">
                  {totalUnread}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Messages tab ────────────────────────────────────────────── */}
        {dashTab === 'messages' && (
          <>
            {inboxError && (
              <Alert type="error" message={inboxError} onClose={() => setInboxError('')} />
            )}
            <CoachInbox conversations={conversations} onUpdate={setConversations} />
          </>
        )}

        {/* ── Overview tab — no bot ────────────────────────────────────── */}
        {dashTab === 'overview' && !bot && (
          <EmptyState
            title="No bot yet"
            message="Create your coaching bot to start generating personalized plans for athletes."
            action={
              <Link to="/coach/bot/setup">
                <Button>Create Bot</Button>
              </Link>
            }
          />
        )}

        {/* ── Overview tab — main layout ───────────────────────────────── */}
        {dashTab === 'overview' && bot && (
          <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-6 fade-up-1">
            {/* ════════════════════════ LEFT COLUMN ═══════════════════════ */}
            <div className="flex flex-col gap-6 min-w-0">

              {/* Bot status (publish prompt) */}
              {!bot.is_published && (
                <Card>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
                          {bot.name}
                        </h2>
                        <Badge label="Draft" color="gray" />
                      </div>
                      <div className="flex gap-2 mb-3">
                        {bot.event_focus && <Badge label={bot.event_focus} color="blue" />}
                        {bot.level_focus && <Badge label={bot.level_focus} color="purple" />}
                      </div>
                      <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed line-clamp-3">
                        {bot.philosophy}
                      </p>
                    </div>
                    <div className="text-right text-sm text-[var(--color-text-tertiary)] shrink-0">
                      <div>{workouts.length}/7 workouts</div>
                      <div>{knowledge.length} knowledge docs</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex items-center justify-between gap-4">
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Ready to publish? Make sure you have 5+ workouts and at least one knowledge document.{' '}
                      <Link to="/coach/knowledge" className="text-[var(--color-accent)] hover:underline">
                        Upload training documents
                      </Link>
                    </p>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Button onClick={handlePublish} loading={publishing} variant="primary">
                        Publish Bot
                      </Button>
                      {publishError && (
                        <span className="text-xs text-[var(--color-danger)]">{publishError}</span>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Alerts Card ─────────────────────────────────────────── */}
              <Card
                title="Athlete Alerts"
                action={
                  <Link to="/coach/readiness">
                    <Button variant="ghost" size="sm">
                      View All
                    </Button>
                  </Link>
                }
              >
                {teamReadinessLoading ? (
                  <div className="flex justify-center py-6">
                    <Spinner />
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="flex items-center gap-2 py-2">
                    <svg
                      className="w-4 h-4 shrink-0"
                      fill="none"
                      stroke="var(--color-accent)"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-sm font-medium text-[var(--color-accent)]">
                      All athletes on track
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-[var(--color-border)]">
                    {alerts.map((al, i) => (
                      <div key={`${al.athleteId}-${i}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] flex items-center justify-center text-xs font-medium text-[var(--color-text-secondary)] shrink-0">
                            {al.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-[var(--color-text-primary)] block truncate">
                              {al.name}
                            </span>
                            <span className="text-xs text-[var(--color-text-secondary)] truncate">
                              {al.description}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            label={
                              al.type === 'injury'
                                ? 'Injury Risk'
                                : al.type === 'missed'
                                ? 'Missed Practice'
                                : 'Low Readiness'
                            }
                            color={al.type === 'injury' ? 'red' : 'amber'}
                          />
                          <Link to="/coach/readiness">
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* ── Team Readiness Heatmap ───────────────────────────────── */}
              <Card
                title="Team Readiness Heatmap"
                action={
                  <Link to="/coach/recovery">
                    <Button variant="ghost" size="sm">
                      Full Report
                    </Button>
                  </Link>
                }
              >
                {teamReadinessLoading ? (
                  <div className="flex justify-center py-6">
                    <Spinner />
                  </div>
                ) : teamReadiness.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)] py-2">
                    No readiness data yet. Athletes log readiness daily.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {teamReadiness.map((a: any) => {
                      const score: number = a.readiness_score ?? a.score ?? 0;
                      const name: string = a.athlete_name || a.name || 'Unknown';
                      return (
                        <Link
                          key={a.athlete_id || a.id}
                          to="/coach/recovery"
                          className={`flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2.5 transition-colors hover:border-[var(--color-border-light)] hover:bg-[var(--color-bg-hover)] ${readinessBg(score)}`}
                        >
                          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate mr-2">
                            {name}
                          </span>
                          <span
                            className="font-mono text-sm font-bold shrink-0"
                            style={{ color: readinessColor(score) }}
                          >
                            {score}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
                {teamReadiness.length > 0 && (
                  <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" /> 80+ Optimal
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400" /> 50–79 Moderate
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-400" /> &lt;50 Low
                    </span>
                  </div>
                )}
              </Card>

              {/* ── Weekly Digest ────────────────────────────────────────── */}
              {latestDigest && (
                <Card
                  title="Weekly Digest"
                  action={
                    <button
                      onClick={() => dismissDigest(latestDigest.id)}
                      className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                    >
                      Dismiss
                    </button>
                  }
                >
                  <p className="text-xs text-[var(--color-text-tertiary)] mb-2">
                    {latestDigest.sent_at
                      ? new Date(latestDigest.sent_at).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Latest'}
                  </p>
                  <p
                    className={`text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-line ${
                      digestExpanded ? '' : 'line-clamp-4'
                    }`}
                  >
                    {latestDigest.digest_text}
                  </p>
                  {latestDigest.digest_text && latestDigest.digest_text.length > 200 && (
                    <button
                      onClick={() => setDigestExpanded((v) => !v)}
                      className="mt-2 text-xs text-[var(--color-accent)] hover:underline"
                    >
                      {digestExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </Card>
              )}

              {/* ── Team Roster ──────────────────────────────────────────── */}
              <Card title="Team Roster">
                {teamLoading ? (
                  <div className="flex justify-center py-6">
                    <Spinner />
                  </div>
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
                      {teamError && (
                        <Alert type="error" message={teamError} onClose={() => setTeamError('')} />
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={handleCreateTeam}
                          loading={creatingTeam}
                          variant="primary"
                          disabled={!teamName.trim()}
                        >
                          Create Team
                        </Button>
                        <Button
                          onClick={() => {
                            setShowCreateTeam(false);
                            setTeamError('');
                          }}
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-[var(--color-text-secondary)] mb-3">
                        Create a team to manage your athletes and share your coaching bot.
                      </p>
                      <Button onClick={() => setShowCreateTeam(true)} variant="primary">
                        Create Team
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Invite code */}
                    <div className="flex items-center justify-between bg-[var(--color-bg-tertiary)] rounded-lg px-4 py-3 border border-[var(--color-border)]">
                      <div>
                        <div className="text-xs text-[var(--color-text-tertiary)] mb-1">Invite Code</div>
                        <div className="font-mono text-lg font-bold tracking-widest text-[var(--color-accent)]">
                          {team.invite_code}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={copyInviteCode} variant="secondary" size="sm">
                          {codeCopied ? 'Copied!' : 'Copy'}
                        </Button>
                        <Button onClick={handleRegenerateInvite} variant="ghost" size="sm">
                          Regenerate
                        </Button>
                      </div>
                    </div>

                    {teamError && (
                      <Alert type="error" message={teamError} onClose={() => setTeamError('')} />
                    )}

                    {members.length === 0 ? (
                      <div className="text-sm text-[var(--color-text-secondary)] text-center py-6">
                        No athletes yet. Share your invite code to get started.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div className="text-xs text-[var(--color-text-tertiary)] font-medium mb-1">
                          {members.length} athlete{members.length !== 1 ? 's' : ''}
                        </div>
                        {members.map((m: any) => {
                          const athlete = m.athlete_profiles;
                          return (
                            <div
                              key={m.id}
                              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] flex items-center justify-center text-xs font-medium text-[var(--color-text-secondary)]">
                                  {athlete?.name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-[var(--color-text-primary)]">
                                    {athlete?.name || 'Unknown'}
                                  </div>
                                  <div className="text-xs text-[var(--color-text-tertiary)]">
                                    Joined {new Date(m.joined_at).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                              <Badge label={m.status} color={STATUS_COLORS[m.status] || 'gray'} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* ── Weekly Training Template ─────────────────────────────── */}
              <Card title="Weekly Training Template">
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS.map((day, i) => {
                    const wo = workouts.find((w: any) => w.day_of_week === i + 1);
                    return (
                      <div
                        key={day}
                        className={`rounded-lg border p-2 text-center min-h-[76px] flex flex-col gap-1 ${
                          wo
                            ? 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)]'
                            : 'border-dashed border-[var(--color-border)]'
                        }`}
                      >
                        <div className="text-xs font-medium text-[var(--color-text-tertiary)]">{day}</div>
                        {wo ? (
                          <>
                            <div className="text-xs font-medium text-[var(--color-text-primary)] leading-tight">
                              {wo.title}
                            </div>
                            {wo.distance_miles && (
                              <div className="text-xs text-[var(--color-accent)]">{wo.distance_miles}mi</div>
                            )}
                            {wo.ai_adjustable && (
                              <div className="text-xs text-purple-400">AI</div>
                            )}
                          </>
                        ) : (
                          <div className="text-xs text-[var(--color-text-tertiary)] mt-2">Rest</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Link to="/coach/bot/edit" className="inline-block mt-3">
                  <Button variant="ghost" size="sm">
                    Edit Template
                  </Button>
                </Link>
              </Card>

              {/* ── Knowledge Docs ───────────────────────────────────────── */}
              <Card title="Training Knowledge Documents">
                {knowledge.length === 0 ? (
                  <div className="text-sm text-[var(--color-text-secondary)] text-center py-4">
                    No documents yet. Upload your coaching materials to make the AI smarter.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {knowledge.slice(0, 5).map((doc: any) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0"
                      >
                        <span className="text-sm text-[var(--color-text-primary)]">{doc.title}</span>
                        <Badge label={doc.document_type.replace('_', ' ')} color="gray" />
                      </div>
                    ))}
                    {knowledge.length > 5 && (
                      <div className="text-xs text-[var(--color-text-tertiary)] text-center">
                        +{knowledge.length - 5} more
                      </div>
                    )}
                  </div>
                )}
                <Link to="/coach/knowledge" className="inline-block mt-3">
                  <Button variant={knowledge.length === 0 ? 'primary' : 'ghost'} size="sm">
                    {knowledge.length === 0 ? 'Upload Documents' : 'Manage Documents'}
                  </Button>
                </Link>
              </Card>

              {/* ── Team Challenges ──────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                    Team Challenges
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowAcceptChallenge((v) => !v);
                        setShowChallengeInvite(false);
                      }}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setShowChallengeInvite((v) => !v);
                        setShowAcceptChallenge(false);
                        setCreatedChallengeCode(null);
                      }}
                    >
                      {showChallengeInvite ? 'Cancel' : '+ Challenge a Team'}
                    </Button>
                  </div>
                </div>

                {/* Accept challenge form */}
                {showAcceptChallenge && (
                  <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-4 mb-4">
                    <p className="text-xs text-[var(--color-text-secondary)] mb-3">
                      Enter the challenge code you received from the opposing team's coach.
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={acceptCode}
                        onChange={(e) => setAcceptCode(e.target.value.toUpperCase())}
                        placeholder="CHALLENGE CODE"
                        maxLength={8}
                        className="flex-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)] tracking-widest uppercase"
                      />
                      <Button
                        size="sm"
                        loading={acceptingChallenge}
                        disabled={!acceptCode.trim()}
                        onClick={async () => {
                          setAcceptingChallenge(true);
                          setAcceptError('');
                          try {
                            const c = await apiFetch('/api/team-challenges/accept', {
                              method: 'POST',
                              body: JSON.stringify({ invite_code: acceptCode }),
                            });
                            setTeamChallenges((prev) => [c, ...prev]);
                            setAcceptCode('');
                            setShowAcceptChallenge(false);
                          } catch (e: any) {
                            setAcceptError(e.message || 'Invalid challenge code');
                          } finally {
                            setAcceptingChallenge(false);
                          }
                        }}
                      >
                        Accept
                      </Button>
                    </div>
                    {acceptError && <p className="text-xs text-[var(--color-danger)] mt-2">{acceptError}</p>}
                  </div>
                )}

                {/* Create challenge form */}
                {showChallengeInvite && !createdChallengeCode && (
                  <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-4 mb-4 space-y-3">
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Define the challenge. You'll get a code to share with the opposing team's coach.
                    </p>
                    <Input
                      label="Challenge title"
                      value={challengeTitle}
                      onChange={(e) => setChallengeTitle(e.target.value)}
                      placeholder="e.g. November Miles Race"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide block mb-1.5">
                          Metric
                        </label>
                        <select
                          value={challengeMetric}
                          onChange={(e) => setChallengeMetric(e.target.value as any)}
                          className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                        >
                          <option value="miles">Miles</option>
                          <option value="workouts">Workouts</option>
                          <option value="hours">Hours</option>
                        </select>
                      </div>
                      <Input
                        label={`Target (${challengeMetric})`}
                        type="number"
                        min="1"
                        value={challengeTarget}
                        onChange={(e) => setChallengeTarget(e.target.value)}
                        placeholder="e.g. 200"
                      />
                    </div>
                    <Input
                      label="Ends on"
                      type="date"
                      value={challengeEndsAt}
                      onChange={(e) => setChallengeEndsAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                    />
                    {challengeError && (
                      <p className="text-xs text-[var(--color-danger)]">{challengeError}</p>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowChallengeInvite(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        loading={sendingChallenge}
                        disabled={!challengeTitle.trim() || !challengeTarget || !challengeEndsAt}
                        onClick={async () => {
                          setSendingChallenge(true);
                          setChallengeError('');
                          try {
                            const c = await apiFetch('/api/team-challenges/invite', {
                              method: 'POST',
                              body: JSON.stringify({
                                title: challengeTitle.trim(),
                                target_value: parseFloat(challengeTarget),
                                target_unit: challengeMetric,
                                metric: challengeMetric,
                                ends_at: new Date(challengeEndsAt + 'T23:59:59').toISOString(),
                              }),
                            });
                            setTeamChallenges((prev) => [c, ...prev]);
                            setCreatedChallengeCode(c.invite_code);
                          } catch (e: any) {
                            setChallengeError(e.message || 'Failed to create challenge');
                          } finally {
                            setSendingChallenge(false);
                          }
                        }}
                      >
                        Create Challenge
                      </Button>
                    </div>
                  </div>
                )}

                {/* Created — show code to share */}
                {createdChallengeCode && showChallengeInvite && (
                  <div className="bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/20 rounded-xl p-4 mb-4">
                    <p className="text-xs text-[var(--color-accent)] font-medium mb-2">
                      Challenge created! Share this code with the opposing team's coach:
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xl font-bold tracking-widest text-[var(--color-accent)] bg-[var(--color-bg-tertiary)] px-4 py-2 rounded-lg border border-[var(--color-border)]">
                        {createdChallengeCode}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(createdChallengeCode);
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <button
                      onClick={() => {
                        setShowChallengeInvite(false);
                        setCreatedChallengeCode(null);
                        setChallengeTitle('');
                        setChallengeTarget('');
                        setChallengeEndsAt('');
                      }}
                      className="mt-3 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                    >
                      Done
                    </button>
                  </div>
                )}

                {/* Active challenges list */}
                {teamChallenges.length > 0 && (
                  <div className="space-y-2">
                    {teamChallenges.map((tc) => (
                      <div
                        key={tc.id}
                        className={`rounded-xl border px-4 py-3 ${
                          tc.status === 'active'
                            ? 'bg-[var(--color-accent-dim)] border-[var(--color-accent)]/20'
                            : 'bg-[var(--color-bg-secondary)] border-[var(--color-border)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--color-text-primary)] mb-0.5">
                              {tc.title}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] flex-wrap">
                              <span className="font-medium text-[var(--color-text-primary)]">
                                {tc.challenger_team_name}
                              </span>
                              <span>vs</span>
                              <span className="font-medium text-[var(--color-text-primary)]">
                                {tc.challenged_team_name}
                              </span>
                              <span>·</span>
                              <span>
                                {tc.target_value} {tc.target_unit}
                              </span>
                              {tc.status === 'pending' && (
                                <>
                                  <span>·</span>
                                  <span className="text-[10px] font-mono tracking-widest text-[var(--color-text-tertiary)]">
                                    code: {tc.invite_code}
                                  </span>
                                </>
                              )}
                            </div>
                            {tc.days_remaining !== undefined && (
                              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                                {tc.days_remaining}d remaining
                              </p>
                            )}
                          </div>
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded-full border shrink-0 capitalize ${
                              tc.status === 'active'
                                ? 'border-[var(--color-accent)]/30 text-[var(--color-accent)] bg-[var(--color-accent-dim)]'
                                : tc.status === 'pending'
                                ? 'border-amber-700/50 text-amber-400 bg-amber-950/40'
                                : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
                            }`}
                          >
                            {tc.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {teamChallenges.length === 0 && !showChallengeInvite && !showAcceptChallenge && (
                  <p className="text-xs text-[var(--color-text-tertiary)] text-center py-3">
                    No active team challenges. Challenge a rival team to a competition!
                  </p>
                )}
              </div>
            </div>

            {/* ════════════════════════ RIGHT COLUMN ══════════════════════ */}
            <div className="flex flex-col gap-6 min-w-0">

              {/* ── Quick Stats ──────────────────────────────────────────── */}
              <div>
                <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
                  Quick Stats
                </p>
                <div className="grid grid-cols-1 gap-3">
                  <StatCard
                    label="Total Athletes"
                    value={totalAthletes}
                    sub={team ? `on ${team.name}` : 'No team yet'}
                  />
                  <StatCard
                    label="Active Plans"
                    value={activePlans}
                    sub={`${totalAthletes > 0 ? Math.round((activePlans / totalAthletes) * 100) : 0}% of roster`}
                  />
                  <StatCard
                    label="Avg Team Readiness"
                    value={avgReadiness > 0 ? avgReadiness : '—'}
                    accent={avgReadiness >= 80}
                    sub={avgReadiness === 0 ? 'No data yet' : avgReadiness >= 80 ? 'Optimal' : avgReadiness >= 50 ? 'Moderate' : 'Low'}
                  />
                </div>
              </div>

              {/* ── Bot status (published) ───────────────────────────────── */}
              {bot.is_published && (
                <Card title="Bot Status">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)] truncate">
                      {bot.name}
                    </h2>
                    <Badge label="Live" color="green" dot />
                  </div>
                  <div className="flex gap-2 mb-3">
                    {bot.event_focus && <Badge label={bot.event_focus} color="blue" />}
                    {bot.level_focus && <Badge label={bot.level_focus} color="purple" />}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <div className="flex-1 text-center p-2 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
                      <div className="font-mono text-lg font-bold text-[var(--color-text-primary)]">
                        {workouts.length}
                      </div>
                      <div className="text-xs text-[var(--color-text-tertiary)]">workouts</div>
                    </div>
                    <div className="flex-1 text-center p-2 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
                      <div className="font-mono text-lg font-bold text-[var(--color-text-primary)]">
                        {knowledge.length}
                      </div>
                      <div className="text-xs text-[var(--color-text-tertiary)]">docs</div>
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Upcoming Team Events ─────────────────────────────────── */}
              <Card
                title="Upcoming Events"
                action={
                  <Link to="/coach/calendar">
                    <Button variant="ghost" size="sm">
                      Calendar
                    </Button>
                  </Link>
                }
              >
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)] py-2">
                    No upcoming events.{' '}
                    <Link to="/coach/calendar" className="text-[var(--color-accent)] hover:underline">
                      Add one
                    </Link>
                  </p>
                ) : (
                  <div className="flex flex-col divide-y divide-[var(--color-border)]">
                    {upcomingEvents.map((ev: any) => {
                      const evDate = new Date(ev.event_date ?? ev.date ?? ev.start_date);
                      return (
                        <div key={ev.id} className="py-2.5 first:pt-0 last:pb-0">
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 w-10 h-10 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] flex flex-col items-center justify-center">
                              <span className="text-[10px] font-medium text-[var(--color-text-tertiary)] leading-none uppercase">
                                {evDate.toLocaleString('default', { month: 'short' })}
                              </span>
                              <span className="text-base font-bold font-mono text-[var(--color-text-primary)] leading-tight">
                                {evDate.getDate()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                                {ev.title ?? ev.name ?? 'Event'}
                              </p>
                              {ev.location && (
                                <p className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">
                                  {ev.location}
                                </p>
                              )}
                              {ev.event_type && (
                                <Badge
                                  label={ev.event_type}
                                  color={ev.event_type === 'race' ? 'red' : 'gray'}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* ── Recent Community Posts ───────────────────────────────── */}
              <Card
                title="Recent Team Posts"
                action={
                  <Link to="/community">
                    <Button variant="ghost" size="sm">
                      Community
                    </Button>
                  </Link>
                }
              >
                {communityFeed.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)] py-2">
                    No posts yet in the community feed.
                  </p>
                ) : (
                  <div className="flex flex-col divide-y divide-[var(--color-border)]">
                    {communityFeed.map((post: any) => {
                      const athleteName =
                        post.athlete_profiles?.name ?? post.author_name ?? 'Athlete';
                      return (
                        <div key={post.id} className="py-2.5 first:pt-0 last:pb-0">
                          <div className="flex items-start gap-2">
                            <div className="w-6 h-6 rounded-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] flex items-center justify-center text-[10px] font-medium text-[var(--color-text-secondary)] shrink-0 mt-0.5">
                              {athleteName.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-1.5 mb-0.5">
                                <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                                  {athleteName}
                                </span>
                                <span className="text-[10px] text-[var(--color-text-tertiary)]">
                                  {post.created_at
                                    ? new Date(post.created_at).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                      })
                                    : ''}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">
                                {post.body ?? post.content ?? ''}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* ── Marketplace status ───────────────────────────────────── */}
              {marketplaceApp && (
                <Card title="Marketplace">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-text-secondary)]">Listing status</span>
                    <Badge
                      label={marketplaceApp.approval_status ?? 'pending'}
                      color={
                        marketplaceApp.approval_status === 'approved'
                          ? 'green'
                          : marketplaceApp.approval_status === 'rejected'
                          ? 'red'
                          : 'amber'
                      }
                    />
                  </div>
                  <Link to="/coach/marketplace" className="inline-block mt-3">
                    <Button variant="ghost" size="sm">
                      Manage Listing
                    </Button>
                  </Link>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function PageLoader() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

// ── Coach Inbox ───────────────────────────────────────────────────────────────
function CoachInbox({
  conversations,
  onUpdate,
}: {
  conversations: any[];
  onUpdate: (updater: (prev: any[]) => any[]) => void;
}) {
  const [selected, setSelected] = useState<any>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectAthlete = (athlete: any) => {
    if (selected?.id === athlete.id) return;
    setSelected(athlete);
    setThread([]);
    setError('');
    setThreadLoading(true);
    apiFetch(`/api/coach/messages/${athlete.id}`)
      .then((msgs) => {
        setThread(msgs);
        onUpdate((prev) =>
          prev.map((c) => (c.athlete.id === athlete.id ? { ...c, unreadCount: 0 } : c))
        );
      })
      .catch(console.error)
      .finally(() => setThreadLoading(false));
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  const sendReply = async () => {
    const msg = reply.trim();
    if (!msg || sending || !selected) return;
    setReply('');
    setSending(true);
    setError('');
    const optimistic = {
      id: `opt-${Date.now()}`,
      sender_role: 'coach',
      content: msg,
      created_at: new Date().toISOString(),
    };
    setThread((prev) => [...prev, optimistic]);
    try {
      const dm = await apiFetch(`/api/coach/messages/${selected.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: msg }),
      });
      setThread((prev) => [...prev.slice(0, -1), dm]);
      onUpdate((prev) =>
        prev.map((c) => (c.athlete.id === selected.id ? { ...c, lastMessage: dm } : c))
      );
    } catch (e: any) {
      setError(e.message || 'Failed to send reply');
      setThread((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  if (conversations.length === 0) {
    return (
      <EmptyState
        title="No messages yet"
        message="Athletes can message you from the 'My Coach' tab in their chat. Conversations will appear here."
      />
    );
  }

  return (
    <div
      className="flex border border-[var(--color-border)] rounded-2xl overflow-hidden fade-up-1"
      style={{ height: '70vh' }}
    >
      {/* Left pane — conversation list */}
      <div className="w-72 shrink-0 border-r border-[var(--color-border)] flex flex-col bg-[var(--color-bg-secondary)]">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide">
            Athletes
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <button
              key={conv.athlete.id}
              onClick={() => selectAthlete(conv.athlete)}
              className={`w-full text-left px-4 py-3 border-b border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] transition-colors flex items-start gap-3 ${
                selected?.id === conv.athlete.id ? 'bg-[var(--color-bg-hover)]' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] flex items-center justify-center text-xs font-medium text-[var(--color-text-secondary)] shrink-0 mt-0.5">
                {conv.athlete.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                    {conv.athlete.name}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-[var(--color-danger)] text-white text-[10px] font-bold flex items-center justify-center px-1">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                {conv.lastMessage && (
                  <p className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">
                    {conv.lastMessage.sender_role === 'coach' ? 'You: ' : ''}
                    {conv.lastMessage.content}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right pane — thread */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--color-bg-primary)]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-[var(--color-text-secondary)] text-sm">
            Select an athlete to view the conversation
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] flex items-center justify-center text-xs font-medium text-[var(--color-text-secondary)]">
                {selected.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                {selected.name}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {threadLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : thread.length === 0 ? (
                <div className="text-center py-10 text-[var(--color-text-secondary)] text-sm">
                  No messages yet. Send the first one.
                </div>
              ) : (
                thread.map((m, i) => (
                  <ChatBubble
                    key={m.id || i}
                    role={m.sender_role === 'coach' ? 'athlete' : 'coach'}
                    content={m.content}
                    label={m.sender_role === 'athlete' ? selected.name : undefined}
                  />
                ))
              )}
              {error && (
                <p className="text-xs text-[var(--color-danger)] mt-2 text-center">{error}</p>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 flex gap-3 items-end">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendReply();
                  }
                }}
                rows={1}
                placeholder={`Reply to ${selected.name}…`}
                className="flex-1 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-none min-h-[40px] max-h-32"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = 'auto';
                  t.style.height = t.scrollHeight + 'px';
                }}
              />
              <Button onClick={sendReply} loading={sending} disabled={!reply.trim()} size="md">
                Reply
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
