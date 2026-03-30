import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Button, Card, Badge, Spinner, EmptyState, Input, Textarea, Alert } from '../components/ui';

// ── Marketplace Browse ────────────────────────────────────────────────────────
export function MarketplacePage() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [coaches, setCoaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/marketplace/coaches')
      .then(setCoaches)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="mb-8 fade-up">
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Elite Coach Marketplace</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              Train with methods from proven coaches. Subscribe to a coach model to get a plan built on their philosophy.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : coaches.length === 0 ? (
            <EmptyState
              title="No elite coaches yet"
              message="Elite coaches are reviewed and approved by Laktic. Check back soon."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {coaches.map(coach => (
                <MarketplaceCoachCard key={coach.id} coach={coach} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function MarketplaceCoachCard({ coach }: { coach: any }) {
  const cp = coach.coach_profiles;
  const bot = Array.isArray(cp?.coach_bots) ? cp.coach_bots.find((b: any) => b.is_published) : cp?.coach_bots;
  const philosophy = bot?.philosophy ?? '';

  return (
    <Link to={`/marketplace/${coach.id}`} className="block group">
      <div
        className="rounded-xl p-5 transition-all duration-150 cursor-pointer"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-light)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'; (e.currentTarget as HTMLElement).style.transform = ''; }}
      >
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shrink-0"
            style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-light)', color: 'var(--color-accent)' }}
          >
            {cp?.name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
        </div>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-0.5">{cp?.name}</h3>
        {cp?.school_or_org && (
          <p className="text-xs text-[var(--color-text-tertiary)] mb-2">{cp.school_or_org}</p>
        )}
        {philosophy && (
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed line-clamp-3 mb-4">
            {philosophy.slice(0, 160)}{philosophy.length > 160 ? '…' : ''}
          </p>
        )}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">${coach.price_per_month}<span className="text-xs font-normal text-[var(--color-text-tertiary)]">/mo</span></span>
          <Badge label="Payments coming soon" color="gray" />
        </div>
      </div>
    </Link>
  );
}

// ── Marketplace Coach Profile ─────────────────────────────────────────────────
export function MarketplaceCoachProfile() {
  const { coachId } = useParams<{ coachId: string }>();
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [coach, setCoach] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    if (!coachId) return;
    apiFetch(`/api/marketplace/coaches/${coachId}`)
      .then(setCoach)
      .catch(() => nav('/marketplace'))
      .finally(() => setLoading(false));
  }, [coachId, nav]);

  if (loading) return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    </AppLayout>
  );

  if (!coach) return null;

  const cp = coach.coach_profiles;
  const bot = Array.isArray(cp?.coach_bots)
    ? cp.coach_bots.find((b: any) => b.is_published)
    : cp?.coach_bots;
  const workouts = bot?.bot_workouts ?? [];
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <AppLayout role="athlete" name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <Link
            to="/marketplace"
            className="text-xs transition-colors mb-6 inline-flex items-center gap-1"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          >
            ← Back to marketplace
          </Link>

          {/* Header */}
          <div className="flex items-start gap-4 mb-6 fade-up">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
              style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-light)', color: 'var(--color-accent)' }}
            >
              {cp?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{cp?.name}</h1>
              </div>
              {cp?.school_or_org && <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">{cp.school_or_org}</p>}
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                Elite coach · Listed {coach.approved_at ? new Date(coach.approved_at).toLocaleDateString() : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">${coach.price_per_month}<span className="text-sm font-normal text-[var(--color-text-tertiary)]">/mo</span></p>
              <Button
                className="mt-2"
                disabled
                title="Payments launching soon"
              >
                Subscribe — Coming Soon
              </Button>
            </div>
          </div>

          <div className="space-y-5">
            {/* Bio */}
            <Card title="About this coach">
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">{coach.bio}</p>
            </Card>

            {/* Credentials */}
            <Card title="Credentials & Experience">
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">{coach.credentials}</p>
            </Card>

            {/* Philosophy */}
            {bot?.philosophy && (
              <Card title="Training Philosophy">
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">{bot.philosophy}</p>
              </Card>
            )}

            {/* Sample week */}
            {workouts.length > 0 && (
              <Card title="Sample Training Week">
                <div className="space-y-2">
                  {DAYS.map((day, i) => {
                    const w = workouts.find((x: any) => x.day_of_week === i + 1);
                    return (
                      <div key={day} className="flex items-start gap-3 py-2 border-b border-[var(--color-border)]/40 last:border-0">
                        <span className="w-8 text-xs font-medium text-[var(--color-text-tertiary)] shrink-0 pt-0.5">{day}</span>
                        {w ? (
                          <div>
                            <span className="text-sm font-medium text-[var(--color-text-primary)]">{w.title}</span>
                            {w.distance_miles && (
                              <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">{w.distance_miles} mi</span>
                            )}
                            {w.description && (
                              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{w.description}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-[var(--color-text-tertiary)]">Rest</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <div className="rounded-xl p-4 text-center" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
              <p className="text-sm text-[var(--color-text-tertiary)] mb-2">Athlete subscriptions are launching soon. Stripe integration is in progress.</p>
              <Badge label="Payments coming soon" color="amber" />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ── Marketplace Apply (coach-only) ────────────────────────────────────────────
export function MarketplaceApply() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const [application, setApplication] = useState<any>(null);
  const [loadingApp, setLoadingApp] = useState(true);
  const [form, setForm] = useState({
    bio: '',
    credentials: '',
    price_per_month: 25,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    apiFetch('/api/marketplace/my-application')
      .then(data => {
        if (data) {
          setApplication(data);
          setForm({
            bio: data.bio ?? '',
            credentials: data.credentials ?? '',
            price_per_month: data.price_per_month ?? 25,
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoadingApp(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      const saved = await apiFetch('/api/marketplace/apply', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setApplication(saved);
      setSuccess('Application submitted! We\'ll review it within a few business days.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = () => {
    if (!application) return null;
    const map: Record<string, { label: string; color: 'amber' | 'green' | 'red' }> = {
      pending:  { label: 'Under Review', color: 'amber' },
      approved: { label: 'Approved', color: 'green' },
      rejected: { label: 'Rejected', color: 'red' },
    };
    const s = map[application.approval_status];
    return s ? <Badge label={s.label} color={s.color} dot /> : null;
  };

  return (
    <AppLayout role="coach" name={profile?.name} onLogout={logout}>
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-6 fade-up">
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Marketplace Application</h1>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
                Apply to list your coaching bot on the Laktic Elite Marketplace.
              </p>
            </div>
            {statusBadge()}
          </div>

          {loadingApp ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : (
            <>
              {application?.approval_status === 'approved' && (
                <div className="mb-5"><Alert type="success" message="Your application has been approved! Your coaching bot is live on the marketplace." /></div>
              )}
              {application?.approval_status === 'rejected' && application.rejection_reason && (
                <div className="mb-5"><Alert type="error" message={`Application rejected: ${application.rejection_reason}`} /></div>
              )}
              {success && <div className="mb-5"><Alert type="success" message={success} /></div>}
              {error && <div className="mb-5"><Alert type="error" message={error} /></div>}

              <Card>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <Textarea
                    label="Coach Bio"
                    placeholder="Describe your coaching background, achievements, and what makes your approach unique. (Min 50 characters)"
                    value={form.bio}
                    onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                    rows={5}
                    required
                  />

                  <Textarea
                    label="Credentials & Experience"
                    placeholder="List your certifications, years coaching, notable athletes coached, race results, etc."
                    value={form.credentials}
                    onChange={e => setForm(f => ({ ...f, credentials: e.target.value }))}
                    rows={4}
                    required
                  />

                  <Input
                    label="Monthly price (USD)"
                    type="number"
                    min={5}
                    max={200}
                    step={1}
                    value={form.price_per_month}
                    onChange={e => setForm(f => ({ ...f, price_per_month: Number(e.target.value) }))}
                  />
                  <p className="text-xs text-[var(--color-text-tertiary)] -mt-3">
                    Suggested range: $20–$30/month. Laktic retains 70%, you receive 30% once payments launch.
                  </p>

                  <div className="pt-2">
                    <Button type="submit" loading={saving} className="w-full">
                      {application ? 'Update Application' : 'Submit Application'}
                    </Button>
                  </div>
                </form>
              </Card>

              <div className="mt-4 text-center">
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Your published bot must be set up before applying.{' '}
                  <Link to="/coach/bot/edit" className="hover:underline" style={{ color: 'var(--color-accent)' }}>Check bot setup</Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
