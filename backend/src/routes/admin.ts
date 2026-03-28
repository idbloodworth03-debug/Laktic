import { Router, Response } from 'express';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';

const router = Router();

async function requireAdmin(req: AuthRequest, res: Response): Promise<boolean> {
  if (!env.ADMIN_EMAIL) { res.status(503).json({ error: 'Admin not configured' }); return false; }
  const { data: { user } } = await supabase.auth.admin.getUserById(req.user!.id);
  if (!user || user.email !== env.ADMIN_EMAIL) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

router.get('/stats', auth, async (req: AuthRequest, res: Response) => {
  if (!await requireAdmin(req, res)) return;

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

router.get('/coaches', auth, async (req: AuthRequest, res: Response) => {
  if (!await requireAdmin(req, res)) return;

  const { data, error } = await supabase
    .from('coach_profiles')
    .select('id, name, username, license_type, certified_coach, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/athletes', auth, async (req: AuthRequest, res: Response) => {
  if (!await requireAdmin(req, res)) return;

  const { data, error } = await supabase
    .from('athlete_profiles')
    .select('id, name, username, subscription_tier, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/revenue', auth, async (req: AuthRequest, res: Response) => {
  if (!await requireAdmin(req, res)) return;

  const { data, error } = await supabase
    .from('plan_purchases')
    .select('id, amount_paid_cents, purchased_at, plan:marketplace_plans(title, price_cents, coach:coach_profiles(name))')
    .order('purchased_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  const total = (data ?? []).reduce((sum, p) => sum + (p.amount_paid_cents ?? 0), 0);
  res.json({ purchases: data, total_cents: total });
});

router.patch('/coaches/:id', auth, async (req: AuthRequest, res: Response) => {
  if (!await requireAdmin(req, res)) return;

  const allowed = ['license_type','certified_coach'];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) update[key] = req.body[key];
  }

  const { data, error } = await supabase.from('coach_profiles').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/coaches/:id', auth, async (req: AuthRequest, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  const { error } = await supabase.from('coach_profiles').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.delete('/athletes/:id', auth, async (req: AuthRequest, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  const { error } = await supabase.from('athlete_profiles').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
