import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  LayoutDashboard, Users, FileText, MessageSquare, TrendingUp, User,
  ChevronLeft, ChevronRight, Settings, LogOut, Activity,
  Calendar, ShoppingBag, Award, BarChart2, BookOpen, Shield, RefreshCw,
  Menu, X, Utensils, Globe, Store, Sun, Moon, Home, Footprints,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { InstallBanner } from './InstallPWA';

// ── Button ─────────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}
export function Button({ variant = 'primary', loading, size = 'md', children, disabled, className = '', ...rest }: ButtonProps) {
  const base = [
    'inline-flex items-center justify-center gap-2 font-sans font-semibold rounded-btn',
    'transition-all duration-150 select-none cursor-pointer',
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
    'active:scale-[0.97]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg-primary)]',
  ].join(' ');
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm', xl: 'px-6 py-3 text-base' };
  const variants = {
    primary:   'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-black focus-visible:ring-[var(--color-accent)]/40',
    secondary: 'bg-transparent border border-[var(--color-border-light)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus-visible:ring-[var(--color-border-light)]',
    ghost:     'bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] focus-visible:ring-[var(--color-border)]',
    danger:    'bg-[var(--color-danger)] hover:brightness-110 text-white focus-visible:ring-[var(--color-danger)]/40',
  };
  return (
    <button disabled={disabled || loading} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

// ── Input ──────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; hint?: string; }
export function Input({ label, error, hint, className = '', ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">{label}</label>}
      <input className={['bg-[var(--color-bg-tertiary)] border rounded-btn px-[14px] py-[10px] text-sm', 'font-sans text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)]', 'outline-none transition-all duration-150', error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-dim)]', className].join(' ')} {...rest} />
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
      {!error && hint && <span className="text-xs text-[var(--color-text-tertiary)]">{hint}</span>}
    </div>
  );
}

// ── Textarea ───────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; error?: string; }
export function Textarea({ label, error, className = '', ...rest }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">{label}</label>}
      <textarea className={['bg-[var(--color-bg-tertiary)] border rounded-btn px-[14px] py-[10px] text-sm', 'font-sans text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)]', 'outline-none transition-all duration-150 resize-vertical leading-relaxed', error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-dim)]', className].join(' ')} {...rest} />
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────
interface CardProps { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode; }
export function Card({ title, children, className = '', action }: CardProps) {
  return (
    <div className={`bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card transition-all duration-150 hover:border-[var(--color-border-light)] ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">{title}</p>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── StatCard ───────────────────────────────────────────────────────────────────
interface StatCardProps { label: string; value: string | number; sub?: string; accent?: boolean; }
export function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 shadow-card">
      <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">{label}</p>
      <p className={`font-mono text-3xl font-medium leading-none ${accent ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--color-text-tertiary)] mt-2">{sub}</p>}
    </div>
  );
}

// ── Badge ──────────────────────────────────────────────────────────────────────
interface BadgeProps { label: string; color?: 'green' | 'blue' | 'amber' | 'purple' | 'gray' | 'red'; dot?: boolean; }
export function Badge({ label, color = 'green', dot = false }: BadgeProps) {
  const colors = {
    green:  'bg-[var(--color-accent-dim)] text-[var(--color-accent)] border-[var(--color-accent)]/20',
    blue:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
    amber:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    gray:   'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] border-[var(--color-border)]',
    red:    'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const dots = { green: 'bg-[var(--color-accent)]', blue: 'bg-blue-400', amber: 'bg-amber-400', purple: 'bg-purple-400', gray: 'bg-[var(--color-text-tertiary)]', red: 'bg-red-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill text-xs font-medium border ${colors[color]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dots[color]}`} />}
      {label}
    </span>
  );
}

// ── Spinner ────────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-3.5 h-3.5 border', md: 'w-5 h-5 border-2', lg: 'w-8 h-8 border-2' };
  return <div className={`${s[size]} rounded-full border-[var(--color-border-light)] border-t-[var(--color-accent)] animate-spin`} />;
}

// ── Alert ──────────────────────────────────────────────────────────────────────
interface AlertProps { type?: 'success' | 'error' | 'info'; message: string; onClose?: () => void; action?: React.ReactNode; }
export function Alert({ type = 'info', message, onClose, action }: AlertProps) {
  const styles = {
    success: { wrap: 'bg-[var(--color-accent-dim)] border-[var(--color-accent)]/20', text: 'text-[var(--color-accent)]', bar: 'bg-[var(--color-accent)]' },
    error:   { wrap: 'bg-red-500/10 border-red-500/20',   text: 'text-red-400',  bar: 'bg-[var(--color-danger)]' },
    info:    { wrap: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400', bar: 'bg-blue-500' },
  };
  const st = styles[type];
  return (
    <div className={`relative flex items-center justify-between gap-3 border rounded-btn px-4 py-3 text-sm overflow-hidden ${st.wrap}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r ${st.bar}`} />
      <span className={`pl-3 leading-snug ${st.text}`}>{message}</span>
      <div className="flex items-center gap-2 shrink-0">
        {action}
        {onClose && <button onClick={onClose} className={`opacity-50 hover:opacity-100 text-lg leading-none transition-opacity ${st.text}`}>×</button>}
      </div>
    </div>
  );
}

// ── ProgressBar ────────────────────────────────────────────────────────────────
export function ProgressBar({ value, max = 100, className = '' }: { value: number; max?: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={`h-1 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden ${className}`}>
      <div className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── ReadinessRing ──────────────────────────────────────────────────────────────
export function ReadinessRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = (size - 20) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, score)) / 100) * circ;
  const color = score >= 80 ? 'var(--color-accent)' : score >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
  const label = score >= 80 ? 'Optimal' : score >= 50 ? 'Moderate' : 'Low';
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth={8} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
            transform={`rotate(-90 ${size/2} ${size/2})`}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono font-medium leading-none" style={{ fontSize: size * 0.28, color }}>{score}</span>
        </div>
      </div>
      <span className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ── Toggle ─────────────────────────────────────────────────────────────────────
interface ToggleProps { checked: boolean; onChange: (v: boolean) => void; label?: string; }
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <div onClick={() => onChange(!checked)} className={`w-9 h-5 rounded-full transition-all duration-200 relative ${checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]'}`}>
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`} />
      </div>
      {label && <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>}
    </label>
  );
}

// ── Select ─────────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; options: { value: string; label: string }[]; }
export function Select({ label, options, className = '', ...rest }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">{label}</label>}
      <select className={`bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-btn px-[14px] py-[10px] text-sm text-[var(--color-text-primary)] outline-none transition-all duration-150 focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-dim)] cursor-pointer ${className}`} {...rest}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── StepIndicator ──────────────────────────────────────────────────────────────
interface StepIndicatorProps { steps: string[]; current: number; }
export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0 w-full mb-8">
      {steps.map((label, i) => {
        const done = i < current; const active = i === current;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className={['w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all duration-200', done ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-black' : active ? 'bg-transparent border-[var(--color-accent)] text-[var(--color-accent)]' : 'bg-transparent border-[var(--color-border)] text-[var(--color-text-tertiary)]'].join(' ')}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${active ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}>{label}</span>
            </div>
            {i < steps.length - 1 && <div className={`h-px flex-1 mx-2 mb-4 ${done ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────────
interface EmptyStateProps { title: string; message: string; action?: React.ReactNode; }
export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <div className="w-12 h-12 rounded-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] flex items-center justify-center">
        <Activity size={20} className="text-[var(--color-text-tertiary)]" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{title}</h3>
        <p className="text-sm text-[var(--color-text-tertiary)] max-w-xs leading-relaxed">{message}</p>
      </div>
      {action}
    </div>
  );
}

// ── ChatBubble ─────────────────────────────────────────────────────────────────
interface ChatBubbleProps {
  role: 'athlete' | 'bot' | 'coach';
  content: string;
  planUpdated?: boolean;
  label?: string;
  avatarUrl?: string | null;
  avatarName?: string;
}
export function ChatBubble({ role, content, planUpdated, label, avatarUrl, avatarName }: ChatBubbleProps) {
  const [imgErr, setImgErr] = React.useState(false);
  const isRight   = role === 'athlete';
  const leftLabel = label ?? (role === 'coach' ? 'Your Coach' : 'Pace');
  const initial   = ((avatarName || leftLabel || 'A').charAt(0)).toUpperCase();

  const AvatarCircle = (
    <div className="shrink-0 mt-0.5">
      {avatarUrl && !imgErr ? (
        <img src={avatarUrl} alt={avatarName || ''} onError={() => setImgErr(true)}
          className="rounded-full object-cover"
          style={{ width: 28, height: 28, border: '1.5px solid rgba(0,229,160,0.30)' }}
        />
      ) : (
        <div className="rounded-full flex items-center justify-center text-[10px] font-bold select-none"
          style={{ width: 28, height: 28, background: 'rgba(0,229,160,0.15)', border: '1.5px solid rgba(0,229,160,0.25)', color: '#00E5A0' }}>
          {initial}
        </div>
      )}
    </div>
  );

  return (
    <div className={`flex items-start gap-2 ${isRight ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isRight && AvatarCircle}
      <div className={`max-w-[78%] ${isRight ? 'items-end flex flex-col' : ''}`}>
        {!isRight && (
          <span className="text-xs text-[var(--color-text-tertiary)] font-medium mb-1.5 block">{leftLabel}</span>
        )}
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isRight ? 'bg-[var(--color-accent)] text-black font-medium rounded-tr-sm' : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-tl-sm'}`}>
          {isRight ? content : (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: 1.55 }} className="last:mb-0">{children}</p>,
                ul: ({ children }) => <ul style={{ paddingLeft: 16, margin: '4px 0 8px' }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ paddingLeft: 16, margin: '4px 0 8px' }}>{children}</ol>,
                li: ({ children }) => <li style={{ marginBottom: 4, lineHeight: 1.5 }}>{children}</li>,
                strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                em: ({ children }) => <em>{children}</em>,
              }}
            >{content}</ReactMarkdown>
          )}
        </div>
        {planUpdated && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--color-accent)] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] inline-block animate-pulse" />
            Plan updated
          </span>
        )}
      </div>
      {isRight && AvatarCircle}
    </div>
  );
}

