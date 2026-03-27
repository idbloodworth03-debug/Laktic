import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, ChatBubble, TypingIndicator, Alert } from '../components/ui';

export function Chat() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [planUpdated, setPlanUpdated] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/athlete/chat').then(setMessages).catch(console.error);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setSending(true);
    setError('');
    setPlanUpdated(false);

    // Optimistic add
    setMessages(prev => [...prev, { id: Date.now(), role: 'athlete', content: msg, plan_was_updated: false }]);

    try {
      const result = await apiFetch('/api/athlete/chat', { method: 'POST', body: JSON.stringify({ message: msg }) });
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'bot',
        content: result.botReply,
        plan_was_updated: result.planUpdated
      }]);
      if (result.planUpdated) setPlanUpdated(true);
    } catch (e: any) {
      setError(e.message);
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'bot', content: 'Sorry, I ran into a technical issue. Your plan has not been changed.', plan_was_updated: false }]);
    } finally { setSending(false); }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Check if last bot message mentions regenerate plan
  const lastBotMsg = [...messages].reverse().find(m => m.role === 'bot');
  const showRegenShortcut = lastBotMsg?.content?.toLowerCase().includes('regenerate plan');

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />

      {/* Subheader */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-2 flex items-center justify-between">
        <div className="text-sm text-[var(--muted)]">Chat with your coach bot</div>
        <div className="flex gap-3">
          <Link to="/athlete/plan"><Button variant="ghost" size="sm">← View Plan</Button></Link>
          <Link to="/athlete/races"><Button variant="ghost" size="sm">Race Calendar</Button></Link>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-4xl w-full mx-auto">
        {planUpdated && (
          <Alert
            type="success"
            message="Your plan has been updated."
            onClose={() => setPlanUpdated(false)}
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
          <div key={msg.id || i}>
            <ChatBubble role={msg.role} content={msg.content} planUpdated={msg.plan_was_updated} />
            {/* Regenerate shortcut after last bot message */}
            {msg.role === 'bot' && i === messages.length - 1 && showRegenShortcut && (
              <div className="flex justify-start ml-2 mb-4">
                <Link to="/athlete/races">
                  <Button variant="secondary" size="sm">↺ Go to Regenerate Plan</Button>
                </Link>
              </div>
            )}
          </div>
        ))}

        {sending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4">
        <div className="max-w-4xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder="Message your coach bot… (Enter to send, Shift+Enter for new line)"
            className="flex-1 bg-dark-700 border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-brand-500 transition-colors resize-none min-h-[44px] max-h-32"
            style={{ height: 'auto' }}
            onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
          />
          <Button onClick={send} loading={sending} disabled={!input.trim()} size="md">Send</Button>
        </div>
        <div className="max-w-4xl mx-auto mt-1">
          <p className="text-xs text-[var(--muted)]">
            The bot can adjust workouts within the next 14 days. For larger changes, use{' '}
            <Link to="/athlete/races" className="text-brand-400 hover:underline">Regenerate Plan</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
