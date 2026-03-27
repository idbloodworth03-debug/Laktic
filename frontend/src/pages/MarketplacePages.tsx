import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Card, Badge, Spinner, EmptyState, Input, Textarea, Select, Alert } from '../components/ui';

const SPEC_LABELS: Record<string, string> = {
  distance: 'Distance', sprints: 'Sprints', triathlon: 'Triathlon',
  trail: 'Trail', field: 'Field', cross_country: 'Cross Country', multi_event: 'Multi-Event',
};

const SPEC_OPTIONS = [
  { value: 'distance', label: 'Distance' },
  { value: 'sprints', label: 'Sprints' },
  { value: 'triathlon', label: 'Triathlon' },
  { value: 'trail', label: 'Trail' },
  { value: 'field', label: 'Field' },
  { value: 'cross_country', label: 'Cross Country' },
  { value: 'multi_event', label: 'Multi-Event' },
];

// ── Marketplace Browse ────────────────────────────────────────────────────────
export function MarketplacePage() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [coaches, setCoaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  useEffect(() => {
    apiFetch('/api/marketplace/coaches')
      .then(setCoaches)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter
    ? coaches.filter(c => c.specialization === filter)
    : coaches;

  return (
    <div className="min-h-screen">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8 fade-up">
          <div>
            <h1 className="font-display text-3xl font-bold">Elite Coach Marketplace</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Train with methods from proven coaches. Subscribe to a coach model to get a plan built on their philosophy.
            </p>
          </div>
          <Select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            options={[{ value: '', label: 'All specializations' }, ...SPEC_OPTIONS]}
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No elite coaches yet"
            message="Elite coaches are reviewed and approved by Laktic. Check back soon."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(coach => (
              <MarketplaceCoachCard key={coach.id} coach={coach} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketplaceCoachCard({ coach }: { coach: any }) {
  const cp = coach.coach_profiles;
  const bot = Array.isArray(cp?.coach_bots) ? cp.coach_bots.find((b: any) => b.is_published) : cp?.coach_bots;
  const philosophy = bot?.philosophy ?? '';

  return (
    <Link to={`/marketplace/${coach.id}`} className="block group">
      <div className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border2)] rounded-xl p-5 transition-all hover:shadow-card group-hover:translate-y-[-1px] duration-150">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-full bg-[var(--surface2)] border border-[var(--border2)] flex items-center justify-center text-base font-bold text-brand-400 shrink-0">
            {cp?.name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <Badge label={SPEC_LABELS[coach.specialization] ?? coach.specialization} color="blue" />
        </div>
        <h3 className="font-display text-base font-semibold text-[var(--text)] mb-0.5">{cp?.name}</h3>
        {cp?.school_or_org && (
          <p className="text-xs text-[var(--muted)] mb-2">{cp.school_or_org}</p>
        )}
        {philosophy && (
          <p className="text-sm text-[var(--text2)] leading-relaxed line-clamp-3 mb-4">
            {philosophy.slice(0, 160)}{philosophy.length > 160 ? '…' : ''}
          </p>
        )}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]/60">
          <span className="text-sm font-semibold text-[var(--text)]">${coach.price_per_month}<span className="text-xs font-normal text-[var(--muted)]">/mo</span></span>
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
    <div className="min-h-screen">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      <div className="flex justify-center py-20"><Spinner size="lg" /></div>
    </div>
  );

  if (!coach) return null;

  const cp = coach.coach_profiles;
  const bot = Array.isArray(cp?.coach_bots)
    ? cp.coach_bots.find((b: any) => b.is_published)
    : cp?.coach_bots;
  const workouts = bot?.bot_workouts ?? [];
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="min-h-screen">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link to="/marketplace" className="text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors mb-6 inline-flex items-center gap-1">
          ← Back to marketplace
        </Link>

        {/* Header */}
        <div className="flex items-start gap-4 mb-6 fade-up">
          <div className="w-14 h-14 rounded-full bg-[var(--surface2)] border border-[var(--border2)] flex items-center justify-center text-xl font-bold text-brand-400 shrink-0">
            {cp?.name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-bold text-[var(--text)]">{cp?.name}</h1>
              <Badge label={SPEC_LABELS[coach.specialization] ?? coach.specialization} color="blue" />
            </div>
            {cp?.school_or_org && <p className="text-sm text-[var(--muted)] mt-0.5">{cp.school_or_org}</p>}
            <p className="text-xs text-[var(--muted)] mt-1">
              Elite coach · Listed {coach.approved_at ? new Date(coach.approved_at).toLocaleDateString() : ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold text-[var(--text)]">${coach.price_per_month}<span className="text-sm font-normal text-[var(--muted)]">/mo</span></p>
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
            <p className="text-sm text-[var(--text2)] leading-relaxed whitespace-pre-wrap">{coach.bio}</p>
          </Card>

          {/* Credentials */}
          <Card title="Credentials & Experience">
            <p className="text-sm text-[var(--text2)] leading-relaxed whitespace-pre-wrap">{coach.credentials}</p>
          </Card>

          {/* Philosophy */}
          {bot?.philosophy && (
            <Card title="Training Philosophy">
              <p className="text-sm text-[var(--text2)] leading-relaxed whitespace-pre-wrap">{bot.philosophy}</p>
            </Card>
          )}

          {/* Sample week */}
          {workouts.length > 0 && (
            <Card title="Sample Training Week">
              <div className="space-y-2">
                {DAYS.map((day, i) => {
                  const w = workouts.find((x: any) => x.day_of_week === i + 1);
                  return (
                    <div key={day} className="flex items-start gap-3 py-2 border-b border-[var(--border)]/40 last:border-0">
                      <span className="w-8 text-xs font-medium text-[var(--muted)] shrink-0 pt-0.5">{day}</span>
                      {w ? (
                        <div>
                          <span className="text-sm font-medium text-[var(--text)]">{w.title}</span>
                          {w.distance_miles && (
                            <span className="ml-2 text-xs text-[var(--muted)]">{w.distance_miles} mi</span>
                          )}
                          {w.description && (
                            <p className="text-xs text-[var(--muted)] mt-0.5">{w.description}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--muted)]">Rest</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-4 text-center">
            <p className="text-sm text-[var(--muted)] mb-2">Athlete subscriptions are launching soon. Stripe integration is in progress.</p>
            <Badge label="Payments coming soon" color="amber" />
          </div>
        </div>
      </div>
    </div>
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
    specialization: 'distance',
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
            specialization: data.specialization ?? 'distance',
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
    <div className="min-h-screen">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6 fade-up">
          <div>
            <h1 className="font-display text-2xl font-bold">Marketplace Application</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
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

                <Select
                  label="Primary Specialization"
                  value={form.specialization}
                  onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))}
                  options={SPEC_OPTIONS}
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
                <p className="text-xs text-[var(--muted)] -mt-3">
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
              <p className="text-xs text-[var(--muted)]">
                Your published bot must be set up before applying.{' '}
                <Link to="/coach/bot/edit" className="text-brand-400 hover:underline">Check bot setup</Link>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
