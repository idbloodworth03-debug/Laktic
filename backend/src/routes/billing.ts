import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { env } from '../config/env';
import { checkoutSchema } from '../schemas';
import * as billing from '../services/billingService';

const router = Router();

router.post('/checkout', auth, validate(checkoutSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe billing is not configured' });
    const { plan_type } = req.body;
    const userId = req.user!.id;
    const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(userId);
    if (userErr || !user?.email) return res.status(400).json({ error: 'Could not retrieve user email' });
    const role = plan_type === 'coach_team' ? 'coach' : 'athlete';
    const checkoutUrl = await billing.createCheckoutSession(userId, user.email, role, plan_type);
    res.json({ url: checkoutUrl });
  })
);

router.post('/portal', auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const status = await billing.getSubscriptionStatus(req.user!.id);
    if (!status.stripe_customer_id) return res.status(400).json({ error: 'No billing account found.' });
    const portalUrl = await billing.createPortalSession(status.stripe_customer_id);
    res.json({ url: portalUrl });
  })
);

router.get('/status', auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const status = await billing.getSubscriptionStatus(req.user!.id);
    res.json(status);
  })
);

router.post('/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return res.status(500).json({ error: 'Stripe webhook not configured' });
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' });
    const sig = req.headers['stripe-signature'] as string;
    if (!sig) return res.status(400).json({ error: 'Missing Stripe signature header' });
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      console.error('[Billing] Sig verification failed:', err.message); // eslint-disable-line no-console
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }
    await billing.handleWebhookEvent(event);
    res.json({ received: true });
  })
);

export default router;
