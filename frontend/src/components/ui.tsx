import React, { useState } from 'react';

// ── Button ────────────────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}
export function Button({
  variant = 'primary', loading, size = 'md', children, disabled, className = '', ...rest
}: ButtonProps) {
  const base = [
    'inline-flex items-center justify-center gap-2 font-medium rounded-lg',
    'transition-all duration-150 select-none',
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
    'active:scale-[0.97] active:translate-y-px',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
    'focus-visible:ring-offset-[var(--bg)]',
    'font-sans',
  ].join(' ');
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-sm',
    xl: 'px-8 py-3.5 text-base',
  };
  const variants = {
    primary:   'bg-gradient-to-b from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white shadow-btn-primary hover:shadow-btn-primary-hover focus-visible:ring-brand-500/50',
    secondary: 'bg-[var(--surface2)] hover:bg-[var(--surface3)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border2)] focus-visible:ring-brand-500/30',
    ghost:     'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] focus-visible:ring-[var(--muted2)]',
    danger:    'bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/40 hover:border-red-800/60 focus-visible:ring-red-500/30',
  };
  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

// ── Input ──────────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
export function Input({ label, error, className = '', ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-[var(--text2)] uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        className={[
          'bg-[var(--surface2)] rounded-lg px-3 py-2 text-sm text-[var(--text)]',
          'placeholder-[var(--muted2)] transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500/50',
          error ? 'border border-red-500/60' : 'border border-[var(--border)]',
          className,
        ].join(' ')}
        {...rest}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

// ── Textarea ─────────────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}
export function Textarea({ label, error, className = '', ...rest }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-[var(--text2)] uppercase tracking-wide">
          {label}
        </label>
      )}
      <textarea
        className={[
          'bg-[var(--surface2)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)]',
          'placeholder-[var(--muted2)] transition-all duration-150 resize-vertical leading-relaxed',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500/50',
          error ? 'border border-red-500/60' : 'border border-[var(--border)]',
          className,
        ].join(' ')}
        {...rest}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────────
interface CardProps { title?: string; children: React.ReactNode; className?: string; }
export function Card({ title, children, className = '' }: CardProps) {
  return (
    <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-card ${className}`}>
      {title && (
        <div className="pb-3 mb-4 border-b border-[var(--border)]/70">
          <h3 className="font-display text-sm font-semibold text-[var(--text)] tracking-tight">
            {title}
          </h3>
        </div>
      )}
      {children}
    </div>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────────────
interface BadgeProps { label: string; color?: 'green' | 'blue' | 'amber' | 'purple' | 'gray' | 'red'; dot?: boolean; }
export function Badge({ label, color = 'green', dot = false }: BadgeProps) {
  const colors = {
    green:  'bg-brand-900/50 text-brand-400 border-brand-800/50',
    blue:   'bg-blue-950/60 text-blue-400 border-blue-900/50',
    amber:  'bg-amber-950/60 text-amber-400 border-amber-900/50',
    purple: 'bg-purple-950/60 text-purple-400 border-purple-900/50',
    gray:   'bg-[var(--surface2)] text-[var(--muted)] border-[var(--border)]',
    red:    'bg-red-950/60 text-red-400 border-red-900/50',
  };
  const dotColors = {
    green: 'bg-brand-400', blue: 'bg-blue-400', amber: 'bg-amber-400',
    purple: 'bg-purple-400', gray: 'bg-[var(--muted)]', red: 'bg-red-400',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${colors[color]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[color]}`} />}
      {label}
    </span>
  );
}

