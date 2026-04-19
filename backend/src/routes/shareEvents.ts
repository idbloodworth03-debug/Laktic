import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const trackShareSchema = z.object({
  event_type: z.enum(['race_result', 'milestone', 'challenge', 'prediction_pr']),
  platform: z.string().max(50).optional(),
});

const updateShareCardSchema = z.object({
  race_result_id: z.string().uuid(),
  share_card_url: z.string().url(),
});

// POST /api/share-events — track a share
router.post(
  '/',
  auth,
  requireAthlete,
  validate(trackShareSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { event_type, platform } = req.body;

    const { data, error } = await supabase
      .from('share_events')
      .insert({
        athlete_id: req.athlete.id,
        event_type,
        platform: platform ?? null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  })
);

// PATCH /api/share-events/race-card — save share card URL to race result
router.patch(
  '/race-card',
  auth,
  requireAthlete,
  validate(updateShareCardSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { race_result_id, share_card_url } = req.body;

    const { data, error } = await supabase
      .from('race_results')
      .update({ share_card_url })
      .eq('id', race_result_id)
      .eq('athlete_id', req.athlete.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  })
);

// GET /api/share-events/stats — athlete's share stats
router.get('/stats', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('share_events')
    .select('event_type, platform, shared_at')
    .eq('athlete_id', req.athlete.id)
    .order('shared_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data ?? []);
}));

export default router;
