import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Card, Button, Alert, Badge, Spinner } from '../components/ui';
import { useNotifications } from '../hooks/useNotifications';

export function CoachSettings() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { state: notifState, enable: enableNotifs, disable: disableNotifs } = useNotifications();
  const [notifLoading, setNotifLoading] = useState(false);

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
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
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

        <Card title="Push Notifications" className="mb-6">
          {notifState === 'unsupported' ? (
            <p className="text-sm text-[var(--muted)]">
              Push notifications are not supported in this browser. Try installing Laktic as a PWA on your phone.
            </p>
          ) : notifState === 'blocked' ? (
            <div className="space-y-2">
              <Badge label="Blocked" color="red" />
              <p className="text-sm text-[var(--muted)]">
                Notifications are blocked by your browser. Allow them in your browser settings.
              </p>
            </div>
          ) : notifState === 'loading' ? (
            <Spinner />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">
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
              <p className="text-sm text-[var(--muted)] mb-3">
                Download a copy of your Laktic data including your profile, bot configuration, workout template, and knowledge documents.
              </p>
              <Button variant="secondary" size="sm" onClick={downloadData}>Download my data</Button>
            </div>
            <div className="pt-4 border-t border-[var(--border)]">
              <p className="text-sm font-medium mb-1">Delete account</p>
              <p className="text-sm text-[var(--muted)] mb-3">
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
    </div>
  );
}
