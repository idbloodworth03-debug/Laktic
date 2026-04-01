import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
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
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [planUpdated, setPlanUpdated] = useState(false);
  const [error, setError] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch('/api/athlete/chat').then(setMessages).catch(console.error);
  }, []);

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

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setSending(true);
    setError('');
    setPlanUpdated(false);
    setMessages(prev => [...prev, { id: Date.now(), role: 'athlete', content: msg, plan_was_updated: false }]);
    try {
      const result = await apiFetch('/api/athlete/chat', { method: 'POST', body: JSON.stringify({ message: msg }) });
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'bot', content: result.botReply, plan_was_updated: result.planUpdated }]);
      if (result.planUpdated) setPlanUpdated(true);
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
      setMessages(prev => prev.slice(0, -1));
    } finally { setSending(false); }
  };

  const clearChat = async () => {
    setClearing(true);
    try {
      await apiFetch('/api/athlete/chat', { method: 'DELETE' });
      setMessages([]);
      setClearConfirm(false);
    } catch (e: any) {
      setError(e.message);
    } finally { setClearing(false); }
  };

  const PROMPTS = [
    'I feel tired this week',
    'I tweaked my calf, what should I do?',
    'Can I swap Wednesday and Thursday?',
    'I have a race coming up sooner than expected',
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div
        className="px-6 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {activeTeam
            ? <>Training with <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{activeTeam}</span></>
            : 'Pace is ready to coach'}
        </p>
        <div className="flex items-center gap-2">
          {clearConfirm ? (
            <>
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Clear all messages?</span>
              <Button variant="danger" size="sm" loading={clearing} onClick={clearChat}>Confirm</Button>
              <Button variant="ghost" size="sm" onClick={() => setClearConfirm(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setClearConfirm(true)}>Clear Chat</Button>
          )}
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
            ? <>Messaging <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{activeTeam}</span>'s coach</>
            : 'Direct messages with your coach'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-4xl w-full mx-auto">
        {error && <Alert type="error" message={error} onClose={() => setError('')} />}

        {loaded && messages.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Send a message directly to your coach. They'll reply here.
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
        placeholder="Message your coach… (Enter to send, Shift+Enter for new line)"
        hint={
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Messages are reviewed by your coach, not the AI bot.
          </p>
        }
      />
    </div>
  );
}

// ── Main Chat page ────────────────────────────────────────────────────────────
export function Chat() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
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
