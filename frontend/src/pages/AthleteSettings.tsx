import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
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
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [stravaStatus, setStravaStatus] = useState<StravaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    fetchStravaStatus();
    if (searchParams.get('strava') === 'connected') {
      setAlert({ type: 'success', message: 'Strava connected successfully! Syncing your recent activities...' });
      // Auto-trigger initial sync after connecting
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

  async function downloadData() {
    try {
      const data = await apiFetch('/api/athlete/data-export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'laktic-athlete-data.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message || 'Export failed.' });
    }
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    try {
      await apiFetch('/api/athlete/account', { method: 'DELETE' });
      await supabase.auth.signOut();
      clearAuth();
      nav('/');
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message || 'Failed to delete account.' });
      setDeletingAccount(false);
      setDeleteConfirm(false);
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
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-6">Settings</h1>

        {alert && (
          <div className="mb-6">
            <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
          </div>
        )}

        <Card title="Data & Privacy" className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-[var(--muted)] mb-3">
                Download a copy of all your Laktic data including your profile, training plan, activities, and chat history.
              </p>
              <Button variant="secondary" size="sm" onClick={downloadData}>Download my data</Button>
            </div>
            <div className="pt-4 border-t border-[var(--border)]">
              <p className="text-sm font-medium mb-1">Delete account</p>
              <p className="text-sm text-[var(--muted)] mb-3">
                Permanently deletes your account and all associated data. This cannot be undone.
              </p>
              {deleteConfirm ? (
                <div className="flex items-center gap-2">
                  <Button variant="danger" size="sm" loading={deletingAccount} onClick={deleteAccount}>
                    Yes, delete my account
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(true)}>Delete account</Button>
              )}
            </div>
          </div>
        </Card>

        <Card title="Strava Integration">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : stravaStatus?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge label="Connected" color="green" />
                <span className="text-sm text-[var(--muted)]">
                  Strava Athlete #{stravaStatus.strava_athlete_id}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[var(--muted)]">Connected</span>
                  <p className="text-[var(--text)]">
                    {stravaStatus.connected_at
                      ? new Date(stravaStatus.connected_at).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Last sync</span>
                  <p className="text-[var(--text)]">
                    {stravaStatus.last_sync_at
                      ? new Date(stravaStatus.last_sync_at).toLocaleString()
                      : 'Never'}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
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
              <p className="text-sm text-[var(--muted)]">
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
