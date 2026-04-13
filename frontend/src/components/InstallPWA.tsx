import { useState, useEffect } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';

// Detects iOS Safari
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

// Detects if already installed as standalone PWA
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

// ── Banner shown at top of app once ──────────────────────────────────────────
export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed or already dismissed
    if (isStandalone() || localStorage.getItem('laktic-install-dismissed')) {
      setDismissed(true);
      return;
    }
    if (isIOS()) {
      setShowIOS(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler as any);
    return () => window.removeEventListener('beforeinstallprompt', handler as any);
  }, []);

  const dismiss = () => {
    localStorage.setItem('laktic-install-dismissed', '1');
    setDismissed(true);
    setShowIOS(false);
    setDeferredPrompt(null);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    setDeferredPrompt(null);
  };

  if (dismissed || (!deferredPrompt && !showIOS)) return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 mx-4 mt-4 rounded-xl"
      style={{
        background: 'var(--color-accent-dim)',
        border: '1px solid rgba(0,229,160,0.3)',
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'var(--color-accent)', color: '#000' }}
      >
        <Download size={14} strokeWidth={2.5} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Install Laktic
        </p>
        {showIOS ? (
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Tap <Share size={11} className="inline mx-0.5" /> then <strong>Add to Home Screen</strong>
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Add to your home screen for quick access
          </p>
        )}
      </div>

      {!showIOS && (
        <button
          onClick={install}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-opacity hover:opacity-80"
          style={{ background: 'var(--color-accent)', color: '#000' }}
        >
          Install
        </button>
      )}

      <button onClick={dismiss} className="shrink-0 transition-opacity hover:opacity-60" style={{ color: 'var(--color-text-tertiary)' }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ── Settings card — permanent install button ──────────────────────────────────
export function InstallAppCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return; }
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler as any);
    return () => window.removeEventListener('beforeinstallprompt', handler as any);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
    setInstalling(false);
  };

  return (
    <div className="flex items-start gap-4">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'var(--color-accent-dim)', border: '1px solid rgba(0,229,160,0.25)' }}
      >
        <Download size={18} style={{ color: 'var(--color-accent)' }} />
      </div>

      <div className="flex-1">
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Install Laktic App
        </p>

        {installed ? (
          <p className="text-sm" style={{ color: 'var(--color-accent)' }}>
            ✓ Already installed on your device
          </p>
        ) : ios ? (
          <div>
            <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Add Laktic to your iPhone home screen for fast access — no App Store needed.
            </p>
            <div
              className="rounded-lg p-3 text-xs space-y-2"
              style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                <span
                  className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                  style={{ background: 'var(--color-accent)', color: '#000' }}
                >
                  1
                </span>
                Tap the <Share size={12} className="inline mx-1" style={{ color: 'var(--color-accent)' }} /> Share button in Safari
              </div>
              <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                <span
                  className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                  style={{ background: 'var(--color-accent)', color: '#000' }}
                >
                  2
                </span>
                <span>Scroll down and tap <strong style={{ color: 'var(--color-text-primary)' }}>Add to Home Screen</strong></span>
              </div>
              <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                <span
                  className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                  style={{ background: 'var(--color-accent)', color: '#000' }}
                >
                  3
                </span>
                Tap <strong style={{ color: 'var(--color-text-primary)' }}>Add</strong> — Laktic is now on your home screen
              </div>
            </div>
          </div>
        ) : deferredPrompt ? (
          <div>
            <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Install Laktic directly to your home screen. Works offline and opens like a native app.
            </p>
            <button
              onClick={install}
              disabled={installing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-85"
              style={{ background: 'var(--color-accent)', color: '#000' }}
            >
              <Download size={14} />
              {installing ? 'Installing…' : 'Install App'}
            </button>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Open Laktic in your mobile browser to install it to your home screen.
          </p>
        )}
      </div>
    </div>
  );
}