// ── TypingIndicator ────────────────────────────────────────────────────────────
export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)]" style={{ animation: `pulse-dot 1.4s ${i * 0.2}s ease-in-out infinite` }} />
        ))}
      </div>
    </div>
  );
}

// ── DocumentCard ───────────────────────────────────────────────────────────────
interface DocumentCardProps { id: string; title: string; document_type: string; created_at: string; onEdit: (id: string) => void; onDelete: (id: string) => void; onHistory?: (id: string) => void; }
const DOC_COLORS: Record<string, any> = { philosophy: 'purple', sample_week: 'green', training_block: 'blue', taper: 'amber', injury_rule: 'amber', faq: 'gray', notes: 'gray' };
export function DocumentCard({ id, title, document_type, created_at, onEdit, onDelete, onHistory }: DocumentCardProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center justify-between bg-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-light)] rounded-card px-4 py-3 transition-all duration-150 group">
      <div className="flex items-center gap-3 min-w-0">
        <Badge label={document_type.replace('_', ' ')} color={DOC_COLORS[document_type] || 'gray'} />
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{title}</span>
        <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">{new Date(created_at).toLocaleDateString()}</span>
      </div>
      <div className="flex items-center gap-1.5 ml-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {onHistory && <Button variant="ghost" size="sm" onClick={() => onHistory(id)}>History</Button>}
        <Button variant="ghost" size="sm" onClick={() => onEdit(id)}>Edit</Button>
        {confirming ? <Button variant="danger" size="sm" onClick={() => { onDelete(id); setConfirming(false); }}>Confirm</Button> : <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} className="!text-red-400">Delete</Button>}
      </div>
    </div>
  );
}

