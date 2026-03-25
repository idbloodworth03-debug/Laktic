import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Navbar, Card, Button, Badge, Spinner, Alert } from '../components/ui';

interface StravaStatus {
  connected: boolean;
  strava_athlete_id?: number;
  connected_at?: string;
  last_sync_at?: string;
  scope?: string;
}

export function AthleteSettings() {
  const { role, profile, clearAuth } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [stravaStatus, setStravaStatus] = useState<StravaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    fetchStravaStatus();
    if (searchParams.get('strava') === 'connected') {
      setAlert({ type: 'success', message: 'Strava connected successfully! Syncing your recent activities...' });
      triggerSync();
    }
  }, []);

  async function fetchStravaStatus() {
    try {
      const data = await apiFetch('/api/athlete/strava');
      setStravaStatus(data);
    } catch {
      setStravaStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }

  async function connectStrava() {
    try {
      const data = await apiFetch('/api/strava/auth');
      window.location.href = data.url;
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message || 'Failed to start Strava connection' });
    }
  }

  async function triggerSync() {
    setSyncing(true);
    try {
      const data = await apiFetch('/api/athlete/strava/sync', {
        method: 'POST',
        body: JSON.stringify({ days: 30 })
      });
      setAlert({ type: 'success', message: data.message });
      fetchStravaStatus();
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message || 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectStrava() {
    setDisconnecting(true);
    try {
      await apiFetch('/api/athlete/strava', { method: 'DELETE' });
      setStravaStatus({ connected: false });
      setAlert({ type: 'info', message: 'Strava disconnected' });
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message || 'Failed to disconnect' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role={role || undefined} name={profile?.name} onLogout={clearAuth} />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="font-display text-2xl font-bold text-[var(--text)] mb-6 fade-up">Settings</h1>

        {alert && (
          <div className="mb-5">
            <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
          </div>
        )}

        <Card title="Strava Integration" className="fade-up-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : stravaStatus?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge label="Connected" color="green" dot />
                <span className="text-sm text-[var(--muted)]">
                  Strava Athlete #{stravaStatus.strava_athlete_id}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-[var(--surface2)] rounded-xl p-4 border border-[var(--border)]">
                <div>
                  <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mb-1">Connected</div>
                  <p className="text-sm text-[var(--text)] font-medium">
                    {stravaStatus.connected_at
                      ? new Date(stravaStatus.connected_at).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mb-1">Last sync</div>
                  <p className="text-sm text-[var(--text)] font-medium">
                    {stravaStatus.last_sync_at
                      ? new Date(stravaStatus.last_sync_at).toLocaleString()
                      : 'Never'}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <Button onClick={triggerSync} loading={syncing} size="sm">
                  Sync Activities
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={disconnectStrava}
                  loading={disconnecting}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                Connect your Strava account to automatically sync your running activities,
                including pace, distance, heart rate, and elevation data.
              </p>
              <Button onClick={connectStrava}>
                Connect Strava
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
