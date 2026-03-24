import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// GET /api/bots
router.get(
  '/',
  auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { event_focus, level_focus } = req.query;

    let query = supabase
      .from('coach_bots')
      .select(
        `
      id, name, philosophy, event_focus, level_focus, created_at,
      coach_profiles!coach_id (name, school_or_org)
    `
      )
      .eq('is_published', true);

    if (event_focus) query = query.eq('event_focus', event_focus);
    if (level_focus) query = query.eq('level_focus', level_focus);

    const { data: bots, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Get knowledge doc counts
    const result = await Promise.all(
      (bots || []).map(async (bot: any) => {
        const { count } = await supabase
          .from('coach_knowledge_documents')
          .select('id', { count: 'exact', head: true })
          .eq('coach_bot_id', bot.id);

        return {
          ...bot,
          philosophy_excerpt: bot.philosophy?.slice(0, 200),
          knowledge_document_count: count || 0,
          coach: bot.coach_profiles
        };
      })
    );

    res.json(result);
  })
);

// GET /api/bots/:botId
router.get(
  '/:botId',
  auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot, error } = await supabase
      .from('coach_bots')
      .select(
        `
      *,
      coach_profiles!coach_id (name, school_or_org)
    `
      )
      .eq('id', req.params.botId)
      .eq('is_published', true)
      .single();

    if (error || !bot) return res.status(404).json({ error: 'Bot not found' });

    const { data: workouts } = await supabase.from('bot_workouts').select('*').eq('bot_id', bot.id).order('day_of_week');

    const { data: knowledge } = await supabase
      .from('coach_knowledge_documents')
      .select('id, title, document_type, created_at')
      .eq('coach_bot_id', bot.id);

    res.json({
      ...bot,
      coach: bot.coach_profiles,
      workouts: workouts || [],
      knowledge_titles: knowledge || [],
      knowledge_document_count: knowledge?.length || 0
    });
  })
);

export default router;
