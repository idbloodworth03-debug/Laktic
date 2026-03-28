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

      // Redirect to race calendar after joining so athlete sets upcoming races
      setTimeout(() => nav('/athlete/races'), 2000);
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
          <h1 className="font-display text-2xl font-bold mb-2">Join a Team</h1>
          <p className="text-sm text-[var(--muted)]">
            Enter the invite code your coach shared with you.
          </p>
        </div>

        <Card className="fade-up-1">
          {success ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-12 h-12 rounded-full bg-brand-900/40 border border-brand-700/30 flex items-center justify-center">
                <span className="text-brand-400 text-xl">&#10003;</span>
              </div>
              <div className="text-center">
                <h3 className="font-display font-semibold text-lg">Welcome to {success.teamName}!</h3>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Next up: add your upcoming races so we can build your plan.
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

              <p className="text-xs text-[var(--muted)] text-center">
                Don't have a code? Ask your coach for an invite link.
              </p>

              <div className="pt-1 border-t border-[var(--border)] text-center">
                <button
                  onClick={() => nav('/athlete/races')}
                  className="text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  Skip for now — set up your race calendar →
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
