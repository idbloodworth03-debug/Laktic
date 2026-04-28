import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase';
import { env } from '../config/env';

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const key = req.headers['x-admin-key'];
  if (!env.ADMIN_SECRET || key !== env.ADMIN_SECRET) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/stats', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [coaches, athletes, plans, purchases, certifications, bans, activeToday, pendingCoaches, newUsers, suspended] = await Promise.all([
    supabase.from('coach_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('athlete_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('marketplace_plans').select('id', { count: 'exact', head: true }).eq('published', true),
    supabase.from('plan_purchases').select('id', { count: 'exact', head: true }),
    supabase.from('coach_certifications').select('id', { count: 'exact', head: true }).eq('passed', true),
    supabase.from('banned_emails').select('id', { count: 'exact', head: true }),
    supabase.from('daily_readiness').select('athlete_id', { count: 'exact', head: true }).eq('date', today),
    supabase.from('coach_profiles').select('id', { count: 'exact', head: true }).eq('certified_coach', false).eq('suspended', false),
    supabase.from('athlete_profiles').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    supabase.from('athlete_profiles').select('id', { count: 'exact', head: true }).eq('suspended', true),
  ]);

  const [newCoaches, newAthletes, prevWeekAthletes, newCoaches7d, prevWeekCoaches] = await Promise.all([
    supabase.from('coach_profiles').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    supabase.from('athlete_profiles').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    supabase.from('athlete_profiles').select('id', { count: 'exact', head: true }).gte('created_at', fourteenDaysAgo).lt('created_at', sevenDaysAgo),
    supabase.from('coach_profiles').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    supabase.from('coach_profiles').select('id', { count: 'exact', head: true }).gte('created_at', fourteenDaysAgo).lt('created_at', sevenDaysAgo),
  ]);

  res.json({
    totals: {
      coaches: coaches.count ?? 0,
      athletes: athletes.count ?? 0,
      total_users: (coaches.count ?? 0) + (athletes.count ?? 0),
      published_plans: plans.count ?? 0,
      plan_purchases: purchases.count ?? 0,
      certified_coaches: certifications.count ?? 0,
      banned_emails: bans.count ?? 0,
      suspended_athletes: suspended.count ?? 0,
      active_today: activeToday.count ?? 0,
      pending_approvals: pendingCoaches.count ?? 0,
      new_users_7d: newUsers.count ?? 0,
    },
    last_30_days: {
      new_coaches: newCoaches.count ?? 0,
      new_athletes: newAthletes.count ?? 0,
    },
    week_over_week: {
      new_athletes_7d: newUsers.count ?? 0,
      new_athletes_prev_7d: prevWeekAthletes.count ?? 0,
      new_coaches_7d: newCoaches7d.count ?? 0,
      new_coaches_prev_7d: prevWeekCoaches.count ?? 0,
    },
  });
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/coaches', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  let { data, error } = await supabase
    .from('coach_profiles')
    .select('id, user_id, name, username, license_type, certified_coach, suspended, created_at, last_active')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    ({ data, error } = (await supabase
      .from('coach_profiles')
      .select('id, user_id, name, username, license_type, certified_coach, suspended, created_at')
      .order('created_at', { ascending: false })
      .limit(500)) as any);
  }

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/athletes', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  let { data, error } = await supabase
    .from('athlete_profiles')
    .select('id, user_id, name, username, subscription_tier, suspended, created_at, last_active')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    ({ data, error } = (await supabase
      .from('athlete_profiles')
      .select('id, user_id, name, username, subscription_tier, suspended, created_at')
      .order('created_at', { ascending: false })
      .limit(500)) as any);
  }

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Suspend / unsuspend ───────────────────────────────────────────────────────