// ── Navigation definitions ─────────────────────────────────────────────────────
type NavItem = { label: string; href: string; icon: React.ElementType };

// Primary: shown in mobile bottom bar + top of sidebar
const ATHLETE_PRIMARY: NavItem[] = [
  { label: 'Home',      href: '/athlete/dashboard', icon: Home         },
  { label: 'Pace',      href: '/athlete/chat',       icon: MessageSquare },
  { label: 'My Plan',   href: '/athlete/plan',       icon: FileText     },
  { label: 'Progress',  href: '/athlete/progress',   icon: TrendingUp   },
  { label: 'Runs',      href: '/athlete/runs',       icon: Footprints   },
];

// More: shown below a divider in sidebar + in mobile "More" drawer
const ATHLETE_MORE: NavItem[] = [
  { label: 'Community', href: '/community',          icon: Globe        },
  { label: 'Activities', href: '/athlete/activities', icon: Activity    },
  { label: 'Calendar',   href: '/athlete/calendar',   icon: Calendar    },
  { label: 'Analytics',  href: '/athlete/analytics',  icon: BarChart2   },
  { label: 'Races',      href: '/athlete/races',      icon: Award },
  { label: 'Settings',   href: '/athlete/settings',   icon: Settings },
];

const COACH_PRIMARY: NavItem[] = [
  { label: 'Home',  href: '/coach/dashboard',  icon: Home },
  { label: 'My Team',    href: '/coach/progress',   icon: Users },
  { label: 'Community',  href: '/community',        icon: Globe },
  { label: 'Calendar',   href: '/coach/calendar',   icon: Calendar },
  { label: 'Recovery',   href: '/coach/recovery',   icon: RefreshCw },
];

