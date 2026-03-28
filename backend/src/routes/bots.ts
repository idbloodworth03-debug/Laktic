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

    // If the athlete is on a team, only show that team's coach's bots
    let coachIdFilter: string | null = null;
    if (req.user) {
      const { data: athleteProfile } = await supabase
        .from('athlete_profiles')
        .select('id, active_team_id')
        .eq('user_id', req.user.id)
        .single();

      if (athleteProfile?.active_team_id) {
        const { data: team } = await supabase
          .from('teams')
          .select('coach_id')
          .eq('id', athleteProfile.active_team_id)
          .single();
        if (team?.coach_id) coachIdFilter = team.coach_id;
      }
    }

    let query = supabase
      .from('coach_bots')
      .select(
        `
      id, name, philosophy, event_focus, level_focus, created_at,
      coach_profiles!coach_id (name, school_or_org)
    `
      )
      .eq('is_published', true);

    if (coachIdFilter) query = query.eq('coach_id', coachIdFilter);
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
    // If athlete is on a team, verify this bot belongs to their team's coach
    if (req.user) {
      const { data: athleteProfile } = await supabase
        .from('athlete_profiles')
        .select('id, active_team_id')
        .eq('user_id', req.user.id)
        .single();

      if (athleteProfile?.active_team_id) {
        const { data: team } = await supabase
          .from('teams')
          .select('coach_id')
          .eq('id', athleteProfile.active_team_id)
          .single();
        if (team?.coach_id) {
          const { data: ownerCheck } = await supabase
            .from('coach_bots')
            .select('id')
            .eq('id', req.params.botId)
            .eq('coach_id', team.coach_id)
            .single();
          if (!ownerCheck) return res.status(404).json({ error: 'Bot not found' });
        }
      }
    }

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
