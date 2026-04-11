import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { AppLayout, Button, ChatBubble, TypingIndicator, Alert } from '../components/ui';

// ── Shared message input bar ──────────────────────────────────────────────────
function MessageInput({
  value, onChange, onSend, sending, placeholder, hint
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  placeholder: string;
  hint?: React.ReactNode;
}) {
  return (
    <div
      className="sticky bottom-0 px-6 py-4"
      style={{
        background: 'var(--color-bg-tertiary)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <div className="max-w-4xl mx-auto flex gap-3 items-end">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          rows={1}
          placeholder={placeholder}
          className="flex-1 text-sm placeholder-[var(--color-text-tertiary)] resize-none min-h-[44px] max-h-32 outline-none transition-all duration-150"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: '10px 14px',
            color: 'var(--color-text-primary)',
            height: 'auto',
          }}
          onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--color-accent)'; (e.target as HTMLTextAreaElement).style.boxShadow = '0 0 0 3px var(--color-accent-dim)'; }}
          onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--color-border)'; (e.target as HTMLTextAreaElement).style.boxShadow = 'none'; }}
          onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
        />
        <Button onClick={onSend} loading={sending} disabled={!value.trim()} size="md">Send</Button>
      </div>
      {hint && <div className="max-w-4xl mx-auto mt-2">{hint}</div>}
    </div>
  );
}

