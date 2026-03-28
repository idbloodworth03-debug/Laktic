import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Card, Button, Badge, Spinner, Alert, Input } from '../components/ui';
import { useNotifications } from '../hooks/useNotifications';

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
  const { state: notifState, enable: enableNotifs, disable: disableNotifs } = useNotifications();
  const [notifLoading, setNotifLoading] = useState(false);

  // Join team state
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');

  // GDPR state
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [stravaStatus, setStravaStatus] = useState<StravaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Public profile state
  const [username, setUsername] = useState((profile as any)?.username ?? '');
  const [publicSections, setPublicSections] = useState<{ races: boolean; stats: boolean; milestones: boolean }>(
    (profile as any)?.public_sections ?? { races: true, stats: true, milestones: true }
  );
  const [savingProfile, setSavingProfile] = useState(false);

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

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;
    setJoinError(''); setJoinSuccess(''); setJoining(true);
    try {
      const result = await apiFetch(`/api/athlete/join/${code}`, { method: 'POST' });
      setJoinSuccess(`Joined ${result.team.name}!`);
      setInviteCode('');
      setTimeout(() => {
        if (result.defaultBot?.id) nav(`/athlete/bots/${result.defaultBot.id}`);
        else nav('/athlete/browse');
      }, 1500);
    } catch (e: any) {
      setJoinError(e.message || 'Invalid invite code.');
    } finally {
      setJoining(false);
    }
  };

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
    <AppLayout role={role || undefined} name={profile?.name} onLogout={clearAuth}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="font-display text-3xl font-bold mb-6">Settings</h1>

        {alert && (
          <div className="mb-6">
            <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
          </div>
        )}

        <Card title="Public Profile" className="mb-6">
          <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
            Set a username to get a public profile at <strong className="text-[var(--color-text-primary)]">laktic.com/athlete/[username]</strong>
          </p>
          <div className="flex flex-col gap-4">
            <Input
              label="Username"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="e.g. janedoe_runs"
              maxLength={20}
            />
            <div>
              <p className="text-sm font-medium text-[var(--color-text-tertiary)] mb-2">What's public on your profile</p>
              <div className="flex flex-col gap-2">
                {(['races', 'stats', 'milestones'] as const).map(section => (
                  <label key={section} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={publicSections[section]}
                      onChange={e => setPublicSections(s => ({ ...s, [section]: e.target.checked }))}
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="text-sm text-[var(--color-text-secondary)] capitalize">{section}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                loading={savingProfile}
                onClick={async () => {
                  if (!username || username.length < 3) {
                    setAlert({ type: 'error', message: 'Username must be at least 3 characters.' });
                    return;
                  }
                  setSavingProfile(true);
                  try {
                    await apiFetch('/api/athlete/profile', {
                      method: 'PATCH',
                      body: JSON.stringify({ username, public_sections: publicSections }),
                    });
                    setAlert({ type: 'success', message: 'Profile updated!' });
                  } catch (e: any) {
                    setAlert({ type: 'error', message: e.message || 'Failed to save.' });
                  } finally {
                    setSavingProfile(false);
                  }
                }}
              >
                Save Profile
              </Button>
              {username && (
                <a
                  href={`/athlete/${username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--color-accent)] hover:underline"
                >
                  View public profile
                </a>
              )}
            </div>
          </div>
        </Card>

        <Card title="Join a Team" className="mb-6">
          {joinSuccess ? (
            <div className="flex items-center gap-3 py-2">
              <div className="w-8 h-8 rounded-full bg-[var(--color-accent-dim)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-accent)]">✓</div>
              <span className="text-sm font-medium text-[var(--color-accent)]">{joinSuccess}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[var(--color-text-tertiary)]">Enter the invite code your coach shared with you.</p>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Input
                    placeholder="e.g. AB3XK9QZ"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value.toUpperCase())}
                    maxLength={8}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center' }}
                  />
                </div>
                <Button onClick={handleJoin} loading={joining} disabled={!inviteCode.trim()}>
                  Join Team
                </Button>
              </div>
              {joinError && <Alert type="error" message={joinError} onClose={() => setJoinError('')} />}
            </div>
          )}
        </Card>

        <Card title="Data & Privacy" className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-[var(--color-text-tertiary)] mb-3">
                Download a copy of all your Laktic data including your profile, training plan, activities, and chat history.
              </p>
              <Button variant="secondary" size="sm" onClick={downloadData}>Download my data</Button>
            </div>
            <div className="pt-4 border-t border-[var(--color-border)]">
              <p className="text-sm font-medium mb-1">Delete account</p>
              <p className="text-sm text-[var(--color-text-tertiary)] mb-3">
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

        <Card title="Push Notifications" className="mb-6">
          {notifState === 'unsupported' ? (
            <p className="text-sm text-[var(--color-text-tertiary)]">
              Push notifications are not supported in this browser. Try installing Laktic as a PWA on your phone.
            </p>
          ) : notifState === 'blocked' ? (
            <div className="space-y-2">
              <Badge label="Blocked" color="red" />
              <p className="text-sm text-[var(--color-text-tertiary)]">
                Notifications are blocked by your browser. Go to your browser settings and allow notifications for this site.
              </p>
            </div>
          ) : notifState === 'loading' ? (
            <Spinner />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-tertiary)]">
                Get notified when your training plan is ready, race day is approaching, and more.
              </p>
              <div className="flex items-center gap-3">
                {notifState === 'granted' && <Badge label="Enabled" color="green" dot />}
                {notifState === 'granted' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={notifLoading}
                    onClick={async () => {
                      setNotifLoading(true);
                      await disableNotifs();
                      setNotifLoading(false);
                    }}
                  >
                    Turn off notifications
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    loading={notifLoading}
                    onClick={async () => {
                      setNotifLoading(true);
                      const ok = await enableNotifs();
                      setNotifLoading(false);
                      if (!ok) setAlert({ type: 'error', message: 'Could not enable notifications. Please allow them in your browser settings.' });
                    }}
                  >
                    Enable notifications
                  </Button>
                )}
              </div>
            </div>
          )}
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
                <span className="text-sm text-[var(--color-text-tertiary)]">
                  Strava Athlete #{stravaStatus.strava_athlete_id}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[var(--color-text-tertiary)]">Connected</span>
                  <p className="text-[var(--color-text-primary)]">
                    {stravaStatus.connected_at
                      ? new Date(stravaStatus.connected_at).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--color-text-tertiary)]">Last sync</span>
                  <p className="text-[var(--color-text-primary)]">
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
              <p className="text-sm text-[var(--color-text-tertiary)]">
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
    </AppLayout>
  );
}
