import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import Stripe from 'stripe';

const router = Router();

const profileSchema = z.object({
  gpa: z.number().min(0).max(4).optional(),
  graduation_year: z.number().int().min(2024).max(2035).optional(),
  target_distance: z.string().max(100).optional(),
  highlight_video_url: z.string().url().optional(),
  recruiting_notes: z.string().max(2000).optional(),
  visible: z.boolean().optional(),
});

router.get('/my-profile', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: athlete } = await supabase.from('athlete_profiles').select('id').eq('user_id', userId).single();
  if (!athlete) return res.status(403).json({ error: 'Athlete only' });

  const { data } = await supabase.from('recruiting_profiles').select('*').eq('athlete_id', athlete.id).single();
  res.json(data ?? null);
});

router.put('/my-profile', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: athlete } = await supabase.from('athlete_profiles').select('id').eq('user_id', userId).single();
  if (!athlete) return res.status(403).json({ error: 'Athlete only' });

  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data, error } = await supabase.from('recruiting_profiles').upsert({
    athlete_id: athlete.id,
    ...parsed.data,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'athlete_id' }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const recruiterSchema = z.object({
  name: z.string().min(2).max(100),
  school: z.string().min(2).max(200),
  division: z.enum(['D1','D2','D3','NAIA','JUCO']),
  email: z.string().email(),
});

router.post('/recruiter/signup', auth, async (req: AuthRequest, res: Response) => {
  if (!env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments not configured' });

  const userId = req.user!.id;
  const parsed = recruiterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { error: upsertErr } = await supabase.from('recruiter_accounts').upsert({
    user_id: userId,
    ...parsed.data,
    active: false,
  }, { onConflict: 'user_id' });
  if (upsertErr) return res.status(500).json({ error: upsertErr.message });

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const lineItem = env.STRIPE_RECRUITER_PRICE_ID
    ? { price: env.STRIPE_RECRUITER_PRICE_ID, quantity: 1 }
    : { price_data: { currency: 'usd' as const, product_data: { name: 'Laktic Recruiting Portal — Annual Access' }, unit_amount: 49900 }, quantity: 1 };

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [lineItem],
    success_url: `${env.FRONTEND_URL}/recruiting?access=1`,
    cancel_url: `${env.FRONTEND_URL}/recruiting/signup`,
    metadata: { type: 'recruiter', user_id: userId },
  });

  res.json({ url: session.url });
});

router.get('/recruiter/status', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data } = await supabase.from('recruiter_accounts').select('active, expires_at, school, division, name').eq('user_id', userId).single();
  res.json(data ?? { active: false });
});

router.get('/athletes', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: recruiter } = await supabase.from('recruiter_accounts').select('active, expires_at').eq('user_id', userId).single();
  if (!recruiter?.active) return res.status(403).json({ error: 'Active recruiter account required' });
  if (recruiter.expires_at && new Date(recruiter.expires_at) < new Date()) {
    return res.status(403).json({ error: 'Recruiter access expired' });
  }

  const { graduation_year } = req.query;
  let query = supabase
    .from('recruiting_profiles')
    .select(`
      id, gpa, graduation_year, target_distance, recruiting_notes, highlight_video_url,
      athlete:athlete_profiles(id, name, username)
    `)
    .eq('visible', true);

  if (graduation_year) query = query.eq('graduation_year', parseInt(graduation_year as string));

  const { data, error } = await query.limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
