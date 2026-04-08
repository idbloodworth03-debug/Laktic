import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { AppLayout, Card, Button, Badge, Spinner, Alert, Input } from '../components/ui';
import { StravaConnectButton } from '../components/StravaConnectButton';
import { useNotifications } from '../hooks/useNotifications';
import { AvatarUpload } from '../components/AvatarUpload';
import { derivePaceBands } from '../utils/paceCalculator';

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

  // ── Training profile sections ───────────────────────────────────────────────

  // About You
  const [aboutName, setAboutName] = useState((profile as any)?.name ?? '');
  const [aboutAge, setAboutAge] = useState<string>((profile as any)?.age?.toString() ?? '');
  const [aboutGender, setAboutGender] = useState((profile as any)?.gender ?? '');
  const [aboutExp, setAboutExp] = useState((profile as any)?.experience_level ?? '');
  const [savingAbout, setSavingAbout] = useState(false);
  const [aboutSaved, setAboutSaved] = useState(false);

  // Your Training
  const [trainMpw, setTrainMpw] = useState<string>((profile as any)?.current_weekly_mileage?.toString() ?? '');
  const [trainDays, setTrainDays] = useState<number>((profile as any)?.training_days_per_week ?? 4);
  const [trainFitness, setTrainFitness] = useState<number>((profile as any)?.fitness_rating ?? 5);
  const [trainSeasonStart, setTrainSeasonStart] = useState((profile as any)?.season_start_date ?? '');
  const [trainSeasonEnd, setTrainSeasonEnd] = useState((profile as any)?.season_end_date ?? '');
  const [trainDateError, setTrainDateError] = useState('');
  const [savingTrain, setSavingTrain] = useState(false);
  const [trainSaved, setTrainSaved] = useState(false);

  // Your Races
  const PRIMARY_EVENT_OPTIONS = ['800m', '1500m', 'Mile', '5K', '10K', 'Half Marathon', 'Marathon'];
  const [raceEvents, setRaceEvents] = useState<string[]>((profile as any)?.primary_events ?? []);
  const [raceDist, setRaceDist] = useState((profile as any)?.target_race_distance ?? '');
  const [raceDate, setRaceDate] = useState((profile as any)?.target_race_date ?? '');
  const [raceName, setRaceName] = useState((profile as any)?.target_race_name ?? '');
  const [savingRaces, setSavingRaces] = useState(false);
  const [racesSaved, setRacesSaved] = useState(false);

  // Your PRs — with live pace zones debounced
  const [pr800, setPr800] = useState((profile as any)?.pr_800m ?? '');
  const [pr1500, setPr1500] = useState((profile as any)?.pr_1500m ?? '');
  const [prMile, setPrMile] = useState((profile as any)?.pr_mile ?? '');
  const [pr5k, setPr5k] = useState((profile as any)?.pr_5k ?? '');
  const [paceBands, setPaceBands] = useState(() => derivePaceBands(profile as any ?? {}));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savingPrs, setSavingPrs] = useState(false);
  const [prsSaved, setPrsSaved] = useState(false);

  // Health
  const [healthInjury, setHealthInjury] = useState((profile as any)?.injury_notes ?? '');
  const [healthSleep, setHealthSleep] = useState((profile as any)?.sleep_average ?? '');
  const [savingHealth, setSavingHealth] = useState(false);
  const [healthSaved, setHealthSaved] = useState(false);

  // Profile load state
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  // Live pace zone recalculation when PRs change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPaceBands(derivePaceBands({ pr_800m: pr800, pr_1500m: pr1500, pr_mile: prMile, pr_5k: pr5k }));
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [pr800, pr1500, prMile, pr5k]);

  async function patchProfile(payload: Record<string, unknown>, setSaving: (v: boolean) => void, setSaved: (v: boolean) => void) {
    setSaving(true);
    try {
      const updated = await apiFetch('/api/athlete/profile', { method: 'PATCH', body: JSON.stringify(payload) });
      // Re-populate fields from the response so local state reflects what was persisted
      populateFromProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setAlert({ type: 'error', message: e.message || 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  // ── Public profile state ────────────────────────────────────────────────────
  const [username, setUsername] = useState((profile as any)?.username ?? '');
  const [publicSections, setPublicSections] = useState<{ races: boolean; stats: boolean; milestones: boolean }>(
    (profile as any)?.public_sections ?? { races: true, stats: true, milestones: true }
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // Populate every field from a fresh profile object
  function populateFromProfile(p: Record<string, any>) {
    if (!p) return;
    setAboutName(p.name ?? p.full_name ?? '');
    setAboutAge(p.age != null ? String(p.age) : '');
    setAboutGender(p.gender ?? '');
    setAboutExp(p.experience_level ?? '');
    setTrainMpw(p.current_weekly_mileage != null ? String(p.current_weekly_mileage) : '');
    setTrainDays(p.training_days_per_week ?? 4);
    setTrainFitness(p.fitness_rating ?? 5);
    setTrainSeasonStart(p.season_start_date ?? '');
    setTrainSeasonEnd(p.season_end_date ?? '');
    setRaceEvents(Array.isArray(p.primary_events) ? p.primary_events : []);
    setRaceDist(p.target_race_distance ?? '');
    setRaceDate(p.target_race_date ?? '');
    setRaceName(p.target_race_name ?? '');
    setPr800(p.pr_800m ?? '');
    setPr1500(p.pr_1500m ?? '');
    setPrMile(p.pr_mile ?? '');
    setPr5k(p.pr_5k ?? '');
    setHealthInjury(p.injury_notes ?? '');
    setHealthSleep(p.sleep_average ?? '');
    setUsername(p.username ?? '');
    setPublicSections(p.public_sections ?? { races: true, stats: true, milestones: true });
  }

  // Fetch fresh profile on mount and pre-fill all fields
  useEffect(() => {
    apiFetch('/api/athlete/profile')
      .then((p: Record<string, any>) => {
        populateFromProfile(p);
        setProfileError('');
      })
      .catch(() => {
        setProfileError('Could not load your profile data. Please refresh.');
      })
      .finally(() => {
        setProfileLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data: refreshData } = await supabase.auth.refreshSession();
      session = refreshData.session;
    }
    if (!session) {
      setAlert({ type: 'error', message: 'Please sign in again before connecting Strava.' });
      return;
    }
    // profile is always in store on protected route; fall back to /api/me if needed
    let athleteId = profile?.id;
    if (!athleteId) {
      try {
        const me = await apiFetch('/api/me');
        athleteId = me.profile?.id;
      } catch {}
    }
    if (!athleteId) {
      setAlert({ type: 'error', message: 'Could not load your profile. Please refresh the page.' });
      return;
    }
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    // Full browser redirect — backend returns 302 to Strava, not JSON
    window.location.href = `${apiUrl}/api/strava/auth?athleteId=${athleteId}&return_to=settings`;
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

        {profileError && (
          <div className="mb-6">
            <Alert type="error" message={profileError} onClose={() => setProfileError('')} />
          </div>
        )}

        {alert && (
          <div className="mb-6">
            <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
          </div>
        )}

        {/* ── Profile sections — skeleton while loading ──────────────────── */}
        {profileLoading ? (
          <div className="space-y-6 mb-6">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-card p-5 animate-pulse">
                <div className="h-4 w-28 bg-[var(--color-bg-tertiary)] rounded mb-5" />
                <div className="space-y-3">
                  <div className="h-9 bg-[var(--color-bg-tertiary)] rounded-lg" />
                  <div className="h-9 bg-[var(--color-bg-tertiary)] rounded-lg" />
                  <div className="h-8 w-20 bg-[var(--color-bg-tertiary)] rounded-lg mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
        {/* ── 1. About You ──────────────────────────────────────────────── */}
        <Card title="About You" className="mb-6">
          <div className="flex flex-col gap-4">
            <Input label="Full name" value={aboutName} onChange={e => setAboutName(e.target.value)} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Age" type="number" min={10} max={99} value={aboutAge} onChange={e => setAboutAge(e.target.value)} />
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-tertiary)] mb-1">Gender</label>
                <select
                  value={aboutGender}
                  onChange={e => setAboutGender(e.target.value)}
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                >
                  <option value="">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-tertiary)] mb-1">Experience level</label>
              <select
                value={aboutExp}
                onChange={e => setAboutExp(e.target.value)}
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">Select level</option>
                <option value="beginner">Beginner (0–2 years)</option>
                <option value="intermediate">Intermediate (2–5 years)</option>
                <option value="advanced">Advanced (5+ years)</option>
                <option value="elite">Elite / Competitive</option>
              </select>
            </div>
            <Button
              variant="primary" size="sm" loading={savingAbout}
              onClick={() => patchProfile({ name: aboutName, age: aboutAge ? parseInt(aboutAge) : null, gender: aboutGender || null, experience_level: aboutExp || null }, setSavingAbout, setAboutSaved)}
            >
              {aboutSaved ? 'Saved ✓' : 'Save'}
            </Button>
          </div>
        </Card>

        {/* ── 2. Your Training ──────────────────────────────────────────── */}
        <Card title="Your Training" className="mb-6">
          <div className="flex flex-col gap-4">
            <Input label="Current weekly mileage (mi)" type="number" min={0} max={200} value={trainMpw} onChange={e => setTrainMpw(e.target.value)} />
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-tertiary)] mb-2">Training days per week</label>
              <div className="flex gap-2 flex-wrap">
                {[2, 3, 4, 5, 6, 7].map(d => (
                  <button
                    key={d}
                    onClick={() => setTrainDays(d)}
                    className={`w-9 h-9 rounded-full text-sm font-medium transition-all ${trainDays === d ? 'bg-[var(--color-accent)] text-black' : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-tertiary)] mb-1">
                Self-rated fitness: <span className="font-mono text-[var(--color-accent)]">{trainFitness}/10</span>
              </label>
              <input
                type="range" min={1} max={10} value={trainFitness}
                onChange={e => setTrainFitness(parseInt(e.target.value))}
                className="w-full accent-[var(--color-accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--color-text-tertiary)] mt-1">
                <span>Just starting</span><span>Peak shape</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Season start date" type="date" min={new Date().toISOString().split('T')[0]} value={trainSeasonStart} onChange={e => { setTrainSeasonStart(e.target.value); setTrainDateError(''); }} />
              <Input label="Season end date" type="date" min={new Date().toISOString().split('T')[0]} value={trainSeasonEnd} onChange={e => { setTrainSeasonEnd(e.target.value); setTrainDateError(''); }} />
            </div>
            {trainDateError && (
              <p className="text-red-500 text-sm">{trainDateError}</p>
            )}
            <Button
              variant="primary" size="sm" loading={savingTrain}
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                if (trainSeasonStart && trainSeasonStart < today) {
                  setTrainDateError('Season start date cannot be in the past.');
                  return;
                }
                if (trainSeasonEnd && trainSeasonEnd < today) {
                  setTrainDateError('Season end date cannot be in the past.');
                  return;
                }
                setTrainDateError('');
                patchProfile({
                  current_weekly_mileage: trainMpw ? parseFloat(trainMpw) : null,
                  training_days_per_week: trainDays,
                  fitness_rating: trainFitness,
                  season_start_date: trainSeasonStart || null,
                  season_end_date: trainSeasonEnd || null,
                }, setSavingTrain, setTrainSaved);
              }}
            >
              {trainSaved ? 'Saved ✓' : 'Save'}
            </Button>
          </div>
        </Card>

        {/* ── 3. Your Races ─────────────────────────────────────────────── */}
        <Card title="Your Races" className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-tertiary)] mb-2">Primary events (select all that apply)</label>
              <div className="flex flex-wrap gap-2">
                {PRIMARY_EVENT_OPTIONS.map(ev => (
                  <button
                    key={ev}
                    onClick={() => setRaceEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev])}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${raceEvents.includes(ev) ? 'bg-[var(--color-accent)] text-black' : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-tertiary)] mb-1">Target race distance</label>
              <select
                value={raceDist}
                onChange={e => setRaceDist(e.target.value)}
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">Select distance</option>
                {PRIMARY_EVENT_OPTIONS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
              </select>
            </div>
            <Input label="Target race name" value={raceName} onChange={e => setRaceName(e.target.value)} placeholder="e.g. Boston Marathon" />
            <Input label="Target race date" type="date" value={raceDate} onChange={e => setRaceDate(e.target.value)} />
            <Button
              variant="primary" size="sm" loading={savingRaces}
              onClick={() => patchProfile({
                primary_events: raceEvents,
                target_race_distance: raceDist || null,
                target_race_name: raceName || null,
                target_race_date: raceDate || null,
                has_target_race: !!(raceDate || raceName),
              }, setSavingRaces, setRacesSaved)}
            >
              {racesSaved ? 'Saved ✓' : 'Save'}
            </Button>
          </div>
        </Card>

        {/* ── 4. Your PRs ───────────────────────────────────────────────── */}
        <Card title="Your PRs" className="mb-6">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="800m PR" value={pr800} onChange={e => setPr800(e.target.value)} placeholder="e.g. 2:05" />
              <Input label="1500m PR" value={pr1500} onChange={e => setPr1500(e.target.value)} placeholder="e.g. 4:15" />
              <Input label="Mile PR" value={prMile} onChange={e => setPrMile(e.target.value)} placeholder="e.g. 4:35" />
              <Input label="5K PR" value={pr5k} onChange={e => setPr5k(e.target.value)} placeholder="e.g. 18:30" />
            </div>

            {/* Live pace zones */}
            {!paceBands.needs_aerobic_pr ? (
              <div className="bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">
                  Live pace zones (from {paceBands.source_pr})
                </p>
                <div className="space-y-1.5">
                  {[
                    { label: 'LT2 / Race pace', val: paceBands.LT2 },
                    { label: 'LT1 / Tempo', val: paceBands.LT1 },
                    { label: 'Steady state', val: paceBands.steady },
                    { label: 'Easy', val: paceBands.easy },
                    { label: 'Recovery', val: paceBands.recovery },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-baseline justify-between">
                      <span className="text-xs text-[var(--color-text-tertiary)]">{label}</span>
                      <span className="font-mono text-xs text-[var(--color-accent)]">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-tertiary)]">Enter a 5K or longer PR to see live pace zones.</p>
            )}

            <Button
              variant="primary" size="sm" loading={savingPrs}
              onClick={() => patchProfile({ pr_800m: pr800 || null, pr_1500m: pr1500 || null, pr_mile: prMile || null, pr_5k: pr5k || null }, setSavingPrs, setPrsSaved)}
            >
              {prsSaved ? 'Saved ✓' : 'Save'}
            </Button>
          </div>
        </Card>

        {/* ── 5. Health ─────────────────────────────────────────────────── */}
        <Card title="Health" className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-tertiary)] mb-1">Injury notes / limitations</label>
              <textarea
                value={healthInjury}
                onChange={e => setHealthInjury(e.target.value)}
                rows={3}
                placeholder="e.g. Right knee — avoid hills over 5% grade"
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)] resize-none"
              />
            </div>
            <Input
              label="Average sleep (hours)"
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={healthSleep}
              onChange={e => setHealthSleep(e.target.value)}
              placeholder="e.g. 7.5"
            />
            <Button
              variant="primary" size="sm" loading={savingHealth}
              onClick={() => patchProfile({ injury_notes: healthInjury || null, sleep_average: healthSleep || null }, setSavingHealth, setHealthSaved)}
            >
              {healthSaved ? 'Saved ✓' : 'Save'}
            </Button>
          </div>
        </Card>
          </>
        )}

        <Card title="Public Profile" className="mb-6">
          <div className="mb-6 flex justify-center">
            <AvatarUpload
              currentUrl={(profile as any)?.avatar_url}
              name={profile?.name ?? ''}
              role="athlete"
              onUpload={() => {}}
            />
          </div>
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
              <div className="flex items-center gap-4">
                <Button variant="secondary" size="sm" onClick={downloadData}>Download my data</Button>
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--color-accent)] hover:underline">
                  Privacy Policy
                </a>
              </div>
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

              <div className="flex gap-3 pt-2 flex-wrap">
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

              <p className="text-xs text-[var(--color-text-tertiary)]">
                Disconnecting will delete all synced Strava activity data from Laktic.
              </p>

              {/* Powered by Strava — required by Strava API guidelines */}
              <a
                href="https://www.strava.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors pt-1"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M12 3l-4 7h3L7 17l8-9h-4L12 3z" fill="#FC5200" />
                </svg>
                Powered by Strava
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-text-tertiary)]">
                Connect your Strava account to automatically sync your running activities,
                including pace, distance, heart rate, and elevation data.
              </p>
              <StravaConnectButton onClick={connectStrava} />
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
