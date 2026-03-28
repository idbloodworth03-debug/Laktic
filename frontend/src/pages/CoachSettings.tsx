import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Card, Button, Alert, Badge, Spinner, Input } from '../components/ui';
import { useNotifications } from '../hooks/useNotifications';

export function CoachSettings() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { state: notifState, enable: enableNotifs, disable: disableNotifs } = useNotifications();
  const [notifLoading, setNotifLoading] = useState(false);

  // Public profile
  const [username, setUsername] = useState((profile as any)?.username ?? '');
  const [savingUsername, setSavingUsername] = useState(false);

  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  async function downloadData() {
    try {
      const data = await apiFetch('/api/coach/data-export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'laktic-coach-data.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message || 'Export failed.' });
    }
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    try {
      await apiFetch('/api/coach/account', { method: 'DELETE' });
      await supabase.auth.signOut();
      clearAuth();
      nav('/');
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message || 'Failed to delete account.' });
      setDeletingAccount(false);
      setDeleteConfirm(false);
    }
  }

  return (
    <AppLayout role="coach" name={profile?.name} onLogout={logout}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl font-bold">Settings</h1>
          <Link to="/coach/dashboard"><Button variant="ghost" size="sm">← Dashboard</Button></Link>
        </div>

        {alert && (
          <div className="mb-6">
            <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
          </div>
        )}

        <Card title="Public Profile" className="mb-6">
          <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
            Set a username to get a public profile at <strong className="text-[var(--color-text-primary)]">laktic.com/coach/[username]</strong>
          </p>
          {(profile as any)?.license_type === 'team' && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-bold text-blue-300 bg-blue-950/40 border border-blue-800/40 px-2 py-0.5 rounded uppercase tracking-wide">School/Club Coach</span>
              <span className="text-xs text-[var(--color-text-tertiary)]">Team License active</span>
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="e.g. coachsmith"
                maxLength={20}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={savingUsername}
              onClick={async () => {
                if (!username || username.length < 3) {
                  setAlert({ type: 'error', message: 'Username must be at least 3 characters.' });
                  return;
                }
                setSavingUsername(true);
                try {
                  await apiFetch('/api/coach/profile', { method: 'PATCH', body: JSON.stringify({ username }) });
                  setAlert({ type: 'success', message: 'Username saved!' });
                } catch (e: any) {
                  setAlert({ type: 'error', message: e.message || 'Failed to save.' });
                } finally {
                  setSavingUsername(false);
                }
              }}
            >
              Save
            </Button>
          </div>
          {username && (
            <a href={`/coach/${username}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-accent)] hover:underline mt-2 block">
              View public profile
            </a>
          )}
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
                Notifications are blocked by your browser. Allow them in your browser settings.
              </p>
            </div>
          ) : notifState === 'loading' ? (
            <Spinner />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-tertiary)]">
                Get notified when an athlete misses practice or has a low attendance streak.
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

        <Card title="Data & Privacy">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-[var(--color-text-tertiary)] mb-3">
                Download a copy of your Laktic data including your profile, bot configuration, workout template, and knowledge documents.
              </p>
              <Button variant="secondary" size="sm" onClick={downloadData}>Download my data</Button>
            </div>
            <div className="pt-4 border-t border-[var(--color-border)]">
              <p className="text-sm font-medium mb-1">Delete account</p>
              <p className="text-sm text-[var(--color-text-tertiary)] mb-3">
                Permanently deletes your account, bot, and all associated data. Coaches with active subscribers must unpublish their bot first.
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
      </div>
    </AppLayout>
  );
}
