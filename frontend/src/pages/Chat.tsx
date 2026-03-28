import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, ChatBubble, TypingIndicator, Alert } from '../components/ui';

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
    <div className="border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4">
      <div className="max-w-4xl mx-auto flex gap-3 items-end">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          rows={1}
          placeholder={placeholder}
          className="flex-1 bg-dark-700 border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-brand-500 transition-colors resize-none min-h-[44px] max-h-32"
          style={{ height: 'auto' }}
          onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
        />
        <Button onClick={onSend} loading={sending} disabled={!value.trim()} size="md">Send</Button>
      </div>
      {hint && <div className="max-w-4xl mx-auto mt-1">{hint}</div>}
    </div>
  );
}

// ── Bot chat tab ──────────────────────────────────────────────────────────────
function BotChat() {
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
      setMessages(prev => prev.slice(0, -1)); // rollback optimistic athlete message
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

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-2 flex items-center justify-between">
        <div className="text-sm text-[var(--muted)]">
          {activeTeam ? <span>Chatting with <span className="text-[var(--text)] font-medium">{activeTeam}</span>'s bot</span> : 'Chat with your coach bot'}
        </div>
        <div className="flex items-center gap-2">
          {clearConfirm ? (
            <>
              <span className="text-xs text-[var(--muted)]">Clear all messages?</span>
              <Button variant="danger" size="sm" loading={clearing} onClick={clearChat}>Confirm</Button>
              <Button variant="ghost" size="sm" onClick={() => setClearConfirm(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setClearConfirm(true)}>Clear Chat</Button>
          )}
          <Link to="/athlete/plan"><Button variant="ghost" size="sm">← View Plan</Button></Link>
          <Link to="/athlete/races"><Button variant="ghost" size="sm">↺ Regenerate Plan</Button></Link>
          <Link to="/athlete/races"><Button variant="ghost" size="sm">Race Calendar</Button></Link>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-4xl w-full mx-auto">
        {planUpdated && (
          <Alert type="success" message="Your plan has been updated." onClose={() => setPlanUpdated(false)}
            action={<Link to="/athlete/plan"><Button size="sm" variant="secondary">View Plan →</Button></Link>}
          />
        )}
        {error && <Alert type="error" message={error} onClose={() => setError('')} />}

        {messages.length === 0 && !sending && (
          <div className="text-center py-20 text-[var(--muted)]">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm">Send a message to your coach bot. Ask about training, request modifications, or discuss your upcoming races.</p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {['I feel tired this week', 'I tweaked my calf, what should I do?', 'Can I swap Wednesday and Thursday?', 'I have a race coming up sooner than expected'].map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-brand-500 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatBubble key={msg.id || i} role={msg.role} content={msg.content} planUpdated={msg.plan_was_updated} />
        ))}
        {sending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        value={input}
        onChange={setInput}
        onSend={send}
        sending={sending}
        placeholder="Message your coach bot… (Enter to send, Shift+Enter for new line)"
        hint={
          <p className="text-xs text-[var(--muted)]">
            The bot can adjust workouts within the next 14 days. For larger changes, use{' '}
            <Link to="/athlete/races" className="text-brand-400 hover:underline">Regenerate Plan</Link>.
          </p>
        }
      />
    </div>
  );
}

// ── Direct coach chat tab ─────────────────────────────────────────────────────
function DirectChat() {
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
      if (sending) return; // don't clobber an in-flight send
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
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-2">
        <div className="text-sm text-[var(--muted)]">
          {activeTeam ? <span>Messaging <span className="text-[var(--text)] font-medium">{activeTeam}</span>'s coach</span> : 'Direct messages with your coach'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-4xl w-full mx-auto">
        {error && <Alert type="error" message={error} onClose={() => setError('')} />}

        {loaded && messages.length === 0 && (
          <div className="text-center py-20 text-[var(--muted)]">
            <div className="text-4xl mb-3">✉️</div>
            <p className="text-sm">Send a message directly to your coach. They'll reply here.</p>
          </div>
        )}

        {messages.map((m, i) => (
          <ChatBubble
            key={m.id || i}
            role={m.sender_role === 'athlete' ? 'athlete' : 'coach'}
            content={m.content}
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
          <p className="text-xs text-[var(--muted)]">
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
  const [tab, setTab] = useState<'bot' | 'coach'>('bot');
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const tabCls = (active: boolean) =>
    `px-5 py-1.5 rounded-md text-sm font-medium transition-all ${
      active
        ? 'bg-[var(--surface3)] text-[var(--text)] shadow-sm border border-[var(--border2)]'
        : 'text-[var(--muted)] hover:text-[var(--text)]'
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />

      {/* Tab bar */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3 flex items-center justify-center">
        <div className="flex items-center bg-[var(--surface2)] border border-[var(--border)] rounded-lg p-0.5 gap-0.5">
          <button className={tabCls(tab === 'bot')}   onClick={() => setTab('bot')}>Coach Bot</button>
          <button className={tabCls(tab === 'coach')} onClick={() => setTab('coach')}>My Coach</button>
        </div>
      </div>

      {tab === 'bot'   ? <BotChat />    : <DirectChat />}
    </div>
  );
}
