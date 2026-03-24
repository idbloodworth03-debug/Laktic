import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireCoach, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import {
  coachProfileSchema,
  botCreateSchema,
  botUpdateSchema,
  workoutSchema,
  knowledgeCreateSchema,
  knowledgeUpdateSchema
} from '../schemas';

const router = Router();

// POST /api/coach/profile
router.post(
  '/profile',
  auth,
  validate(coachProfileSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { name, school_or_org } = req.body;

    const { data, error } = await supabase
      .from('coach_profiles')
      .insert({ user_id: req.user!.id, name, school_or_org })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// GET /api/coach/bot
router.get(
  '/bot',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('*').eq('coach_id', req.coach.id).single();

    if (!bot) return res.json({ bot: null });

    const { data: workouts } = await supabase
      .from('bot_workouts')
      .select('*')
      .eq('bot_id', bot.id)
      .order('day_of_week');

    const { data: knowledge } = await supabase
      .from('coach_knowledge_documents')
      .select('*')
      .eq('coach_bot_id', bot.id)
      .order('document_type')
      .order('created_at');

    res.json({ bot, workouts: workouts || [], knowledge: knowledge || [] });
  })
);

// POST /api/coach/bot
router.post(
  '/bot',
  auth,
  requireCoach,
  validate(botCreateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { name, philosophy, event_focus, level_focus } = req.body;
    const existing = await supabase.from('coach_bots').select('id').eq('coach_id', req.coach.id).single();
    if (existing.data) return res.status(400).json({ error: 'Bot already exists' });

    const { data, error } = await supabase
      .from('coach_bots')
      .insert({ coach_id: req.coach.id, name, philosophy, event_focus, level_focus })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// PATCH /api/coach/bot
router.patch(
  '/bot',
  auth,
  requireCoach,
  validate(botUpdateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase
      .from('coach_bots')
      .select('id, is_published')
      .eq('coach_id', req.coach.id)
      .single();
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    if (req.body.is_published === false && bot.is_published) {
      const { data: seasons } = await supabase
        .from('athlete_seasons')
        .select('id')
        .eq('bot_id', bot.id)
        .eq('status', 'active');
      if (seasons && seasons.length > 0) {
        return res.status(400).json({ error: 'Cannot unpublish a bot with active subscribers.' });
      }
    }

    const { data, error } = await supabase
      .from('coach_bots')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', bot.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// POST /api/coach/bot/workouts
router.post(
  '/bot/workouts',
  auth,
  requireCoach,
  validate(workoutSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('id').eq('coach_id', req.coach.id).single();
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const { day_of_week, title, description, distance_miles, pace_guideline, ai_adjustable } = req.body;

    const { data, error } = await supabase
      .from('bot_workouts')
      .upsert(
        { bot_id: bot.id, day_of_week, title, description, distance_miles, pace_guideline, ai_adjustable },
        { onConflict: 'bot_id,day_of_week' }
      )
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// DELETE /api/coach/bot/workouts/:day
router.delete(
  '/bot/workouts/:day',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('id').eq('coach_id', req.coach.id).single();
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const day = parseInt(req.params.day);
    await supabase.from('bot_workouts').delete().eq('bot_id', bot.id).eq('day_of_week', day);
    res.json({ ok: true });
  })
);

// POST /api/coach/bot/publish
router.post(
  '/bot/publish',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('*').eq('coach_id', req.coach.id).single();
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    if (!bot.name) return res.status(400).json({ error: 'Bot name is required.' });
    if (!bot.philosophy) return res.status(400).json({ error: 'Philosophy is required.' });
    if (!bot.event_focus && !bot.level_focus)
      return res.status(400).json({ error: 'Set at least one focus (event or level).' });

    const { data: workouts } = await supabase.from('bot_workouts').select('id').eq('bot_id', bot.id);
    const { data: knowledge } = await supabase
      .from('coach_knowledge_documents')
      .select('id')
      .eq('coach_bot_id', bot.id);

    if (!workouts || workouts.length < 5 || !knowledge || knowledge.length < 1) {
      return res
        .status(400)
        .json({ error: 'Add at least 5 workouts and one knowledge document before publishing.' });
    }

    const { data, error } = await supabase
      .from('coach_bots')
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq('id', bot.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// Knowledge Documents
router.get(
  '/bot/knowledge',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('id').eq('coach_id', req.coach.id).single();
    if (!bot) return res.json([]);

    const { data } = await supabase
      .from('coach_knowledge_documents')
      .select('*')
      .eq('coach_bot_id', bot.id)
      .order('document_type')
      .order('created_at');

    res.json(data || []);
  })
);

router.post(
  '/bot/knowledge',
  auth,
  requireCoach,
  validate(knowledgeCreateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('id').eq('coach_id', req.coach.id).single();
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const { title, document_type, content_text, source_file_name } = req.body;

    const { data, error } = await supabase
      .from('coach_knowledge_documents')
      .insert({ coach_bot_id: bot.id, title, document_type, content_text, source_file_name })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

router.patch(
  '/bot/knowledge/:id',
  auth,
  requireCoach,
  validate(knowledgeUpdateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data, error } = await supabase
      .from('coach_knowledge_documents')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

router.delete(
  '/bot/knowledge/:id',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    await supabase.from('coach_knowledge_documents').delete().eq('id', req.params.id);
    res.json({ ok: true });
  })
);

export default router;