const COACH_MORE: NavItem[] = [
  { label: 'Analytics',     href: '/coach/readiness',     icon: TrendingUp },
  { label: 'Plans',         href: '/coach/plans',         icon: ShoppingBag },
  { label: 'Marketplace',   href: '/marketplace/plans',   icon: Store },
  { label: 'Bot Setup',     href: '/coach/bot/edit',      icon: Settings },
  { label: 'Certification', href: '/coach/certification', icon: Award },
  { label: 'Referrals',     href: '/referrals',           icon: User },
];

// Flat combined arrays for mobile bottom bar "More" drawer
const ATHLETE_NAV: NavItem[] = [...ATHLETE_PRIMARY, ...ATHLETE_MORE];
const COACH_NAV: NavItem[]   = [...COACH_PRIMARY, ...COACH_MORE];
const PRIMARY_ATHLETE = ATHLETE_PRIMARY;
const PRIMARY_COACH   = COACH_PRIMARY;

// ── SidebarAvatar ──────────────────────────────────────────────────────────────
function SidebarAvatar({ name }: { name: string }) {
  const { profile } = useAuthStore();
  const avatarUrl = (profile as any)?.avatar_url ?? null;
  const [imgErr, setImgErr] = React.useState(false);
  const initial = (name || 'A').charAt(0).toUpperCase();
  if (avatarUrl && !imgErr) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgErr(true)}
        className="w-5 h-5 rounded-full object-cover shrink-0"
        style={{ border: '1px solid rgba(0,229,160,0.30)' }}
      />
    );
  }
  return (
    <div className="w-5 h-5 rounded-full bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/20 flex items-center justify-center shrink-0">
      <span className="text-[9px] font-semibold text-[var(--color-accent)]">{initial}</span>
    </div>
  );
}