// ── Bot chat tab ──────────────────────────────────────────────────────────────
function BotChat() {
  const { profile } = useAuthStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [planUpdated, setPlanUpdated] = useState(false);
  const [error, setError] = useState('');
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  // Conversations dropdown
  const [convOpen, setConvOpen] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const convRef = useRef<HTMLDivElement>(null);

  // New conversation on every mount — no history fetch needed
  useEffect(() => { autoSentRef.current = false; }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    apiFetch('/api/athlete/teams')
      .then((teams: any[]) => {
        const active = teams.find(t => t.is_active);
        setActiveTeam(active?.name ?? null);
      })
      .catch(() => {});
  }, []);

  // Close conversations dropdown on outside click
  useEffect(() => {
    if (!convOpen) return;
    const handler = (e: MouseEvent) => {
      if (convRef.current && !convRef.current.contains(e.target as Node)) setConvOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [convOpen]);

  const [convMigrationRequired, setConvMigrationRequired] = useState(false);

  const fetchConversations = async () => {
    setConvLoading(true);
    try {
      const data = await apiFetch('/api/athlete/conversations');
      // Backend returns { migrationRequired: true, conversations: [] } if table missing
      if (data && !Array.isArray(data) && data.migrationRequired) {
        setConvMigrationRequired(true);
        setConversations([]);
      } else {
        setConvMigrationRequired(false);
        setConversations(Array.isArray(data) ? data : []);
      }
    } catch {}
    finally { setConvLoading(false); }
  };

  const openConversations = () => {
    const opening = !convOpen;
    setConvOpen(opening);
    if (opening) fetchConversations();
  };

  const loadConversation = async (id: string) => {
    setConvOpen(false);
    setConversationId(id);
    setMessages([]);
    try {
      const msgs = await apiFetch(`/api/athlete/chat?conversationId=${id}`);
      setMessages(msgs);
    } catch {}
  };

  const sendMessage = async (msg: string) => {
    if (!msg || sending) return;
    setInput('');
    setSending(true);
    setError('');
    setPlanUpdated(false);
    setMessages(prev => [...prev, { id: Date.now(), role: 'athlete', content: msg, plan_was_updated: false }]);
    try {
      const result = await apiFetch('/api/athlete/chat', {
        method: 'POST',
        body: JSON.stringify({ message: msg, ...(conversationId && { conversationId }) }),
      });
      // Backend creates conversation on first message and returns its id
      const isNewConv = !conversationId && result.conversationId;
      if (isNewConv) setConversationId(result.conversationId);
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'bot', content: result.botReply, plan_was_updated: result.planUpdated }]);
      if (result.planUpdated) setPlanUpdated(true);
      // Refresh conversations list so the new entry shows up immediately
      if (isNewConv) fetchConversations();
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
      setMessages(prev => prev.slice(0, -1));
    } finally { setSending(false); }
  };

  const send = () => sendMessage(input.trim());

  // Auto-send sessionStorage message from "Ask Pace about this"
  useEffect(() => {
    if (autoSentRef.current) return;
    const q = sessionStorage.getItem('paceQuestion');
    if (!q) return;
    autoSentRef.current = true;
    sessionStorage.removeItem('paceQuestion');
    sendMessage(q);
  }, []);

  const PROMPTS = [
    'I feel tired this week',
    'I tweaked my calf, what should I do?',
    'Can I swap Wednesday and Thursday?',
    'I have a race coming up sooner than expected',
  ];

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div
        className="px-6 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}
      >
        <div className="flex items-center gap-3">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {activeTeam
              ? <>Training with <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{activeTeam}</span></>
              : 'Pace is ready to coach'}
          </p>

          {/* Conversations dropdown */}
          <div ref={convRef} className="relative">
            <button
              type="button"
              onClick={openConversations}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: convOpen ? 'var(--color-accent-dim)' : 'var(--color-bg-tertiary)',
                color: convOpen ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                border: `1px solid ${convOpen ? 'var(--color-accent)' : 'var(--color-border)'}`,
              }}
            >
              Conversations ▾
            </button>
            {convOpen && (
              <div
                className="absolute top-full left-0 mt-1 z-50 rounded-xl overflow-hidden"
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                  minWidth: 240,
                  maxHeight: 320,
                  overflowY: 'auto',
                }}
              >
                {convLoading ? (
                  <div className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>
                ) : convMigrationRequired ? (
                  <div className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    Run migration 035 in Supabase to enable conversations.
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>No saved conversations yet.</div>
                ) : (
                  conversations.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => loadConversation(c.id)}
                      className="w-full text-left px-4 py-2.5 transition-colors"
                      style={{
                        background: c.id === conversationId ? 'var(--color-accent-dim)' : 'transparent',
                        borderTop: 'none',
                        borderLeft: 'none',
                        borderRight: 'none',
                        borderBottom: '1px solid var(--color-border)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = c.id === conversationId ? 'var(--color-accent-dim)' : 'transparent'; }}
                    >
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{c.name}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{fmtDate(c.last_message_at)}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/athlete/plan"><Button variant="ghost" size="sm">View Plan</Button></Link>
          <Link to="/athlete/races"><Button variant="ghost" size="sm">Race Calendar</Button></Link>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-4xl w-full mx-auto">
        {planUpdated && (
          <Alert type="success" message="Your plan has been updated." onClose={() => setPlanUpdated(false)}
            action={<Link to="/athlete/plan"><Button size="sm" variant="secondary">View Plan</Button></Link>}
          />
        )}
        {error && <Alert type="error" message={error} onClose={() => setError('')} />}

        {messages.length === 0 && !sending && (
          <div className="text-center py-20">
            <p
              className="text-sm mb-5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Ask Pace anything about your training. Get personalized advice, request plan modifications, or talk through race strategy.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {PROMPTS.map(s => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-xs px-3 py-1.5 rounded-full transition-all duration-150"
                  style={{
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                    background: 'transparent',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-secondary)';
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatBubble
            key={msg.id || i}
            role={msg.role}
            content={msg.content}
            planUpdated={msg.plan_was_updated}
            avatarUrl={msg.role === 'athlete' ? (profile as any)?.avatar_url : undefined}
            avatarName={msg.role === 'athlete' ? profile?.name : undefined}
          />
        ))}
        {sending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        value={input}
        onChange={setInput}
        onSend={send}
        sending={sending}
        placeholder="Ask Pace anything about your training… (Enter to send, Shift+Enter for new line)"
        hint={
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            The bot can adjust workouts within the next 14 days. For larger changes, use{' '}
            <Link to="/athlete/races" style={{ color: 'var(--color-accent)' }} className="hover:underline">Regenerate Plan</Link>.
          </p>
        }
      />
    </div>
  );
}

// ── Direct coach chat tab ─────────────────────────────────────────────────────
function DirectChat() {
  const { profile } = useAuthStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch('/api/athlete/messages')
      .then(msgs => { setMessages(msgs); setLoaded(true); })
      .catch(console.error);
  }, []);

  useEffect(() => {
    apiFetch('/api/athlete/teams')
      .then((teams: any[]) => {
        const active = teams.find(t => t.is_active);
        setActiveTeam(active?.name ?? null);
      })
      .catch(() => {});
  }, []);

  // Poll for new coach replies every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      if (sending) return;
      apiFetch('/api/athlete/messages')
        .then(setMessages)
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [sending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setSending(true);
    setError('');
    const optimistic = { id: Date.now(), sender_role: 'athlete', content: msg };
    setMessages(prev => [...prev, optimistic]);
    try {
      const dm = await apiFetch('/api/athlete/messages', { method: 'POST', body: JSON.stringify({ message: msg }) });
      setMessages(prev => [...prev.slice(0, -1), dm]);
    } catch (e: any) {
      setError(e.message);
      setMessages(prev => prev.slice(0, -1));
    } finally { setSending(false); }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        className="px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {activeTeam
            ? <>Messaging <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{activeTeam}</span></>
            : 'Direct messages'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-4xl w-full mx-auto">
        {error && <Alert type="error" message={error} onClose={() => setError('')} />}

        {loaded && messages.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Send a message to start the conversation.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <ChatBubble
            key={m.id || i}
            role={m.sender_role === 'athlete' ? 'athlete' : 'coach'}
            content={m.content}
            avatarUrl={m.sender_role === 'athlete' ? (profile as any)?.avatar_url : undefined}
            avatarName={m.sender_role === 'athlete' ? profile?.name : undefined}
          />
        ))}
        {sending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        value={input}
        onChange={setInput}
        onSend={send}
        sending={sending}
        placeholder="Send a message… (Enter to send, Shift+Enter for new line)"
      />
    </div>
  );
}

// ── Main Chat page ────────────────────────────────────────────────────────────
export function Chat() {
  const { profile, logout } = useAuthStore();
  const nav = useNavigate();
  const handleLogout = async () => { await logout(); nav('/'); };

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={handleLogout}>
      <div
        className="flex flex-col"
        style={{ minHeight: '100vh', background: 'var(--color-bg-primary)' }}
      >
        {/* Page header */}
        <div
          className="px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Pace</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>Your AI running coach</p>
        </div>

        <BotChat />
      </div>
    </AppLayout>
  );
}
