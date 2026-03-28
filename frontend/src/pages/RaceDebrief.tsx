import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Spinner } from '../components/ui';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type Debrief = {
  id: string;
  race_result_id: string;
  messages: Message[];
  completed_at: string | null;
  coach_flagged: boolean;
  insights: Record<string, unknown> | null;
  summary: string | null;
};

function ChatBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={[
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-brand-600 text-white rounded-br-sm'
            : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-bl-sm',
        ].join(' ')}
      >
        {content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export function RaceDebrief() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { profile, clearAuth } = useAuthStore();
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    if (!id) return;
    apiFetch(`/api/debriefs/${id}`)
      .then(setDebrief)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [debrief?.messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !id || sending || debrief?.completed_at) return;

    setInput('');
    setSending(true);
    setError('');

    // Optimistic update
    setDebrief(prev => prev ? {
      ...prev,
      messages: [...prev.messages, { role: 'user', content: text }]
    } : prev);

    try {
      const updated = await apiFetch(`/api/debriefs/${id}/message`, {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      setDebrief(updated);
    } catch (e: any) {
      setError(e.message || 'Failed to send message');
      // Revert optimistic
      setDebrief(prev => prev ? {
        ...prev,
        messages: prev.messages.slice(0, -1)
      } : prev);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleComplete = async () => {
    if (!id) return;
    setSending(true);
    try {
      const updated = await apiFetch(`/api/debriefs/${id}/complete`, { method: 'POST' });
      setDebrief(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner />
    </div>
  );

  const messages = debrief?.messages ?? [];
  const isComplete = !!debrief?.completed_at;
  const insights = debrief?.insights as Record<string, string> | null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />

      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display text-xl font-bold">Post-Race Debrief</h1>
            {isComplete && (
              <span className="text-xs text-brand-400 font-medium">Completed</span>
            )}
          </div>
          <Link to="/athlete/races">
            <Button variant="ghost" size="sm">Back to Races</Button>
          </Link>
        </div>

        {debrief?.coach_flagged && (
          <div className="mb-4 text-sm text-amber-400 bg-amber-900/20 border border-amber-900/40 rounded-lg px-3 py-2">
            Your coach has been notified about something you mentioned. They may reach out.
          </div>
        )}

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto mb-4 min-h-0">
          {messages.map((msg, i) => (
            <ChatBubble key={i} role={msg.role} content={msg.content} />
          ))}
          {sending && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Summary card when complete */}
        {isComplete && insights && (
          <div className="mb-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-2">
            <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">Debrief Summary</p>
            {insights.went_well && (
              <div>
                <span className="text-xs text-[var(--muted)]">Went well: </span>
                <span className="text-sm">{insights.went_well}</span>
              </div>
            )}
            {insights.improve_next_time && (
              <div>
                <span className="text-xs text-[var(--muted)]">Improve: </span>
                <span className="text-sm">{insights.improve_next_time}</span>
              </div>
            )}
            {insights.pacing_execution && (
              <div>
                <span className="text-xs text-[var(--muted)]">Pacing: </span>
                <span className="text-sm">{insights.pacing_execution}</span>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        {!isComplete ? (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response..."
              className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
              disabled={sending}
            />
            <Button
              variant="primary"
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              loading={sending}
            >
              Send
            </Button>
            <Button variant="ghost" size="sm" onClick={handleComplete} disabled={sending}>
              Finish
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <Link to="/athlete/races">
              <Button variant="primary">Back to Race Calendar</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
