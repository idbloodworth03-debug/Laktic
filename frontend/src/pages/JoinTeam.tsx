import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Input, Alert, Spinner } from '../components/ui';

export function JoinTeam() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ teamName: string; botId?: string } | null>(null);

  const logout = async () => {
    await supabase.auth.signOut();
    clearAuth();
    nav('/');
  };

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
      setSuccess({
        teamName: result.team.name,
        botId: result.defaultBot?.id
      });

      setTimeout(() => {
        if (result.defaultBot?.id) {
          nav(`/athlete/bots/${result.defaultBot.id}`);
        } else {
          nav('/athlete/browse');
        }
      }, 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to join team.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />

      <div className="max-w-md mx-auto px-6 py-16">
        <div className="text-center mb-8 fade-up">
          <h1 className="font-display text-2xl font-bold text-[var(--text)] mb-2">Join a Team</h1>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            Enter the invite code your coach shared with you.
          </p>
        </div>

        <Card className="fade-up-1">
          {success ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-14 h-14 rounded-full bg-brand-950/50 border border-brand-800/50 flex items-center justify-center shadow-glow-sm">
                <span className="text-brand-400 text-2xl">✓</span>
              </div>
              <div className="text-center">
                <h3 className="font-display font-semibold text-lg text-[var(--text)]">Welcome to {success.teamName}!</h3>
                <p className="text-sm text-[var(--muted)] mt-1.5 leading-relaxed">
                  {success.botId
                    ? "Redirecting you to your team's coaching bot..."
                    : 'Redirecting you to browse available bots...'}
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
                style={{ textTransform: 'uppercase', letterSpacing: '0.2em', textAlign: 'center', fontSize: '1.1rem', fontFamily: 'JetBrains Mono, monospace' }}
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

              <p className="text-xs text-[var(--muted)] text-center">
                Don't have a code? Ask your coach for an invite link.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