// ── Spinner ─────────────────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-3.5 h-3.5', md: 'w-5 h-5', lg: 'w-8 h-8' };
  return (
    <div className={`${s[size]} rounded-full border-2 border-[var(--border2)] border-t-brand-500 animate-spin`} />
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────────────
interface NavbarProps { role?: string; name?: string; onLogout?: () => void; }
export function Navbar({ role, name, onLogout }: NavbarProps) {
  const [open, setOpen] = useState(false);

  const athleteLinks = [
    { label: 'Season Plan',    href: '/athlete/plan' },
    { label: 'Race Calendar',  href: '/athlete/races' },
    { label: 'Coach Bot',      href: '/athlete/chat' },
    { label: 'Progress',       href: '/athlete/progress' },
    { label: 'Activities',     href: '/athlete/activities' },
    { label: 'Calendar',       href: '/athlete/calendar' },
    { label: 'Nutrition',      href: '/athlete/nutrition' },
    { label: 'Team Feed',      href: '/athlete/feed' },
    { label: 'Leaderboard',    href: '/athlete/leaderboard' },
    { label: 'Marketplace',    href: '/marketplace' },
    { label: 'Browse Bots',    href: '/athlete/browse' },
    { label: 'Community',      href: '/community' },
    { label: 'Gameplans',      href: '/athlete/gameplans' },
    { label: 'Analytics',      href: '/athlete/analytics' },
    { label: 'Training Plans', href: '/marketplace/plans' },
    { label: 'Pro',            href: '/athlete/pro' },
    { label: 'Referrals',      href: '/referrals' },
    { label: 'Settings',       href: '/athlete/settings' },
  ];

  const coachLinks = [
    { label: 'Dashboard',      href: '/coach/dashboard' },
    { label: 'Team Progress',  href: '/coach/progress' },
    { label: 'Team Calendar',  href: '/coach/calendar' },
    { label: 'Bot Setup',      href: '/coach/bot/edit' },
    { label: 'Knowledge Docs', href: '/coach/knowledge' },
    { label: 'Community',      href: '/community' },
    { label: 'Team Readiness', href: '/coach/readiness' },
    { label: 'Team Recovery',  href: '/coach/recovery' },
    { label: 'Marketplace',    href: '/coach/marketplace/apply' },
    { label: 'Training Plans', href: '/coach/plans' },
    { label: 'Certification',  href: '/coach/certification' },
    { label: 'Referrals',      href: '/referrals' },
    { label: 'Settings',       href: '/coach/settings' },
  ];

  const links = role === 'athlete' ? athleteLinks : role === 'coach' ? coachLinks : [];
  const homeHref = role === 'coach' ? '/coach/dashboard' : role === 'athlete' ? '/athlete/plan' : '/';
  const current = typeof window !== 'undefined' ? window.location.pathname : '';

  return (
    <>
      <nav className="surface-glass border-b border-[var(--border)] px-5 py-4 flex items-center justify-between sticky top-0 z-40">
        <a href={homeHref} className="font-display font-black text-xl tracking-tight text-gradient hover:opacity-80 transition-opacity">
          LAKTIC
        </a>
        {name && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[var(--surface2)] border border-[var(--border2)] flex items-center justify-center text-xs font-semibold text-brand-400 shrink-0">
                {name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-[var(--text2)]">{name}</span>
            </div>
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="w-9 h-9 flex flex-col items-center justify-center gap-[5px] rounded-lg hover:bg-[var(--surface2)] transition-colors"
            >
              <span className="w-5 h-[2px] bg-[var(--text2)] rounded-full" />
              <span className="w-5 h-[2px] bg-[var(--text2)] rounded-full" />
              <span className="w-5 h-[2px] bg-[var(--text2)] rounded-full" />
            </button>
          </div>
        )}
      </nav>

      {open && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setOpen(false)} />}

      <div className={`fixed top-0 right-0 h-full w-72 bg-[var(--surface)] border-l border-[var(--border)] z-50 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--surface2)] border border-[var(--border2)] flex items-center justify-center text-sm font-semibold text-brand-400">
              {name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--text)]">{name}</div>
              {role && <div className="text-xs text-[var(--muted)] capitalize">{role}</div>}
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors text-lg">×</button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {links.map(link => {
            const active = current === link.href;
            return (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`flex items-center px-5 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'text-brand-400 bg-brand-950/40 border-r-2 border-brand-500'
                    : 'text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface2)]'
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-[var(--border)]">
          <button
            onClick={() => { setOpen(false); onLogout?.(); }}
            className="w-full text-left text-sm text-[var(--muted)] hover:text-[var(--danger)] transition-colors py-2"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────────────────
interface EmptyStateProps { title: string; message: string; action?: React.ReactNode; }
export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-[var(--surface2)] border border-[var(--border2)] flex items-center justify-center text-2xl text-[var(--muted)]">◎</div>
      <div>
        <h3 className="font-display text-base font-semibold text-[var(--text)] mb-1">{title}</h3>
        <p className="text-sm text-[var(--muted)] max-w-xs leading-relaxed">{message}</p>
      </div>
      {action}
    </div>
  );
}

// ── ChatBubble ──────────────────────────────────────────────────────────────────────────
// role="athlete"  → right-aligned blue bubble (the current user's own message)
// role="bot"      → left-aligned gray bubble labelled "Coach Bot"
// role="coach"    → left-aligned gray bubble labelled "Your Coach" (or override with label)
interface ChatBubbleProps {
  role: 'athlete' | 'bot' | 'coach';
  content: string;
  planUpdated?: boolean;
  label?: string; // overrides the default left-side sender label
}
export function ChatBubble({ role, content, planUpdated, label }: ChatBubbleProps) {
  const isRight = role === 'athlete';
  const leftLabel = label ?? (role === 'coach' ? 'Your Coach' : 'Coach Bot');
  return (
    <div className={`flex ${isRight ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[78%] ${isRight ? 'items-end flex flex-col' : ''}`}>
        {!isRight && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-4 h-4 rounded-full bg-brand-950 border border-brand-800/60 flex items-center justify-center shrink-0">
              <span className="block w-1.5 h-1.5 rounded-full bg-brand-400" />
            </div>
            <span className="text-xs text-[var(--muted)] font-medium">{leftLabel}</span>
          </div>
        )}
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isRight
            ? 'bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-tr-sm shadow-glow-sm'
            : 'bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] rounded-tl-sm shadow-sm'
        }`}>
          {content}
        </div>
        {planUpdated && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 inline-block animate-pulse" />
            Plan updated
          </span>
        )}
      </div>
    </div>
  );
}

// ── DocumentCard ──────────────────────────────────────────────────────────────────────────
interface DocumentCardProps {
  id: string; title: string; document_type: string; created_at: string;
  onEdit: (id: string) => void; onDelete: (id: string) => void;
  onHistory?: (id: string) => void;
}
const DOC_COLORS: Record<string, any> = {
  philosophy: 'purple', sample_week: 'green', training_block: 'blue',
  taper: 'amber', injury_rule: 'amber', faq: 'gray', notes: 'gray',
};
export function DocumentCard({ id, title, document_type, created_at, onEdit, onDelete, onHistory }: DocumentCardProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border2)] rounded-xl px-4 py-3 transition-colors group">
      <div className="flex items-center gap-3 min-w-0">
        <Badge label={document_type.replace('_', ' ')} color={DOC_COLORS[document_type] || 'gray'} />
        <span className="text-sm font-medium text-[var(--text)] truncate">{title}</span>
        <span className="text-xs text-[var(--muted)] shrink-0">{new Date(created_at).toLocaleDateString()}</span>
      </div>
      <div className="flex items-center gap-1.5 ml-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {onHistory && (
          <Button variant="ghost" size="sm" onClick={() => onHistory(id)}>History</Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onEdit(id)}>Edit</Button>
        {confirming
          ? <Button variant="danger" size="sm" onClick={() => { onDelete(id); setConfirming(false); }}>Confirm</Button>
          : <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} className="!text-red-400 hover:!text-red-300">Delete</Button>
        }
      </div>
    </div>
  );
}

// ── TypingIndicator ───────────────────────────────────────────────────────────────────────────
export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center shadow-sm">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--muted)]"
            style={{ animation: `pulse-dot 1.4s ${i * 0.2}s ease-in-out infinite` }} />
        ))}
      </div>
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; options: { value: string; label: string }[];
}
export function Select({ label, options, className = '', ...rest }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-[var(--text2)] uppercase tracking-wide">
          {label}
        </label>
      )}
      <select
        className={`bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/10 transition-all duration-150 cursor-pointer ${className}`}
        {...rest}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────────────
interface ToggleProps { checked: boolean; onChange: (v: boolean) => void; label?: string; }
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-all duration-200 relative ${
          checked
            ? 'bg-gradient-to-r from-brand-500 to-brand-600 shadow-glow-sm'
            : 'bg-[var(--surface2)] border border-[var(--border)]'
        }`}
      >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`} />
      </div>
      {label && <span className="text-sm text-[var(--text2)]">{label}</span>}
    </label>
  );
}

// ── StepIndicator ────────────────────────────────────────────────────────────────────────
interface StepIndicatorProps { steps: string[]; current: number; }
export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0 w-full mb-8">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className={[
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-200',
                done  ? 'bg-brand-500 border-brand-500 text-white' : '',
                active ? 'bg-[var(--surface)] border-brand-500 text-brand-400' : '',
                !done && !active ? 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)]' : '',
              ].join(' ')}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${active ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px flex-1 mx-2 mb-4 transition-colors duration-200 ${done ? 'bg-brand-500' : 'bg-[var(--border)]'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Alert / Banner ────────────────────────────────────────────────────────────────────────
interface AlertProps { type?: 'success' | 'error' | 'info'; message: string; onClose?: () => void; action?: React.ReactNode; }
export function Alert({ type = 'info', message, onClose, action }: AlertProps) {
  const styles = {
    success: { wrap: 'bg-brand-950/50 border-brand-800/40', text: 'text-brand-300', accent: 'bg-brand-500' },
    error:   { wrap: 'bg-red-950/40 border-red-900/40',     text: 'text-red-300',   accent: 'bg-red-500'   },
    info:    { wrap: 'bg-blue-950/40 border-blue-900/40',   text: 'text-blue-300',  accent: 'bg-blue-500'  },
  };
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const st = styles[type];
  return (
    <div className={`relative flex items-center justify-between gap-3 border rounded-lg px-4 py-3 text-sm overflow-hidden ${st.wrap}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${st.accent}`} />
      <div className={`flex items-center gap-2.5 pl-2 ${st.text}`}>
        <span className="shrink-0 text-xs font-bold opacity-70">{icons[type]}</span>
        <span className="leading-snug">{message}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {action}
        {onClose && (
          <button onClick={onClose} className={`opacity-50 hover:opacity-100 text-lg leading-none transition-opacity ${st.text}`}>×</button>
        )}
      </div>
    </div>
  );
}