// ── ThemeToggle ────────────────────────────────────────────────────────────────
function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useThemeStore();
  const isDark = theme === 'dark';
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center gap-3 px-3 py-2.5 rounded-btn text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-all duration-150 w-full text-left mb-0.5"
    >
      {isDark ? <Sun size={15} className="shrink-0" /> : <Moon size={15} className="shrink-0" />}
      {!collapsed && <span className="text-[13px] font-medium">{isDark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}

// ── SidebarContent (shared rendering) ─────────────────────────────────────────
interface SidebarContentProps { role?: string; name?: string; onLogout?: () => void; collapsed: boolean; onToggle: () => void; }
function SidebarContent({ role, name, onLogout, collapsed, onToggle }: SidebarContentProps) {
  const current = typeof window !== 'undefined' ? window.location.pathname : '';
  const primary = role === 'athlete' ? ATHLETE_PRIMARY : role === 'coach' ? COACH_PRIMARY : [];
  const more    = role === 'athlete' ? ATHLETE_MORE    : role === 'coach' ? COACH_MORE    : [];
  const settingsHref = role === 'coach' ? '/coach/settings' : '/athlete/settings';

  const renderItem = ({ label, href, icon: Icon }: NavItem) => {
    const active = current === href || (href !== '/' && current.startsWith(href));
    return (
      <a key={href} href={href} title={collapsed ? label : undefined}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-btn mb-0.5 transition-all duration-150 ${active ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'}`}
      >
        <Icon size={15} className="shrink-0" />
        {!collapsed && <span className="text-[13px] font-medium truncate">{label}</span>}
      </a>
    );
  };

  return (
    <>
      {/* Wordmark + collapse */}
      <div className={`flex items-center border-b border-[var(--color-border)] py-5 ${collapsed ? 'px-4 justify-center' : 'px-5 justify-between'}`}>
        {!collapsed && (
          <span
            onClick={() => { window.location.href = role === 'coach' ? '/coach/dashboard' : '/athlete/dashboard'; }}
            style={{ cursor: 'pointer' }}
            className="font-sans font-semibold text-[15px] tracking-tight text-gradient"
          >
            LAKTIC
          </span>
        )}
        <button onClick={onToggle} className="w-7 h-7 flex items-center justify-center rounded-btn text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-all duration-150">
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {primary.map(renderItem)}
        {more.length > 0 && (
          <>
            {!collapsed
              ? <p className="text-[10px] font-semibold uppercase tracking-wider px-3 mt-3 mb-1" style={{ color: 'var(--color-text-tertiary)', opacity: 0.45 }}>More</p>
              : <div className="h-px mx-3 my-2" style={{ background: 'var(--color-border)' }} />
            }
            {more.map(renderItem)}
          </>
        )}
      </nav>

      {/* Profile + logout */}
      <div className="border-t border-[var(--color-border)] p-2">
        <a href={settingsHref} title={collapsed ? name : undefined}
          className="flex items-center gap-3 px-3 py-2.5 rounded-btn text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-all duration-150 mb-0.5"
        >
          <SidebarAvatar name={name || ''} />
          {!collapsed && <span className="text-[13px] font-medium truncate flex-1">{name}</span>}
          {!collapsed && <Settings size={12} className="shrink-0 opacity-50" />}
        </a>
        <ThemeToggle collapsed={collapsed} />
        <button onClick={onLogout} title={collapsed ? 'Sign out' : undefined}
          className="flex items-center gap-3 px-3 py-2.5 rounded-btn text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-red-500/5 transition-all duration-150 w-full text-left"
        >
          <LogOut size={15} className="shrink-0" />
          {!collapsed && <span className="text-[13px] font-medium">Sign out</span>}
        </button>
        {!collapsed && (
          <a
            href="/privacy"
            className="block text-center text-[11px] mt-1 hover:underline"
            style={{ color: 'var(--color-text-tertiary)', opacity: 0.5 }}
          >
            Privacy Policy
          </a>
        )}
      </div>
    </>
  );
}

// ── BottomTabBar ───────────────────────────────────────────────────────────────
interface BottomTabBarProps { role?: string; onLogout?: () => void; }
function BottomTabBar({ role, onLogout }: BottomTabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const current = typeof window !== 'undefined' ? window.location.pathname : '';
  const nav = role === 'athlete' ? ATHLETE_NAV : role === 'coach' ? COACH_NAV : [];
  const primary = role === 'athlete' ? PRIMARY_ATHLETE : PRIMARY_COACH;

  return (
    <>
      <nav className="bottom-tab-bar">
        {primary.map(({ label, href, icon: Icon }) => {
          const active = current === href || (href !== '/' && current.startsWith(href));
          return (
            <a key={href} href={href} className={`flex flex-col items-center justify-center flex-1 gap-1 transition-all duration-150 ${active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)]'}`}>
              <Icon size={18} />
              <span className="text-[9px] font-semibold uppercase tracking-wide">{label}</span>
            </a>
          );
        })}
        <button onClick={() => setMoreOpen(o => !o)} className="flex flex-col items-center justify-center flex-1 gap-1 text-[var(--color-text-tertiary)]">
          <Menu size={18} />
          <span className="text-[9px] font-semibold uppercase tracking-wide">More</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 md:hidden" onClick={() => setMoreOpen(false)} />
          <div className="fixed bottom-16 left-0 right-0 z-50 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border)] max-h-72 overflow-y-auto md:hidden">
            {nav.slice(primary.length).map(({ label, href, icon: Icon }) => (
              <a key={href} href={href} onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 px-5 py-3.5 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors border-b border-[var(--color-border)] last:border-0"
              >
                <Icon size={15} /> {label}
              </a>
            ))}
            <button onClick={() => { setMoreOpen(false); onLogout?.(); }}
              className="flex items-center gap-3 px-5 py-3.5 text-[13px] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] w-full border-b border-[var(--color-border)]"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      )}
    </>
  );
}

// ── AppLayout ──────────────────────────────────────────────────────────────────
// Use this for all authenticated pages. Sticky sidebar + flex layout.
interface AppLayoutProps { role?: string; name?: string; onLogout?: () => void; children: React.ReactNode; }
export function AppLayout({ role, name, onLogout, children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="app-layout-wrap bg-[var(--color-bg-primary)]">
      <div className={`app-sidebar-sticky ${collapsed ? 'collapsed' : ''}`}>
        <SidebarContent role={role} name={name} onLogout={onLogout} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      </div>
      <main className="app-layout-main">
        <InstallBanner />
        {children}
      </main>
      <BottomTabBar role={role} onLogout={onLogout} />
    </div>
  );
}

// ── Navbar (backward compat — renders fixed sidebar + body offset class) ───────
// Legacy pages that use <Navbar> still work visually via CSS body class.
interface NavbarProps { role?: string; name?: string; onLogout?: () => void; }
export function Navbar({ role, name, onLogout }: NavbarProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.body.classList.add('with-sidebar');
    return () => { document.body.classList.remove('with-sidebar'); };
  }, []);

  return (
    <>
      <div className={`app-sidebar-fixed ${collapsed ? '' : ''}`} style={{ width: collapsed ? 64 : 220 }}>
        <SidebarContent role={role} name={name} onLogout={onLogout} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      </div>
      <BottomTabBar role={role} onLogout={onLogout} />
    </>
  );
}
