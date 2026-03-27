import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { Button, Spinner } from './ui';

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  label?: string;
}

export function PhilosophyEnhancer({ value, onChange, rows = 7, placeholder, label = 'Coaching philosophy' }: Props) {
  const [enhancing, setEnhancing] = useState(false);
  const [enhanced, setEnhanced] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleEnhance = async () => {
    if (!value.trim() || value.trim().length < 10) {
      setError('Write at least a sentence or two first.');
      return;
    }
    setError('');
    setEnhancing(true);
    try {
      const result = await apiFetch('/api/coach/enhance-philosophy', {
        method: 'POST',
        body: JSON.stringify({ philosophy: value }),
      });
      setEnhanced(result.enhanced);
    } catch (e: any) {
      setError(e.message || 'Enhancement failed. Try again.');
    } finally {
      setEnhancing(false);
    }
  };

  const acceptEnhanced = () => {
    onChange(enhanced!);
    setEnhanced(null);
  };

  const dismissEnhanced = () => {
    setEnhanced(null);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Label */}
      <label className="text-xs font-medium text-[var(--text2)] uppercase tracking-wide">
        {label}
      </label>

      {/* Textarea — hidden during preview so layout doesn't jump */}
      {!enhanced && (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className={[
            'bg-[var(--surface2)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)]',
            'placeholder-[var(--muted2)] transition-all duration-150 resize-vertical leading-relaxed',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500/50',
            'border border-[var(--border)]',
          ].join(' ')}
        />
      )}

      {/* Enhance button row */}
      {!enhanced && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleEnhance}
            disabled={enhancing || value.trim().length < 10}
            loading={enhancing}
          >
            {enhancing ? 'Enhancing…' : '✨ Enhance with AI'}
          </Button>
          {enhancing && (
            <span className="text-xs text-[var(--muted)]">Rewriting your philosophy for better AI plans…</span>
          )}
          {error && (
            <span className="text-xs text-red-400">{error}</span>
          )}
        </div>
      )}

      {/* Side-by-side preview */}
      {enhanced && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Original */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Your version</span>
              </div>
              <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text2)] leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-72">
                {value}
              </div>
            </div>

            {/* Enhanced */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-brand-400 uppercase tracking-wide">AI Enhanced</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-brand-900/50 text-brand-400 border border-brand-800/50">✨ New</span>
              </div>
              <div className="bg-[var(--surface2)] border border-brand-700/40 rounded-lg px-3 py-2.5 text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-72 ring-1 ring-brand-600/20">
                {enhanced}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-1">
            <Button type="button" variant="primary" size="sm" onClick={acceptEnhanced}>
              Use Enhanced Version
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={dismissEnhanced}>
              Keep Original
            </Button>
            <span className="text-xs text-[var(--muted)] ml-auto">
              You can edit the text after applying.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
