import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireCoach, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { env } from '../config/env';
import { marketplaceApplySchema, marketplaceRejectSchema } from '../schemas';

const router = Router();

// ── Guard: admin only ─────────────────────────────────────────────────────────
function requireAdmin(req: AuthRequest, res: any, next: any) {
  if (!env.ADMIN_EMAIL) return res.status(403).json({ error: 'Admin not configured' });
  if (req.user?.email !== env.ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// GET /api/marketplace/coaches — public list of approved coaches
router.get(
  '/coaches',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('marketplace_coaches')
      .select(`
        id, bio, credentials, specialization, price_per_month, approved_at,
        coach_profiles!coach_id (
          id, name, school_or_org,
          coach_bots (id, name, philosophy, event_focus, level_focus, is_published)
        )
      `)
      .eq('approval_status', 'approved')
      .order('approved_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  })
);

// GET /api/marketplace/coaches/:id — single approved coach profile
router.get(
  '/coaches/:id',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('marketplace_coaches')
      .select(`
        id, bio, credentials, specialization, price_per_month, approved_at,
        coach_profiles!coach_id (
          id, name, school_or_org,
          coach_bots (id, name, philosophy, event_focus, level_focus, is_published,
            bot_workouts (day_of_week, title, description, distance_miles, pace_guideline)
          )
        )
      `)
      .eq('id', req.params.id)
      .eq('approval_status', 'approved')
      .single();

    if (error || !data) return res.status(404).json({ error: 'Coach not found' });
    res.json(data);
  })
);

// POST /api/marketplace/apply — coach submits marketplace application
router.post(
  '/apply',
  auth,
  requireCoach,
  validate(marketplaceApplySchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { bio, credentials, specialization, price_per_month } = req.body;

    // Check coach has a published bot
    const { data: bot } = await supabase
      .from('coach_bots')
      .select('id, is_published')
      .eq('coach_id', req.coach.id)
      .single();

    if (!bot?.is_published) {
      return res.status(400).json({ error: 'You must publish your coaching bot before applying to the marketplace.' });
    }

    const { data, error } = await supabase
      .from('marketplace_coaches')
      .upsert(
        {
          coach_id: req.coach.id,
          bio,
          credentials,
          specialization,
          price_per_month,
          approval_status: 'pending',
          rejection_reason: null,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'coach_id' }
      )
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// GET /api/marketplace/my-application — coach checks their own application status
router.get(
  '/my-application',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data } = await supabase
      .from('marketplace_coaches')
      .select('*')
      .eq('coach_id', req.coach.id)
      .single();

    res.json(data || null);
  })
);

// ── Admin endpoints ───────────────────────────────────────────────────────────

// GET /api/marketplace/admin/pending — list pending applications
router.get(
  '/admin/pending',
  auth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('marketplace_coaches')
      .select(`
        *,
        coach_profiles!coach_id (id, name, school_or_org,
          coach_bots (id, name, philosophy, is_published)
        )
      `)
      .eq('approval_status', 'pending')
      .order('submitted_at', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  })
);

// POST /api/marketplace/admin/approve/:id
router.post(
  '/admin/approve/:id',
  auth,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data, error } = await supabase
      .from('marketplace_coaches')
      .update({
        approval_status: 'approved',
        rejection_reason: null,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('approval_status', 'pending')
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: 'Application not found or already processed' });
    res.json(data);
  })
);

// POST /api/marketplace/admin/reject/:id
router.post(
  '/admin/reject/:id',
  auth,
  requireAdmin,
  validate(marketplaceRejectSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { rejection_reason } = req.body;

    const { data, error } = await supabase
      .from('marketplace_coaches')
      .update({
        approval_status: 'rejected',
        rejection_reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: 'Application not found' });
    res.json(data);
  })
);

export default router;
