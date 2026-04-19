import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { AppLayout, Button, Card, Input, Alert, Spinner } from '../components/ui';

export function JoinTeam() {
  const { profile, logout } = useAuthStore();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ teamName: string; botId?: string } | null>(null);

  const handleLogout = async () => { await logout(); nav('/'); };

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter an invite code.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const result = await apiFetch(`/api/athlete/join/${trimmed}`, { method: 'POST' });
      const botId = result.defaultBot?.id ?? null;
      setSuccess({ teamName: result.team.name, botId });

      setTimeout(() => {
        if (botId) {
          nav(`/athlete/bots/${botId}`);
        } else {
          nav('/athlete/bots');
        }
      }, 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to join team.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={handleLogout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-md mx-auto px-6 py-16">
          <div className="text-center mb-8 fade-up">
            <h1 className="text-2xl font-bold mb-2">Join a Team</h1>
            <p className="text-sm text-[var(--color-text-tertiary)]">
              Enter the invite code your coach shared with you.
            </p>
          </div>

          <Card className="fade-up-1">
            {success ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--color-accent-dim)', border: '1px solid rgba(0,229,160,0.3)' }}
                >
                  <span className="text-xl font-bold" style={{ color: 'var(--color-accent)' }}>&#10003;</span>
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-lg">Welcome to {success.teamName}!</h3>
                  <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
                    {success.botId
                      ? "Your coach's training bot is ready — subscribe to get your season plan."
                      : "You've joined the team! Browse your coach's bots to get started."}
                  </p>
                </div>
                <Spinner size="sm" />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Input
                  label="Invite Code"
                  placeholder="e.g. AB3XK9QZ"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', fontSize: '1.1rem' }}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                />

                {error && <Alert type="error" message={error} onClose={() => setError('')} />}

                <Button
                  onClick={handleJoin}
                  loading={loading}
                  disabled={!code.trim()}
                  variant="primary"
                  size="lg"
                  className="w-full"
                >
                  Join Team
                </Button>

                <p className="text-xs text-[var(--color-text-tertiary)] text-center">
                  Don't have a code? Ask your coach for an invite link.
                </p>

                <div className="pt-1 border-t border-[var(--color-border)] text-center">
                  <button
                    onClick={() => nav('/athlete/races')}
                    className="text-xs transition-colors"
                    style={{ color: 'var(--color-text-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                  >
                    Skip for now — set up your race calendar
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
