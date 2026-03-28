import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Badge, Spinner, EmptyState, Input, Alert, ChatBubble } from '../components/ui'; // Alert kept for publishError

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

  const [marketplaceApp, setMarketplaceApp] = useState<any>(null);
  const [dashTab, setDashTab] = useState<'overview' | 'messages'>('overview');
  const [conversations, setConversations] = useState<any[]>([]);
  const [inboxError, setInboxError] = useState('');

  const fetchMessages = () =>
    apiFetch('/api/coach/messages')
      .then((data: any[]) => { setConversations(data); setInboxError(''); })
      .catch((e: any) => setInboxError(e?.message || 'Failed to load messages'));

  useEffect(() => {
    apiFetch('/api/coach/bot').then(setBotData).catch(console.error).finally(() => setLoading(false));
    apiFetch('/api/coach/team').then(setTeamData).catch(console.error).finally(() => setTeamLoading(false));
    apiFetch('/api/marketplace/my-application').then(setMarketplaceApp).catch(() => {});
    fetchMessages();
  }, []);

  // Poll for new messages every 30s when on the messages tab
  useEffect(() => {
    if (dashTab !== 'messages') return;
    const interval = setInterval(fetchMessages, 30000);
    return () => clearInterval(interval);
  }, [dashTab]);

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
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  // Trial banner — uses trial_ends_at set explicitly on profile creation
  const trialDaysLeft = profile?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const showTrial = trialDaysLeft !== null && trialDaysLeft <= 14;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />

      {showTrial && (
        <div className="bg-amber-900/20 border-b border-amber-700/30 px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="text-amber-300 font-medium">
              {trialDaysLeft === 0
                ? 'Your free trial has ended.'
                : trialDaysLeft === 1 ? 'Last day'
                : `${trialDaysLeft} days`} remaining in your free trial.
            </span>
            <span className="text-amber-500 hidden sm:inline">Make sure your bot is published before it ends.</span>
          </div>
          <span className="text-xs text-amber-600 bg-amber-900/30 border border-amber-700/40 rounded px-2 py-0.5 shrink-0">Payments coming soon</span>
        </div>
      )}

      {/* Marketplace content staleness warning */}
      {marketplaceApp?.approval_status === 'approved' && (() => {
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
              <span className="text-purple-500 hidden sm:inline">Refresh your knowledge docs to stay active on the marketplace.</span>
            </div>
            <a href="/coach/knowledge" className="text-xs text-purple-400 hover:underline shrink-0">Update content →</a>
          </div>
        );
      })()}

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-3xl font-bold">Coach Dashboard</h1>
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
            <div className="flex gap-2">
              <Link to="/coach/bot/edit"><Button variant="secondary">Edit Bot</Button></Link>
              <Button variant="primary" onClick={handlePublish} loading={publishing}>Publish Bot</Button>
            </div>
          )}
          {bot?.is_published && (
            <div className="flex gap-2">
              <Link to="/coach/bot/edit"><Button variant="secondary">Edit Bot</Button></Link>
              <Link to={`/athlete/bots/${bot.id}`}><Button variant="ghost">View as Athlete</Button></Link>
            </div>
          )}
          <Link to="/coach/settings">
            <Button variant="ghost" size="sm">Settings</Button>
          </Link>
        </div>

        {/* Tab strip */}
        <div className="flex items-center gap-1 mb-6 border-b border-[var(--border)]">
          {(['overview', 'messages'] as const).map(t => (
            <button
              key={t}
              onClick={() => setDashTab(t)}
              className={`relative px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                dashTab === t
                  ? 'border-brand-500 text-[var(--text)]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {t === 'overview' ? 'Overview' : 'Messages'}
              {t === 'messages' && totalUnread > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                  {totalUnread}
                </span>
              )}
            </button>
          ))}
        </div>

        {dashTab === 'messages' && (
          <>
            {inboxError && (
              <Alert type="error" message={inboxError} onClose={() => setInboxError('')} />
            )}
            <CoachInbox
              conversations={conversations}
              onUpdate={setConversations}
            />
          </>
        )}

        {dashTab === 'overview' && !bot && (
          <EmptyState
            title="No bot yet"
            message="Create your coaching bot to start generating personalized plans for athletes."
            action={<Link to="/coach/bot/setup"><Button>Create Bot</Button></Link>}
          />
        )}

        {dashTab === 'overview' && bot && (
          <div className="flex flex-col gap-6 fade-up-1">
            {/* Bot header */}
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="font-display text-xl font-semibold">{bot.name}</h2>
                    {bot.is_published
                      ? <Badge label="Published" color="green" />
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
                    {' '}<Link to="/coach/knowledge" className="text-brand-400 hover:underline">Upload training documents</Link>
                  </div>
                  <div className="flex flex-col items-end gap-1">
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
                    <p className="text-sm text-[var(--muted)] mb-3">
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
                  <div className="flex items-center justify-between bg-dark-700 rounded-lg px-4 py-3">
                    <div>
                      <div className="text-xs text-[var(--muted)] mb-1">Invite Code</div>
                      <div className="font-mono text-lg font-bold tracking-widest text-brand-400">
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

                  {teamError && <Alert type="error" message={teamError} onClose={() => setTeamError('')} />}

                  {/* Member list */}
                  {members.length === 0 ? (
                    <div className="text-sm text-[var(--muted)] text-center py-6">
                      No athletes yet. Share your invite code to get started.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <div className="text-xs text-[var(--muted)] font-medium mb-1">
                        {members.length} athlete{members.length !== 1 ? 's' : ''}
                      </div>
                      {members.map((m: any) => {
                        const athlete = m.athlete_profiles;
                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-dark-700 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-dark-600 border border-[var(--border)] flex items-center justify-center text-xs font-medium">
                                {athlete?.name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div>
                                <div className="text-sm font-medium">{athlete?.name || 'Unknown'}</div>
                                <div className="text-xs text-[var(--muted)]">
                                  Joined {new Date(m.joined_at).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <Badge
                              label={m.status}
                              color={STATUS_COLORS[m.status] || 'gray'}
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
                <Button variant="ghost" size="sm">Edit Template</Button>
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

// ── Coach inbox ───────────────────────────────────────────────────────────────
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
      .then(msgs => {
        setThread(msgs);
        // Mark this athlete's unread count as 0 in the parent list
        onUpdate(prev =>
          prev.map(c => c.athlete.id === athlete.id ? { ...c, unreadCount: 0 } : c)
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
    const optimistic = { id: `opt-${Date.now()}`, sender_role: 'coach', content: msg, created_at: new Date().toISOString() };
    setThread(prev => [...prev, optimistic]);
    try {
      const dm = await apiFetch(`/api/coach/messages/${selected.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: msg }),
      });
      setThread(prev => [...prev.slice(0, -1), dm]);
      onUpdate(prev =>
        prev.map(c => c.athlete.id === selected.id ? { ...c, lastMessage: dm } : c)
      );
    } catch (e: any) {
      setError(e.message || 'Failed to send reply');
      setThread(prev => prev.slice(0, -1));
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
    <div className="flex border border-[var(--border)] rounded-2xl overflow-hidden fade-up-1" style={{ height: '70vh' }}>
      {/* Left pane — conversation list */}
      <div className="w-72 shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--surface)]">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">Athletes</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map(conv => (
            <button
              key={conv.athlete.id}
              onClick={() => selectAthlete(conv.athlete)}
              className={`w-full text-left px-4 py-3 border-b border-[var(--border)] hover:bg-dark-700 transition-colors flex items-start gap-3 ${
                selected?.id === conv.athlete.id ? 'bg-dark-700' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-dark-600 border border-[var(--border)] flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">
                {conv.athlete.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium truncate">{conv.athlete.name}</span>
                  {conv.unreadCount > 0 && (
                    <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                {conv.lastMessage && (
                  <p className="text-xs text-[var(--muted)] truncate mt-0.5">
                    {conv.lastMessage.sender_role === 'coach' ? 'You: ' : ''}{conv.lastMessage.content}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right pane — thread */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg)]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-[var(--muted)] text-sm">
            Select an athlete to view the conversation
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-6 py-3 border-b border-[var(--border)] bg-[var(--surface)] flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-dark-600 border border-[var(--border)] flex items-center justify-center text-xs font-medium">
                {selected.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <span className="text-sm font-medium">{selected.name}</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {threadLoading ? (
                <div className="flex justify-center py-10"><Spinner /></div>
              ) : thread.length === 0 ? (
                <div className="text-center py-10 text-[var(--muted)] text-sm">
                  No messages yet. Send the first one.
                </div>
              ) : (
                thread.map((m, i) => (
                  <ChatBubble
                    key={m.id || i}
                    // Coach sees their own messages on the right (athlete role = right-aligned)
                    // and athlete messages on the left (coach role = left-aligned)
                    role={m.sender_role === 'coach' ? 'athlete' : 'coach'}
                    content={m.content}
                    label={m.sender_role === 'athlete' ? selected.name : undefined}
                  />
                ))
              )}
              {error && <p className="text-xs text-red-400 mt-2 text-center">{error}</p>}
              <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 flex gap-3 items-end">
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                rows={1}
                placeholder={`Reply to ${selected.name}…`}
                className="flex-1 bg-dark-700 border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-brand-500 transition-colors resize-none min-h-[40px] max-h-32"
                style={{ height: 'auto' }}
                onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
              />
              <Button onClick={sendReply} loading={sending} disabled={!reply.trim()} size="md">Reply</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
