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

router.get('/stats', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const [coaches, athletes, plans, purchases, certifications] = await Promise.all([
    supabase.from('coach_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('athlete_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('marketplace_plans').select('id', { count: 'exact', head: true }).eq('published', true),
    supabase.from('plan_purchases').select('id', { count: 'exact', head: true }),
    supabase.from('coach_certifications').select('id', { count: 'exact', head: true }).eq('passed', true),
  ]);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [newCoaches, newAthletes] = await Promise.all([
    supabase.from('coach_profiles').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    supabase.from('athlete_profiles').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
  ]);

  res.json({
    totals: {
      coaches: coaches.count ?? 0,
      athletes: athletes.count ?? 0,
      published_plans: plans.count ?? 0,
      plan_purchases: purchases.count ?? 0,
      certified_coaches: certifications.count ?? 0,
    },
    last_30_days: {
      new_coaches: newCoaches.count ?? 0,
      new_athletes: newAthletes.count ?? 0,
    },
  });
});

router.get('/coaches', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { data, error } = await supabase
    .from('coach_profiles')
    .select('id, name, username, license_type, certified_coach, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/athletes', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { data, error } = await supabase
    .from('athlete_profiles')
    .select('id, name, username, subscription_tier, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/revenue', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { data, error } = await supabase
    .from('plan_purchases')
    .select('id, amount_paid_cents, purchased_at, plan:marketplace_plans(title, price_cents, coach:coach_profiles(name))')
    .order('purchased_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  const total = (data ?? []).reduce((sum, p) => sum + (p.amount_paid_cents ?? 0), 0);
  res.json({ purchases: data, total_cents: total });
});

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

router.delete('/coaches/:id', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { error } = await supabase.from('coach_profiles').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.delete('/athletes/:id', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { error } = await supabase.from('athlete_profiles').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

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

  for (const c of newCoaches.data ?? []) {
    events.push({ type: 'coach_signup', id: c.id, label: c.name || c.username || 'Coach', ts: c.created_at });
  }
  for (const a of newAthletes.data ?? []) {
    events.push({ type: 'athlete_signup', id: a.id, label: a.name || a.username || 'Athlete', meta: a.subscription_tier, ts: a.created_at });
  }
  for (const p of newPosts.data ?? []) {
    events.push({ type: 'community_post', id: p.id, label: (p.content ?? '').slice(0, 80), meta: p.author_role, ts: p.created_at });
  }
  for (const s of newPlans.data ?? []) {
    events.push({ type: 'plan_generated', id: s.id, label: `Plan for athlete ${s.athlete_id?.slice(0, 8)}`, ts: s.created_at });
  }

  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  res.json(events.slice(0, limit));
});

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