router.patch('/coaches/:id/suspend', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { suspended } = req.body;
  const { data, error } = await supabase.from('coach_profiles').update({ suspended: !!suspended }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.patch('/athletes/:id/suspend', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { suspended } = req.body;
  const { data, error } = await supabase.from('athlete_profiles').update({ suspended: !!suspended }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Update coach fields ───────────────────────────────────────────────────────

router.patch('/coaches/:id', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const allowed = ['license_type', 'certified_coach'];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) update[key] = req.body[key];
  }

  const { data, error } = await supabase.from('coach_profiles').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Delete (profile + auth user) ──────────────────────────────────────────────

router.delete('/coaches/:id', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { data: coach } = await supabase.from('coach_profiles').select('user_id').eq('id', req.params.id).single();
  const { error } = await supabase.from('coach_profiles').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  if (coach?.user_id) {
    await supabase.auth.admin.deleteUser(coach.user_id).catch(() => {});
  }
  res.json({ ok: true });
});

router.delete('/athletes/:id', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { data: athlete } = await supabase.from('athlete_profiles').select('user_id').eq('id', req.params.id).single();
  const { error } = await supabase.from('athlete_profiles').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  if (athlete?.user_id) {
    await supabase.auth.admin.deleteUser(athlete.user_id).catch(() => {});
  }
  res.json({ ok: true });
});

// ── Banned emails ─────────────────────────────────────────────────────────────

router.get('/bans', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { data, error } = await supabase.from('banned_emails').select('*').order('banned_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/bans', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { email, reason } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const { data, error } = await supabase
    .from('banned_emails')
    .insert({ email: email.toLowerCase().trim(), reason: reason ?? null })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/bans/:id', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { error } = await supabase.from('banned_emails').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Revenue ───────────────────────────────────────────────────────────────────

router.get('/revenue', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { data, error } = await supabase
    .from('plan_purchases')
    .select('id, amount_paid_cents, purchased_at, plan:marketplace_plans(title, price_cents, coach:coach_profiles(name))')
    .order('purchased_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  const purchases = data ?? [];
  const total = purchases.reduce((sum, p) => sum + (p.amount_paid_cents ?? 0), 0);

  // Monthly breakdown (last 12 months)
  const monthMap: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    monthMap[d.toISOString().slice(0, 7)] = 0;
  }
  for (const p of purchases) {
    const m = (p.purchased_at as string).slice(0, 7);
    if (m in monthMap) monthMap[m] += p.amount_paid_cents ?? 0;
  }
  const monthly = Object.entries(monthMap).map(([month, cents]) => ({ month, cents }));

  // Per-coach breakdown
  const coachMap: Record<string, { name: string; cents: number; count: number }> = {};
  for (const p of purchases) {
    const name = (p.plan as any)?.coach?.name ?? 'Unknown';
    if (!coachMap[name]) coachMap[name] = { name, cents: 0, count: 0 };
    coachMap[name].cents += p.amount_paid_cents ?? 0;
    coachMap[name].count++;
  }
  const by_coach = Object.values(coachMap).sort((a, b) => b.cents - a.cents);

  // Per-plan breakdown
  const planMap: Record<string, { title: string; cents: number; count: number; avg_cents: number }> = {};
  for (const p of purchases) {
    const title = (p.plan as any)?.title ?? 'Unknown Plan';
    if (!planMap[title]) planMap[title] = { title, cents: 0, count: 0, avg_cents: 0 };
    planMap[title].cents += p.amount_paid_cents ?? 0;
    planMap[title].count++;
  }
  for (const k of Object.keys(planMap)) {
    planMap[k].avg_cents = Math.round(planMap[k].cents / planMap[k].count);
  }
  const by_plan = Object.values(planMap).sort((a, b) => b.cents - a.cents);

  // Current month and last month
  const nowMonth = new Date().toISOString().slice(0, 7);
  const lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);
  const current_month_cents = monthly.find(m => m.month === nowMonth)?.cents ?? 0;
  const last_month_cents = monthly.find(m => m.month === lastMonth)?.cents ?? 0;
  const mom_growth_pct = last_month_cents === 0 ? null : Math.round(((current_month_cents - last_month_cents) / last_month_cents) * 100);
  const best_month = monthly.reduce((best, m) => m.cents > best.cents ? m : best, { month: '', cents: 0 });

  res.json({ purchases, total_cents: total, monthly, by_coach, by_plan, current_month_cents, last_month_cents, mom_growth_pct, best_month });
});

// ── Activity feed ─────────────────────────────────────────────────────────────

router.get('/activity-feed', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const [newCoaches, newAthletes, newPosts, newPlans] = await Promise.all([
    supabase.from('coach_profiles').select('id, name, username, created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('athlete_profiles').select('id, name, username, subscription_tier, created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('community_posts').select('id, content, created_at, author_id, author_role').order('created_at', { ascending: false }).limit(limit),
    supabase.from('season_plans').select('id, athlete_id, created_at').order('created_at', { ascending: false }).limit(limit),
  ]);

  const events: Array<{ type: string; id: string; label: string; meta?: string; ts: string }> = [];

  for (const c of newCoaches.data ?? []) events.push({ type: 'coach_signup', id: c.id, label: c.name || c.username || 'Coach', ts: c.created_at });
  for (const a of newAthletes.data ?? []) events.push({ type: 'athlete_signup', id: a.id, label: a.name || a.username || 'Athlete', meta: a.subscription_tier, ts: a.created_at });
  for (const p of newPosts.data ?? []) events.push({ type: 'community_post', id: p.id, label: (p.content ?? '').slice(0, 80), meta: p.author_role, ts: p.created_at });
  for (const s of newPlans.data ?? []) events.push({ type: 'plan_generated', id: s.id, label: `Plan for athlete ${s.athlete_id?.slice(0, 8)}`, ts: s.created_at });

  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  res.json(events.slice(0, limit));
});

// ── Combined users list (coaches + athletes, with computed status) ─────────────

router.get('/users', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  let [coaches, athletes] = await Promise.all([
    supabase.from('coach_profiles').select('id, user_id, name, username, license_type, certified_coach, suspended, created_at, last_active').order('created_at', { ascending: false }).limit(500),
    supabase.from('athlete_profiles').select('id, user_id, name, username, subscription_tier, suspended, created_at, last_active').order('created_at', { ascending: false }).limit(500),
  ]);
  if (coaches.error) coaches = (await supabase.from('coach_profiles').select('id, user_id, name, username, license_type, certified_coach, suspended, created_at').order('created_at', { ascending: false }).limit(500)) as any;
  if (athletes.error) athletes = (await supabase.from('athlete_profiles').select('id, user_id, name, username, subscription_tier, suspended, created_at').order('created_at', { ascending: false }).limit(500)) as any;

  const users = [
    ...(coaches.data ?? []).map((c: any) => {
      let status: string;
      if (c.suspended) status = 'suspended';
      else if (!c.certified_coach) status = 'pending';
      else if (c.created_at > sevenDaysAgo) status = 'new';
      else status = 'active';
      return { ...c, role: 'coach', status };
    }),
    ...(athletes.data ?? []).map((a: any) => {
      let status: string;
      if (a.suspended) status = 'suspended';
      else if (a.created_at > sevenDaysAgo) status = 'new';
      else status = 'active';
      return { ...a, role: 'athlete', status };
    }),
  ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  res.json(users);
});

// ── Alerts (generated from platform state) ────────────────────────────────────

router.get('/alerts', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

  const [pendingCoaches, suspendedAthletes, newAthletes] = await Promise.all([
    supabase.from('coach_profiles').select('id, name, username, created_at').eq('certified_coach', false).eq('suspended', false).order('created_at', { ascending: false }).limit(50),
    supabase.from('athlete_profiles').select('id, name').eq('suspended', true).limit(50),
    supabase.from('athlete_profiles').select('id, name, created_at').gte('created_at', oneDayAgo).order('created_at', { ascending: false }).limit(20),
  ]);

  const alerts: Array<{ id: string; severity: string; title: string; detail: string; ts: string }> = [];

  const pending = pendingCoaches.data ?? [];
  if (pending.length > 0) {
    alerts.push({
      id: 'pending_coaches',
      severity: 'medium',
      title: `${pending.length} coach${pending.length > 1 ? 'es' : ''} awaiting certification`,
      detail: pending.slice(0, 5).map((c: any) => c.name || c.username || 'Coach').join(', ') + (pending.length > 5 ? ` +${pending.length - 5} more` : ''),
      ts: pending[0].created_at,
    });
  }

  const suspended = suspendedAthletes.data ?? [];
  if (suspended.length > 0) {
    alerts.push({
      id: 'suspended_users',
      severity: 'high',
      title: `${suspended.length} athlete${suspended.length > 1 ? 's' : ''} currently suspended`,
      detail: suspended.slice(0, 5).map((u: any) => u.name || 'Athlete').join(', ') + (suspended.length > 5 ? ` +${suspended.length - 5} more` : ''),
      ts: new Date().toISOString(),
    });
  }

  const newA = newAthletes.data ?? [];
  if (newA.length > 0) {
    alerts.push({
      id: 'new_athletes',
      severity: 'info',
      title: `${newA.length} new athlete${newA.length > 1 ? 's' : ''} joined in the last 24h`,
      detail: newA.slice(0, 5).map((u: any) => u.name || 'Athlete').join(', ') + (newA.length > 5 ? ` +${newA.length - 5} more` : ''),
      ts: newA[0].created_at,
    });
  }

  res.json(alerts);
});

// ── Growth chart ──────────────────────────────────────────────────────────────

router.get('/growth', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const days = 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [coaches, athletes] = await Promise.all([
    supabase.from('coach_profiles').select('created_at').gte('created_at', since),
    supabase.from('athlete_profiles').select('created_at').gte('created_at', since),
  ]);

  const map: Record<string, { coaches: number; athletes: number }> = {};
  const dateLabel = (iso: string) => iso.slice(0, 10);

  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    map[dateLabel(d.toISOString())] = { coaches: 0, athletes: 0 };
  }
  for (const c of coaches.data ?? []) { const d = dateLabel(c.created_at); if (map[d]) map[d].coaches++; }
  for (const a of athletes.data ?? []) { const d = dateLabel(a.created_at); if (map[d]) map[d].athletes++; }

  res.json(Object.entries(map).map(([date, counts]) => ({ date, ...counts })));
});

export default router;
