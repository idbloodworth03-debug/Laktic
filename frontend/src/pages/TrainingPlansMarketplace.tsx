import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { Navbar, Card, Button, Spinner, Badge } from '../components/ui';

interface Plan {
  id: string;
  title: string;
  description: string;
  sport: string;
  level: string;
  duration_weeks: number;
  price_cents: number;
  preview_pdf_url?: string;
  created_at: string;
  coach: { id: string; name: string; username?: string; certified_coach: boolean };
}

export function TrainingPlansMarketplace() {
  const { profile, role } = useAuthStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ sport: '', level: '' });
  const [buying, setBuying] = useState<string | null>(null);

  const logout = async () => { const { supabase } = await import('../lib/supabaseClient'); await supabase.auth.signOut(); useAuthStore.getState().clearAuth(); };

  useEffect(() => {
    const params = new URLSearchParams();
    if (filter.sport) params.set('sport', filter.sport);
    if (filter.level) params.set('level', filter.level);
    apiFetch(`/api/marketplace-plans?${params}`).then(setPlans).catch(() => {}).finally(() => setLoading(false));
  }, [filter]);

  const handleBuy = async (plan: Plan) => {
    if (plan.price_cents === 0) {
      setBuying(plan.id);
      try {
        const res = await apiFetch(`/api/marketplace-plans/${plan.id}/checkout`, { method: 'POST' });
        if (res.free) { alert('Plan added to your library!'); }
        else if (res.url) window.location.href = res.url;
      } catch (e: any) { alert(e.message); }
      setBuying(null);
    } else {
      setBuying(plan.id);
      try {
        const res = await apiFetch(`/api/marketplace-plans/${plan.id}/checkout`, { method: 'POST' });
        if (res.url) window.location.href = res.url;
      } catch (e: any) { alert(e.message); }
      setBuying(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role={role ?? 'athlete'} name={profile?.name} onLogout={logout} />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Training Plan Marketplace</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Expert plans from certified coaches</p>
          </div>
          {role === 'athlete' && (
            <Link to="/athlete/plans"><Button variant="ghost" size="sm">My Plans</Button></Link>
          )}
          {role === 'coach' && (
            <Link to="/coach/plans"><Button variant="primary" size="sm">Manage My Plans</Button></Link>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <select
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-brand-500"
            value={filter.sport}
            onChange={e => setFilter(f => ({ ...f, sport: e.target.value }))}
          >
            <option value="">All Sports</option>
            <option value="running">Running</option>
            <option value="cycling">Cycling</option>
            <option value="triathlon">Triathlon</option>
            <option value="swimming">Swimming</option>
          </select>
          <select
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-brand-500"
            value={filter.level}
            onChange={e => setFilter(f => ({ ...f, level: e.target.value }))}
          >
            <option value="">All Levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : plans.length === 0 ? (
          <Card>
            <p className="text-center text-[var(--muted)] py-8">No plans found. {role === 'coach' ? 'Create the first one!' : 'Check back soon.'}</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map(plan => (
              <div key={plan.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-[var(--text)] leading-tight">{plan.title}</h3>
                  {plan.coach.certified_coach && <Badge label="Certified" color="green" />}
                </div>
                <p className="text-sm text-[var(--muted)] line-clamp-3 flex-1">{plan.description}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs bg-brand-950/40 border border-brand-800/40 text-brand-300 rounded px-2 py-0.5 capitalize">{plan.sport}</span>
                  <span className="text-xs bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] rounded px-2 py-0.5 capitalize">{plan.level}</span>
                  <span className="text-xs bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] rounded px-2 py-0.5">{plan.duration_weeks}wk</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg text-[var(--text)]">
                      {plan.price_cents === 0 ? 'Free' : `$${(plan.price_cents / 100).toFixed(2)}`}
                    </p>
                    {plan.coach.username ? (
                      <Link to={`/coach/${plan.coach.username}`} className="text-xs text-brand-400 hover:underline">{plan.coach.name}</Link>
                    ) : (
                      <p className="text-xs text-[var(--muted)]">{plan.coach.name}</p>
                    )}
                  </div>
                  {role === 'athlete' && (
                    <Button variant="primary" size="sm" loading={buying === plan.id} onClick={() => handleBuy(plan)}>
                      {plan.price_cents === 0 ? 'Get Free' : 'Buy'}
                    </Button>
                  )}
                </div>
                {plan.preview_pdf_url && (
                  <a href={plan.preview_pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--muted)] hover:text-brand-400 underline">Preview PDF</a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MyPlans() {
  const { profile, role } = useAuthStore();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const logout = async () => { const { supabase } = await import('../lib/supabaseClient'); await supabase.auth.signOut(); useAuthStore.getState().clearAuth(); };

  useEffect(() => {
    apiFetch('/api/marketplace-plans/purchased').then(setPlans).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role={role ?? 'athlete'} name={profile?.name} onLogout={logout} />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl font-bold">My Training Plans</h1>
          <Link to="/marketplace/plans"><Button variant="ghost" size="sm">Browse Marketplace</Button></Link>
        </div>
        {loading ? <div className="flex justify-center py-16"><Spinner /></div> : plans.length === 0 ? (
          <Card><p className="text-center text-[var(--muted)] py-8">No plans purchased yet. <Link to="/marketplace/plans" className="text-brand-400 hover:underline">Browse the marketplace</Link>.</p></Card>
        ) : (
          <div className="flex flex-col gap-4">
            {plans.map((p: any) => (
              <div key={p.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{p.plan?.title}</h3>
                    <p className="text-sm text-[var(--muted)]">{p.plan?.coach?.name} · {p.plan?.duration_weeks}wk · {p.plan?.level}</p>
                  </div>
                  {p.plan?.full_pdf_url && (
                    <a href={p.plan.full_pdf_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="secondary" size="sm">Download PDF</Button>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CoachPlanManage() {
  const { profile } = useAuthStore();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', sport: 'running', level: 'intermediate', duration_weeks: 12, price_cents: 0, published: false, preview_pdf_url: '', full_pdf_url: '' });
  const logout = async () => { const { supabase } = await import('../lib/supabaseClient'); await supabase.auth.signOut(); useAuthStore.getState().clearAuth(); };

  const load = () => {
    apiFetch('/api/marketplace-plans/mine').then(setPlans).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/marketplace-plans', { method: 'POST', body: JSON.stringify({ ...form, price_cents: Math.round(form.price_cents * 100) }) });
      setShowForm(false);
      setForm({ title: '', description: '', sport: 'running', level: 'intermediate', duration_weeks: 12, price_cents: 0, published: false, preview_pdf_url: '', full_pdf_url: '' });
      load();
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const togglePublish = async (plan: any) => {
    await apiFetch(`/api/marketplace-plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ published: !plan.published }) });
    load();
  };

  const del = async (planId: string) => {
    if (!confirm('Delete this plan?')) return;
    await apiFetch(`/api/marketplace-plans/${planId}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl font-bold">My Training Plans</h1>
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>+ New Plan</Button>
        </div>

        {showForm && (
          <Card title="Create Plan" className="mb-6">
            <div className="flex flex-col gap-3">
              <input className="input-base" placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <textarea className="input-base resize-none h-24" placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className="input-base" value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}>
                  <option value="running">Running</option>
                  <option value="cycling">Cycling</option>
                  <option value="triathlon">Triathlon</option>
                  <option value="swimming">Swimming</option>
                </select>
                <select className="input-base" value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
                <input className="input-base" type="number" placeholder="Duration (weeks)" value={form.duration_weeks} onChange={e => setForm(f => ({ ...f, duration_weeks: parseInt(e.target.value) || 12 }))} />
                <input className="input-base" type="number" step="0.01" placeholder="Price ($)" value={form.price_cents} onChange={e => setForm(f => ({ ...f, price_cents: parseFloat(e.target.value) || 0 }))} />
              </div>
              <input className="input-base" placeholder="Preview PDF URL (optional)" value={form.preview_pdf_url} onChange={e => setForm(f => ({ ...f, preview_pdf_url: e.target.value }))} />
              <input className="input-base" placeholder="Full PDF URL (optional)" value={form.full_pdf_url} onChange={e => setForm(f => ({ ...f, full_pdf_url: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} />
                Publish immediately
              </label>
              <div className="flex gap-2">
                <Button variant="primary" loading={saving} onClick={save}>Save Plan</Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        {loading ? <div className="flex justify-center py-16"><Spinner /></div> : plans.length === 0 ? (
          <Card><p className="text-center text-[var(--muted)] py-8">No plans yet. Create your first training plan!</p></Card>
        ) : (
          <div className="flex flex-col gap-3">
            {plans.map(plan => (
              <div key={plan.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{plan.title}</h3>
                    <Badge label={plan.published ? 'Published' : 'Draft'} color={plan.published ? 'green' : 'gray'} />
                  </div>
                  <p className="text-sm text-[var(--muted)]">{plan.sport} · {plan.level} · {plan.duration_weeks}wk · {plan.price_cents === 0 ? 'Free' : `$${(plan.price_cents / 100).toFixed(2)}`}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => togglePublish(plan)}>{plan.published ? 'Unpublish' : 'Publish'}</Button>
                  <Button variant="danger" size="sm" onClick={() => del(plan.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
