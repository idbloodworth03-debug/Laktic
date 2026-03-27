import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Badge, Spinner, Alert, ChatBubble, TypingIndicator } from '../components/ui';

type AthleteProfile = {
  id: string;
  name: string;
  weekly_volume_miles: number | null;
  primary_events: string | null;
};

type WeeklySummary = {
  id: string;
  week_start: string;
  total_distance_miles: number;
  total_duration_minutes: number;
  run_count: number;
  avg_pace_per_mile: string;
  avg_heartrate: number | null;
  longest_run_miles: number;
  compliance_pct: number | null;
};

type TeamMemberProgress = {
  athlete: AthleteProfile;
  member_status: string;
  latest_week: WeeklySummary | null;
};

type AthleteDetail = {
  profile: AthleteProfile;
  summaries: WeeklySummary[];
  races: any[];
};

function ComplianceBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-[var(--muted)]">--</span>;
  const color = pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'gray';
  return <Badge label={`${pct}%`} color={color} />;
}

// ── Bot chat viewer (read-only) ───────────────────────────────────────────────
function BotChatViewer({ athleteId }: { athleteId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch(`/api/coach/team/athletes/${athleteId}/chat`)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [athleteId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <div className="max-h-[500px] overflow-y-auto px-2 py-4">
      {messages.length === 0 ? (
        <p className="text-sm text-[var(--muted)] text-center py-10">No bot conversations yet.</p>
      ) : (
        messages.map((m, i) => (
          <ChatBubble key={m.id || i} role={m.role} content={m.content} planUpdated={m.plan_was_updated} />
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Direct message thread ─────────────────────────────────────────────────────
function DirectMessages({ athleteId, athleteName }: { athleteId: string; athleteName: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch(`/api/coach/team/athletes/${athleteId}/messages`)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [athleteId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setSending(true);
    setError('');
    const optimistic = { id: Date.now(), sender_role: 'coach', content: msg };
    setMessages(prev => [...prev, optimistic]);
    try {
      const dm = await apiFetch(`/api/coach/team/athletes/${athleteId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: msg })
      });
      setMessages(prev => [...prev.slice(0, -1), dm]);
    } catch (e: any) {
      setError(e.message);
      setMessages(prev => prev.slice(0, -1));
    } finally { setSending(false); }
  };

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-0">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="max-h-[400px] overflow-y-auto px-2 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-10">
            No messages yet. Send the first message to {athleteName}.
          </p>
        ) : (
          messages.map((m, i) => (
            <ChatBubble
              key={m.id || i}
              role={m.sender_role === 'coach' ? 'athlete' : 'bot'}
              content={m.content}
            />
          ))
        )}
        {sending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--border)] pt-4 flex gap-3 items-end">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          placeholder={`Message ${athleteName}…`}
          className="flex-1 bg-dark-700 border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-brand-500 transition-colors resize-none min-h-[44px] max-h-32"
          style={{ height: 'auto' }}
          onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
        />
        <Button onClick={send} loading={sending} disabled={!input.trim()} size="md">Send</Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function CoachTeamProgress() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [members, setMembers] = useState<TeamMemberProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [athleteDetail, setAthleteDetail] = useState<AthleteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'progress' | 'botchat' | 'messages'>('progress');
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/coach/team/progress')
      .then(setMembers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const viewAthlete = async (athleteId: string) => {
    setSelectedAthlete(athleteId);
    setDetailTab('progress');
    setDetailLoading(true);
    setError('');
    try {
      const detail = await apiFetch(`/api/coach/team/athletes/${athleteId}/progress?weeks=12`);
      setAthleteDetail(detail);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedAthlete(null);
    setAthleteDetail(null);
  };

  const tabCls = (active: boolean) =>
    `px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
      active
        ? 'bg-[var(--surface3)] text-[var(--text)] shadow-sm border border-[var(--border2)]'
        : 'text-[var(--muted)] hover:text-[var(--text)]'
    }`;

  return (
    <div className="min-h-screen">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-bold">Team Progress</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Overview of your athletes' training progress</p>
          </div>
          <div className="flex gap-2">
            <Link to="/coach/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>
          </div>
        </div>

        {error && <Alert type="error" message={error} onClose={() => setError('')} />}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
        ) : selectedAthlete ? (
          /* Athlete Detail View */
          <div>
            <Button variant="ghost" size="sm" onClick={closeDetail} className="mb-4">← Back to Team</Button>

            {detailLoading ? (
              <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
            ) : athleteDetail ? (
              <div className="flex flex-col gap-4">
                {/* Profile header */}
                <Card title={athleteDetail.profile.name}>
                  <div className="text-sm text-[var(--muted)]">
                    {athleteDetail.profile.primary_events && <span>{athleteDetail.profile.primary_events}</span>}
                    {athleteDetail.profile.weekly_volume_miles && <span> · Target {athleteDetail.profile.weekly_volume_miles} mi/wk</span>}
                  </div>
                </Card>

                {/* Tab selector */}
                <div className="flex items-center bg-[var(--surface2)] border border-[var(--border)] rounded-lg p-0.5 gap-0.5 self-start">
                  <button className={tabCls(detailTab === 'progress')} onClick={() => setDetailTab('progress')}>Progress</button>
                  <button className={tabCls(detailTab === 'botchat')}  onClick={() => setDetailTab('botchat')}>Bot Chat</button>
                  <button className={tabCls(detailTab === 'messages')} onClick={() => setDetailTab('messages')}>Messages</button>
                </div>

                {/* Tab content */}
                {detailTab === 'progress' && (
                  <div className="flex flex-col gap-4">
                    {athleteDetail.summaries.length > 0 && (
                      <Card title="Weekly Summaries">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
                                <th className="pb-2 pr-4">Week</th>
                                <th className="pb-2 pr-4">Miles</th>
                                <th className="pb-2 pr-4">Runs</th>
                                <th className="pb-2 pr-4">Avg Pace</th>
                                <th className="pb-2 pr-4">Avg HR</th>
                                <th className="pb-2 pr-4">Longest</th>
                                <th className="pb-2">Compliance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {athleteDetail.summaries.map(s => (
                                <tr key={s.id || s.week_start} className="border-b border-[var(--border)] last:border-0">
                                  <td className="py-2 pr-4 text-[var(--muted)]">{new Date(s.week_start + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                                  <td className="py-2 pr-4 font-medium">{s.total_distance_miles.toFixed(1)}</td>
                                  <td className="py-2 pr-4">{s.run_count}</td>
                                  <td className="py-2 pr-4">{s.avg_pace_per_mile || '--'}</td>
                                  <td className="py-2 pr-4">{s.avg_heartrate || '--'}</td>
                                  <td className="py-2 pr-4">{s.longest_run_miles.toFixed(1)}</td>
                                  <td className="py-2"><ComplianceBadge pct={s.compliance_pct} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    )}

                    {athleteDetail.races.length > 0 && (
                      <Card title="Race Results">
                        <div className="flex flex-col gap-2">
                          {athleteDetail.races.map((r: any) => (
                            <div key={r.id} className="flex items-center justify-between p-3 bg-dark-700 rounded-lg border border-[var(--border)]">
                              <div className="flex items-center gap-3">
                                {r.is_pr && <Badge label="PR" color="amber" />}
                                <div>
                                  <div className="text-sm font-medium">{r.race_name}</div>
                                  <div className="text-xs text-[var(--muted)]">{r.distance} · {new Date(r.race_date + 'T00:00:00').toLocaleDateString()}</div>
                                </div>
                              </div>
                              <div className="text-sm font-semibold">{r.finish_time}</div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}

                    {athleteDetail.summaries.length === 0 && athleteDetail.races.length === 0 && (
                      <Card>
                        <p className="text-sm text-[var(--muted)] text-center py-6">No progress data yet. Athlete needs to sync activities.</p>
                      </Card>
                    )}
                  </div>
                )}

                {detailTab === 'botchat' && (
                  <Card title="Bot Conversation">
                    <BotChatViewer athleteId={selectedAthlete} />
                  </Card>
                )}

                {detailTab === 'messages' && (
                  <Card title={`Messages with ${athleteDetail.profile.name}`}>
                    <DirectMessages athleteId={selectedAthlete} athleteName={athleteDetail.profile.name} />
                  </Card>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          /* Team Overview */
          <Card>
            {members.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-[var(--muted)]">No active team members yet. Athletes need to sync activities for progress data to appear.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
                      <th className="pb-2 pr-4">Athlete</th>
                      <th className="pb-2 pr-4">Weekly Miles</th>
                      <th className="pb-2 pr-4">Compliance</th>
                      <th className="pb-2 pr-4">Avg Pace</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => (
                      <tr key={m.athlete.id} className="border-b border-[var(--border)] last:border-0 hover:bg-dark-700/50 cursor-pointer" onClick={() => viewAthlete(m.athlete.id)}>
                        <td className="py-3 pr-4">
                          <div className="font-medium">{m.athlete.name}</div>
                          {m.athlete.primary_events && <div className="text-xs text-[var(--muted)]">{m.athlete.primary_events}</div>}
                        </td>
                        <td className="py-3 pr-4 font-medium">{m.latest_week ? `${m.latest_week.total_distance_miles.toFixed(1)}` : '--'}</td>
                        <td className="py-3 pr-4"><ComplianceBadge pct={m.latest_week?.compliance_pct ?? null} /></td>
                        <td className="py-3 pr-4">{m.latest_week?.avg_pace_per_mile || '--'}</td>
                        <td className="py-3 pr-4">
                          <Badge label={m.member_status} color={m.member_status === 'active' ? 'green' : m.member_status === 'injured' ? 'amber' : 'gray'} />
                        </td>
                        <td className="py-3 text-right">
                          <Button variant="ghost" size="sm">View</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
