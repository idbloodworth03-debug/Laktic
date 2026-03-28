import { Router, Response } from 'express';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import Stripe from 'stripe';

const router = Router();

router.get('/status', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase
    .from('athlete_profiles')
    .select('subscription_tier, pro_expires_at, stripe_customer_id')
    .eq('user_id', userId)
    .single();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  if (profile.subscription_tier === 'pro' && profile.pro_expires_at) {
    if (new Date(profile.pro_expires_at) < new Date()) {
      await supabase.from('athlete_profiles').update({ subscription_tier: 'free' }).eq('user_id', userId);
      return res.json({ tier: 'free', expires_at: null });
    }
  }

  res.json({ tier: profile.subscription_tier, expires_at: profile.pro_expires_at });
});

router.post('/checkout', auth, async (req: AuthRequest, res: Response) => {
  if (!env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments not configured' });
  if (!env.STRIPE_ATHLETE_PRO_PRICE_ID) return res.status(503).json({ error: 'Pro price not configured' });

  const userId = req.user!.id;
  const { data: profile } = await supabase
    .from('athlete_profiles')
    .select('id, name, subscription_tier')
    .eq('user_id', userId)
    .single();
  if (!profile) return res.status(403).json({ error: 'Athlete only' });
  if (profile.subscription_tier === 'pro') return res.status(400).json({ error: 'Already Pro' });

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: env.STRIPE_ATHLETE_PRO_PRICE_ID, quantity: 1 }],
    success_url: `${env.FRONTEND_URL}/athlete/dashboard?pro=1`,
    cancel_url: `${env.FRONTEND_URL}/athlete/dashboard`,
    metadata: { type: 'pro_subscription', athlete_id: profile.id },
  });

  res.json({ url: session.url });
});

router.post('/cancel', auth, async (req: AuthRequest, res: Response) => {
  await supabase
    .from('athlete_profiles')
    .update({ subscription_tier: 'free', pro_expires_at: null })
    .eq('user_id', req.user!.id);
  res.json({ ok: true });
});

export default router;
