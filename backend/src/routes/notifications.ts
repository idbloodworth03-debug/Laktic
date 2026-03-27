import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { pushSubscribeSchema, pushUnsubscribeSchema } from '../schemas';
import { env } from '../config/env';
import { vapidConfigured } from '../services/notificationService';

const router = Router();

// GET /api/notifications/vapid-key — return public VAPID key
router.get(
  '/vapid-key',
  asyncHandler(async (_req, res) => {
    if (!vapidConfigured || !env.VAPID_PUBLIC_KEY) {
      return res.json({ enabled: false, key: null });
    }
    res.json({ enabled: true, key: env.VAPID_PUBLIC_KEY });
  })
);

// POST /api/notifications/subscribe — save a Web Push subscription
router.post(
  '/subscribe',
  auth,
  validate(pushSubscribeSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { endpoint, p256dh, auth: authKey } = req.body;

    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { user_id: req.user!.id, endpoint, p256dh, auth: authKey },
        { onConflict: 'user_id,endpoint' }
      )
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, id: data.id });
  })
);

// DELETE /api/notifications/unsubscribe — remove a subscription
router.delete(
  '/unsubscribe',
  auth,
  validate(pushUnsubscribeSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { endpoint } = req.body;

    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', req.user!.id)
      .eq('endpoint', endpoint);

    res.json({ ok: true });
  })
);

// GET /api/notifications/status — check if user has an active subscription
router.get(
  '/status',
  auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', req.user!.id)
      .limit(1);

    res.json({ subscribed: (data?.length ?? 0) > 0 });
  })
);

export default router;
