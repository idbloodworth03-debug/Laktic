import React, { useState } from 'react';

// ── Button ──────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}
export function Button({ variant = 'primary', loading, size = 'md', children, disabled, className = '', ...rest }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed font-sans';
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };
  const variants = {
    primary: 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm shadow-brand-900',
    secondary: 'bg-dark-600 hover:bg-dark-500 text-[var(--text)] border border-[var(--border)]',
    ghost: 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-dark-700',
    danger: 'bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-900/50'
  };
  return (
    <button disabled={disabled || loading} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
export function Input({ label, error, className = '', ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-[var(--muted)]">{label}</label>}
      <input
        className={`bg-dark-700 border ${error ? 'border-red-500' : 'border-[var(--border)]'} rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-brand-500 transition-colors ${className}`}
        {...rest}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

// ── Textarea ─────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}
export function Textarea({ label, error, className = '', ...rest }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-[var(--muted)]">{label}</label>}
      <textarea
        className={`bg-dark-700 border ${error ? 'border-red-500' : 'border-[var(--border)]'} rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-brand-500 transition-colors resize-vertical ${className}`}
        {...rest}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
interface CardProps { title?: string; children: React.ReactNode; className?: string; }
export function Card({ title, children, className = '' }: CardProps) {
  return (
    <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 ${className}`}>
      {title && <h3 className="font-display text-base font-semibold mb-4 text-[var(--text)]">{title}</h3>}
      {children}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
interface BadgeProps { label: string; color?: 'green' | 'blue' | 'amber' | 'purple' | 'gray'; }
export function Badge({ label, color = 'green' }: BadgeProps) {
  const colors = {
    green: 'bg-brand-900/60 text-brand-400 border-brand-700/30',
    blue: 'bg-blue-900/40 text-blue-400 border-blue-800/30',
    amber: 'bg-amber-900/40 text-amber-400 border-amber-800/30',
    purple: 'bg-purple-900/40 text-purple-400 border-purple-800/30',
    gray: 'bg-dark-600 text-[var(--muted)] border-[var(--border)]'
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${colors[color]}`}>
      {label}
    </span>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-3 h-3', md: 'w-5 h-5', lg: 'w-8 h-8' };
  return (
    <div className={`${s[size]} border-2 border-[var(--border)] border-t-brand-500 rounded-full animate-spin`} />
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
interface NavbarProps { role?: string; name?: string; onLogout?: () => void; }
export function Navbar({ role, name, onLogout }: NavbarProps) {
  return (
    <nav className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <span className="font-display font-bold text-xl text-brand-400 tracking-tight">LAKTIC</span>
        {role && <Badge label={role} color={role === 'coach' ? 'blue' : 'green'} />}
      </div>
      {name && (
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--muted)]">{name}</span>
          <Button variant="ghost" size="sm" onClick={onLogout}>Sign out</Button>
        </div>
      )}
    </nav>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
interface EmptyStateProps { title: string; message: string; action?: React.ReactNode; }
export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="w-12 h-12 rounded-full bg-dark-700 border border-[var(--border)] flex items-center justify-center text-2xl">◎</div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="text-sm text-[var(--muted)] max-w-sm">{message}</p>
      {action}
    </div>
  );
}

// ── ChatBubble ────────────────────────────────────────────────────────────────
interface ChatBubbleProps { role: 'athlete' | 'bot'; content: string; planUpdated?: boolean; }
export function ChatBubble({ role, content, planUpdated }: ChatBubbleProps) {
  const isBot = role === 'bot';
  return (
    <div className={`flex ${isBot ? 'justify-start' : 'justify-end'} mb-4`}>
      <div className={`max-w-[80%] ${isBot ? '' : 'items-end flex flex-col'}`}>
        {isBot && <div className="text-xs text-[var(--muted)] mb-1 font-medium">Coach Bot</div>}
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isBot
            ? 'bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] rounded-tl-sm'
            : 'bg-brand-600 text-white rounded-tr-sm'
        }`}>
          {content}
        </div>
        {planUpdated && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-brand-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 inline-block" />
            Plan updated
          </span>
        )}
      </div>
    </div>
  );
}

// ── DocumentCard ──────────────────────────────────────────────────────────────
interface DocumentCardProps {
  id: string; title: string; document_type: string; created_at: string;
  onEdit: (id: string) => void; onDelete: (id: string) => void;
}
const DOC_COLORS: Record<string, any> = {
  philosophy: 'purple', sample_week: 'green', training_block: 'blue',
  taper: 'amber', injury_rule: 'amber', faq: 'gray', notes: 'gray'
};
export function DocumentCard({ id, title, document_type, created_at, onEdit, onDelete }: DocumentCardProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center justify-between bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <Badge label={document_type.replace('_', ' ')} color={DOC_COLORS[document_type] || 'gray'} />
        <span className="text-sm font-medium truncate">{title}</span>
        <span className="text-xs text-[var(--muted)] shrink-0">{new Date(created_at).toLocaleDateString()}</span>
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => onEdit(id)}>Edit</Button>
        {confirming
          ? <Button variant="danger" size="sm" onClick={() => { onDelete(id); setConfirming(false); }}>Confirm</Button>
          : <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} className="text-red-400 hover:text-red-300">Delete</Button>
        }
      </div>
    </div>
  );
}

// ── TypingIndicator ───────────────────────────────────────────────────────────
export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--muted)]"
            style={{ animation: `pulse-dot 1.4s ${i * 0.2}s ease-in-out infinite` }} />
        ))}
      </div>
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; options: { value: string; label: string }[];
}
export function Select({ label, options, className = '', ...rest }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-[var(--muted)]">{label}</label>}
      <select
        className={`bg-dark-700 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-brand-500 transition-colors ${className}`}
        {...rest}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
interface ToggleProps { checked: boolean; onChange: (v: boolean) => void; label?: string; }
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors duration-200 relative ${checked ? 'bg-brand-500' : 'bg-dark-600 border border-[var(--border)]'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`} />
      </div>
      {label && <span className="text-xs text-[var(--muted)]">{label}</span>}
    </label>
  );
}

// ── Alert / Banner ────────────────────────────────────────────────────────────
interface AlertProps { type?: 'success' | 'error' | 'info'; message: string; onClose?: () => void; action?: React.ReactNode; }
export function Alert({ type = 'info', message, onClose, action }: AlertProps) {
  const styles = {
    success: 'bg-brand-900/40 border-brand-700/40 text-brand-400',
    error: 'bg-red-900/30 border-red-800/40 text-red-400',
    info: 'bg-blue-900/30 border-blue-800/40 text-blue-400'
  };
  return (
    <div className={`flex items-center justify-between gap-3 border rounded-lg px-4 py-3 text-sm ${styles[type]}`}>
      <span>{message}</span>
      <div className="flex items-center gap-2 shrink-0">
        {action}
        {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100 text-lg leading-none">×</button>}
      </div>
    </div>
  );
}
