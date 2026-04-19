import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import Stripe from 'stripe';

const router = Router();

const planSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(2000),
  sport: z.string().default('running'),
  level: z.enum(['beginner','intermediate','advanced']).default('intermediate'),
  duration_weeks: z.number().int().min(1).max(52).default(12),
  price_cents: z.number().int().min(0).default(0),
  published: z.boolean().default(false),
  preview_pdf_url: z.string().url().optional(),
  full_pdf_url: z.string().url().optional(),
});

// ── Public: browse marketplace plans ─────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  const { sport, level, max_price } = req.query;
  let query = supabase
    .from('marketplace_plans')
    .select(`
      id, title, description, sport, level, duration_weeks, price_cents,
      preview_pdf_url, created_at,
      coach:coach_profiles(id, name, username, certified_coach)
    `)
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (sport) query = query.eq('sport', sport as string);
  if (level) query = query.eq('level', level as string);
  if (max_price) query = query.lte('price_cents', parseInt(max_price as string));

  const { data, error } = await query.limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Coach: manage own plans ───────────────────────────────────────────────────
router.get('/mine', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase.from('coach_profiles').select('id').eq('user_id', userId).single();
  if (!profile) return res.status(403).json({ error: 'Coach only' });

  const { data, error } = await supabase
    .from('marketplace_plans')
    .select('*')
    .eq('coach_id', profile.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase.from('coach_profiles').select('id').eq('user_id', userId).single();
  if (!profile) return res.status(403).json({ error: 'Coach only' });

  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data, error } = await supabase
    .from('marketplace_plans')
    .insert({ ...parsed.data, coach_id: profile.id })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.patch('/:planId', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase.from('coach_profiles').select('id').eq('user_id', userId).single();
  if (!profile) return res.status(403).json({ error: 'Coach only' });

  const parsed = planSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data, error } = await supabase
    .from('marketplace_plans')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', req.params.planId)
    .eq('coach_id', profile.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:planId', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase.from('coach_profiles').select('id').eq('user_id', userId).single();
  if (!profile) return res.status(403).json({ error: 'Coach only' });

  const { error } = await supabase
    .from('marketplace_plans')
    .delete()
    .eq('id', req.params.planId)
    .eq('coach_id', profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Athlete: purchased plans ──────────────────────────────────────────────────
router.get('/purchased', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase.from('athlete_profiles').select('id').eq('user_id', userId).single();
  if (!profile) return res.status(403).json({ error: 'Athlete only' });

  const { data, error } = await supabase
    .from('plan_purchases')
    .select(`
      id, purchased_at,
      plan:marketplace_plans(id, title, description, sport, level, duration_weeks, full_pdf_url,
        coach:coach_profiles(name, username))
    `)
    .eq('athlete_id', profile.id)
    .order('purchased_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Stripe checkout for plan purchase ────────────────────────────────────────
router.post('/:planId/checkout', auth, async (req: AuthRequest, res: Response) => {
  if (!env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments not configured' });

  const userId = req.user!.id;
  const { data: profile } = await supabase.from('athlete_profiles').select('id, name').eq('user_id', userId).single();
  if (!profile) return res.status(403).json({ error: 'Athlete only' });

  const { data: plan } = await supabase
    .from('marketplace_plans')
    .select('id, title, price_cents, published')
    .eq('id', req.params.planId)
    .single();
  if (!plan || !plan.published) return res.status(404).json({ error: 'Plan not found' });

  if (plan.price_cents === 0) {
    await supabase.from('plan_purchases').upsert({ plan_id: plan.id, athlete_id: profile.id, amount_paid_cents: 0 }, { onConflict: 'plan_id,athlete_id' });
    return res.json({ free: true });
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY!);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: plan.title },
        unit_amount: plan.price_cents,
      },
      quantity: 1,
    }],
    success_url: `${env.FRONTEND_URL}/athlete/plans?purchased=1`,
    cancel_url: `${env.FRONTEND_URL}/marketplace/plans`,
    metadata: { plan_id: plan.id, athlete_id: profile.id },
  });

  res.json({ url: session.url });
});

// ── Stripe webhook for purchase confirmation ──────────────────────────────────
router.post('/webhook', async (req: AuthRequest, res: Response) => {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return res.sendStatus(200);

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'] as string, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send('Webhook signature failed');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { plan_id, athlete_id, coach_id, type } = session.metadata ?? {};

    if (plan_id && athlete_id) {
      await supabase.from('plan_purchases').upsert({
        plan_id, athlete_id, stripe_session_id: session.id,
        amount_paid_cents: session.amount_total ?? 0,
      }, { onConflict: 'plan_id,athlete_id' });
    }
    if (type === 'pro_subscription' && athlete_id) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      await supabase.from('athlete_profiles').update({
        subscription_tier: 'pro',
        stripe_customer_id: session.customer as string,
        pro_expires_at: expiresAt.toISOString(),
      }).eq('id', athlete_id);
    }
    if (type === 'certification' && coach_id) {
      await supabase.from('coach_certifications').update({
        payment_completed: true, stripe_session_id: session.id,
      }).eq('coach_id', coach_id);
      await supabase.from('coach_profiles').update({
        certified_coach: true, certification_completed_at: new Date().toISOString(),
      }).eq('id', coach_id);
    }
    if (type === 'recruiter' && session.metadata?.user_id) {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      await supabase.from('recruiter_accounts').update({
        active: true, stripe_session_id: session.id, expires_at: expiresAt.toISOString(),
      }).eq('user_id', session.metadata.user_id);
    }
  }

  res.sendStatus(200);
});

export default router;
