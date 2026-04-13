import { useState, useEffect } from 'react';
import { Download, X, Share2 } from 'lucide-react';

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

// Opens the native iOS share sheet — user can then tap "Add to Home Screen"
async function iosShare() {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Laktic — Train Smarter',
        url: window.location.origin,
      });
    } catch {
      // user cancelled — ignore
    }
  }
}

// ── Dismissable banner shown once at the top of the app ──────────────────────
export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem('laktic-install-dismissed')) {
      setDismissed(true);
      return;
    }
    if (isIOS() && navigator.share) {
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
      style={{ background: 'var(--color-accent-dim)', border: '1px solid rgba(0,229,160,0.3)' }}
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
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {showIOS ? 'Add to your home screen' : 'Quick access from your home screen'}
        </p>
      </div>

      {showIOS ? (
        <button
          onClick={iosShare}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-opacity hover:opacity-80"
          style={{ background: 'var(--color-accent)', color: '#000' }}
        >
          <Share2 size={12} />
          Share
        </button>
      ) : (
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

// ── Settings page — permanent Install App card ────────────────────────────────
export function InstallAppCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const ios = isIOS();
  const canShare = ios && !!navigator.share;

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

        ) : canShare ? (
          // iOS — tap Share button to open native share sheet → Add to Home Screen
          <div>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              Add Laktic to your iPhone home screen. Tap the button below, then select <strong style={{ color: 'var(--color-text-primary)' }}>"Add to Home Screen"</strong>.
            </p>
            <button
              onClick={iosShare}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-85"
              style={{ background: 'var(--color-accent)', color: '#000' }}
            >
              <Share2 size={15} />
              Open Share Menu
            </button>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
              Then tap "Add to Home Screen" → "Add"
            </p>
          </div>

        ) : deferredPrompt ? (
          // Android / Chrome
          <div>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              Install Laktic directly to your home screen. Opens like a native app — no App Store needed.
            </p>
            <button
              onClick={install}
              disabled={installing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-85"
              style={{ background: 'var(--color-accent)', color: '#000' }}
            >
              <Download size={15} />
              {installing ? 'Installing…' : 'Install App'}
            </button>
          </div>

        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Open Laktic on your mobile browser to install it to your home screen.
          </p>
        )}
      </div>
    </div>
  );
}
