import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { AppLayout, Button, Card, Badge, Spinner, Alert } from '../components/ui';

type Referral = {
  id: string;
  referred_email: string | null;
  status: 'pending' | 'signed_up' | 'converted';
  reward_granted: boolean;
  created_at: string;
};

type ReferralData = {
  referral_code: string;
  referral_link: string;
  total_referred: number;
  signed_up: number;
  converted: number;
  credit_days: number;
  referrals: Referral[];
};

const STATUS_BADGE: Record<string, 'gray' | 'amber' | 'green'> = {
  pending: 'gray',
  signed_up: 'amber',
  converted: 'green',
};

export function ReferralsPage() {
  const { profile, role, clearAuth, logout } = useAuthStore();
  const nav = useNavigate();
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleLogout = async () => { await logout(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/referrals/my')
      .then(setData)
      .catch(e => setAlert({ type: 'error', message: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const copyLink = async () => {
    if (!data?.referral_link) return;
    try {
      await navigator.clipboard.writeText(data.referral_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  };

  return (
    <AppLayout role={role ?? 'athlete'} name={profile?.name} onLogout={handleLogout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <div className="mb-6 fade-up">
            <h1 className="text-3xl font-bold">Referral Program</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              Invite friends and earn 30 bonus days for each person who completes their first 3 workouts.
            </p>
          </div>

          {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : !data ? null : (
            <div className="flex flex-col gap-5 fade-up-1">
              {/* Credit banner */}
              {data.credit_days > 0 && (
                <div
                  className="rounded-xl px-5 py-4 flex items-center gap-3"
                  style={{ background: 'var(--color-accent-dim)', border: '1px solid rgba(0,229,160,0.2)' }}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
                      You have <strong>{data.credit_days} bonus days</strong> from referrals
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Applied automatically to your next billing cycle</p>
                  </div>
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Invited', value: data.total_referred },
                  { label: 'Signed Up', value: data.signed_up },
                  { label: 'Converted', value: data.converted },
                ].map(s => (
                  <div
                    key={s.label}
                    className="rounded-xl p-4 text-center"
                    style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="font-mono text-2xl font-medium text-[var(--color-text-primary)]">{s.value}</div>
                    <div className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Referral link */}
              <Card>
                <h3 className="font-semibold mb-3">Your Referral Link</h3>
                <div className="flex gap-2">
                  <div
                    className="flex-1 rounded-lg px-3 py-2.5 text-sm font-mono overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                  >
                    {data.referral_link}
                  </div>
                  <Button variant="primary" onClick={copyLink}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-3">
                  Share this link with friends. When they sign up and complete 3 workouts,
                  you'll earn <strong className="text-[var(--color-text-primary)]">30 bonus days</strong> automatically.
                </p>
              </Card>

              {/* How it works */}
              <Card>
                <h3 className="font-semibold mb-4">How it works</h3>
                <div className="flex flex-col gap-3">
                  {[
                    { step: '1', title: 'Share your link', desc: 'Copy your referral link above and share it anywhere.' },
                    { step: '2', title: 'They sign up', desc: 'Your friend creates a Laktic account through your link.' },
                    { step: '3', title: 'They train', desc: 'Once they log 3+ workouts, the reward is automatically triggered.' },
                    { step: '4', title: 'You earn 30 days', desc: 'You receive 30 bonus days added to your subscription. No limit.' },
                  ].map(s => (
                    <div key={s.step} className="flex items-start gap-3">
                      <div
                        className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: 'var(--color-accent-dim)', border: '1px solid rgba(0,229,160,0.2)', color: 'var(--color-accent)' }}
                      >
                        {s.step}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">{s.title}</span>
                        <span className="text-sm text-[var(--color-text-tertiary)] ml-2">{s.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Referral history */}
              {data.referrals.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Your Referrals</h3>
                  <div className="flex flex-col gap-2">
                    {data.referrals.map(r => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-xl px-4 py-3"
                        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
                      >
                        <div>
                          <div className="text-sm text-[var(--color-text-primary)]">
                            {r.referred_email ?? 'Anonymous signup'}
                          </div>
                          <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                            {new Date(r.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.reward_granted && (
                            <span className="text-xs font-medium" style={{ color: 'var(--color-accent)' }}>+30 days</span>
                          )}
                          <Badge label={r.status} color={STATUS_BADGE[r.status]} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
