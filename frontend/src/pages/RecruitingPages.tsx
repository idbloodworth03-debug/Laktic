import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Navbar, Card, Button, Spinner, Input } from '../components/ui';

// ── Athlete: recruiting profile editor ───────────────────────────────────────
export function RecruitingSettings() {
  const { profile } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    gpa: '', graduation_year: '', target_distance: '',
    highlight_video_url: '', recruiting_notes: '', visible: true,
  });
  const logout = async () => { const { supabase } = await import('../lib/supabaseClient'); await supabase.auth.signOut(); useAuthStore.getState().clearAuth(); };

  useEffect(() => {
    apiFetch('/api/recruiting/my-profile').then(d => {
      if (d) {
        setData(d);
        setForm({
          gpa: d.gpa?.toString() ?? '',
          graduation_year: d.graduation_year?.toString() ?? '',
          target_distance: d.target_distance ?? '',
          highlight_video_url: d.highlight_video_url ?? '',
          recruiting_notes: d.recruiting_notes ?? '',
          visible: d.visible ?? true,
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/recruiting/my-profile', {
        method: 'PUT',
        body: JSON.stringify({
          gpa: form.gpa ? parseFloat(form.gpa) : undefined,
          graduation_year: form.graduation_year ? parseInt(form.graduation_year) : undefined,
          target_distance: form.target_distance || undefined,
          highlight_video_url: form.highlight_video_url || undefined,
          recruiting_notes: form.recruiting_notes || undefined,
          visible: form.visible,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center"><Spinner /></div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="athlete" name={profile?.name} onLogout={logout} />
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Recruiting Profile</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Visible to college recruiters browsing the Laktic portal</p>
          </div>
          <Link to="/athlete/settings"><Button variant="ghost" size="sm">← Settings</Button></Link>
        </div>

        {saved && (
          <div className="mb-4 text-sm text-green-400 bg-green-950/30 border border-green-800/40 rounded-lg px-4 py-2">
            Profile saved!
          </div>
        )}

        <Card>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--muted)] mb-1 block">GPA (0.0–4.0)</label>
                <Input type="number" step="0.01" min="0" max="4" placeholder="3.7" value={form.gpa} onChange={e => setForm(f => ({ ...f, gpa: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)] mb-1 block">Graduation Year</label>
                <Input type="number" placeholder="2026" value={form.graduation_year} onChange={e => setForm(f => ({ ...f, graduation_year: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Target Distance / Event</label>
              <Input placeholder="e.g. 5K / 10K / Half Marathon" value={form.target_distance} onChange={e => setForm(f => ({ ...f, target_distance: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Highlight Video URL</label>
              <Input placeholder="YouTube or Vimeo link" value={form.highlight_video_url} onChange={e => setForm(f => ({ ...f, highlight_video_url: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Recruiting Notes</label>
              <textarea
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-brand-500 resize-none h-24"
                placeholder="Academic interests, preferred region, notes for coaches..."
                value={form.recruiting_notes}
                onChange={e => setForm(f => ({ ...f, recruiting_notes: e.target.value }))}
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.visible} onChange={e => setForm(f => ({ ...f, visible: e.target.checked }))} />
              <span>Visible to college recruiters</span>
            </label>

            <Button variant="primary" loading={saving} onClick={save}>Save Profile</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Recruiter signup page ─────────────────────────────────────────────────────
export function RecruiterSignup() {
  const { profile } = useAuthStore();
  const [form, setForm] = useState({ name: '', school: '', division: 'D1', email: '' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const logout = async () => { const { supabase } = await import('../lib/supabaseClient'); await supabase.auth.signOut(); useAuthStore.getState().clearAuth(); };

  useEffect(() => {
    apiFetch('/api/recruiting/recruiter/status').then(setStatus).catch(() => {});
  }, []);

  const submit = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/recruiting/recruiter/signup', { method: 'POST', body: JSON.stringify(form) });
      if (data.url) window.location.href = data.url;
    } catch (e: any) { alert(e.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-2">College Recruiting Portal</h1>
        <p className="text-sm text-[var(--muted)] mb-8">Browse athlete recruiting profiles. Annual access — $499/year.</p>

        {status?.active ? (
          <div className="mb-6 bg-green-950/30 border border-green-800/40 rounded-xl p-5">
            <p className="font-semibold text-green-400 mb-1">Access Active</p>
            <p className="text-sm text-[var(--muted)]">{status.school} · {status.division}</p>
            {status.expires_at && <p className="text-xs text-[var(--muted)] mt-1">Expires {new Date(status.expires_at).toLocaleDateString()}</p>}
            <div className="mt-4">
              <Link to="/recruiting"><Button variant="primary">Browse Athletes</Button></Link>
            </div>
          </div>
        ) : (
          <Card title="Register as a College Recruiter">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Your Name</label>
                  <Input placeholder="Coach Jane Smith" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">School / University</label>
                  <Input placeholder="Stanford University" value={form.school} onChange={e => setForm(f => ({ ...f, school: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Division</label>
                  <select className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" value={form.division} onChange={e => setForm(f => ({ ...f, division: e.target.value }))}>
                    {['D1','D2','D3','NAIA','JUCO'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Contact Email</label>
                  <Input type="email" placeholder="coach@university.edu" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="pt-2">
                <Button variant="primary" loading={loading} onClick={submit} className="w-full">
                  Continue to Payment — $499/year
                </Button>
                <p className="text-xs text-[var(--muted)] text-center mt-2">Secure payment via Stripe</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Recruiter: browse athletes ────────────────────────────────────────────────
export function RecruiterDashboard() {
  const { profile } = useAuthStore();
  const [athletes, setAthletes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ graduation_year: '' });
  const logout = async () => { const { supabase } = await import('../lib/supabaseClient'); await supabase.auth.signOut(); useAuthStore.getState().clearAuth(); };

  useEffect(() => {
    const params = new URLSearchParams();
    if (filter.graduation_year) params.set('graduation_year', filter.graduation_year);
    apiFetch(`/api/recruiting/athletes?${params}`).then(setAthletes).catch(() => {}).finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl font-bold">Athlete Recruiting Profiles</h1>
          <select
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-brand-500"
            value={filter.graduation_year}
            onChange={e => setFilter(f => ({ ...f, graduation_year: e.target.value }))}
          >
            <option value="">All Graduation Years</option>
            {[2025,2026,2027,2028,2029].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : athletes.length === 0 ? (
          <Card><p className="text-center text-[var(--muted)] py-8">No recruiting profiles match your filters.</p></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {athletes.map((a: any) => (
              <div key={a.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">{a.athlete?.name ?? 'Athlete'}</h3>
                    {a.graduation_year && <p className="text-xs text-[var(--muted)]">Class of {a.graduation_year}</p>}
                  </div>
                  {a.athlete?.username && (
                    <a href={`/athlete/${a.athlete.username}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-400 hover:underline">Profile</a>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {a.gpa && <span className="text-xs bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-0.5">GPA {a.gpa}</span>}
                  {a.target_distance && <span className="text-xs bg-brand-950/40 border border-brand-800/40 text-brand-300 rounded px-2 py-0.5">{a.target_distance}</span>}
                </div>
                {a.recruiting_notes && <p className="text-xs text-[var(--muted)] line-clamp-3">{a.recruiting_notes}</p>}
                {a.highlight_video_url && (
                  <a href={a.highlight_video_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-400 hover:underline mt-2 block">Watch highlight</a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
