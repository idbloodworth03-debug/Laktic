import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireCoach, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// ── Athlete: data export ──────────────────────────────────────────────────────
router.get(
  '/athlete/data-export',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const athleteId = req.athlete.id;

    const [profile, seasons, chatMessages, activities, races, summaries, stravaConn] = await Promise.all([
      supabase.from('athlete_profiles').select('*').eq('id', athleteId).single(),
      supabase.from('athlete_seasons').select('*').eq('athlete_id', athleteId),
      supabase.from('chat_messages').select('*').eq('season_id',
        // subquery via join — get all season ids first
        supabase.from('athlete_seasons').select('id').eq('athlete_id', athleteId)
      ),
      supabase.from('athlete_activities').select('*').eq('athlete_id', athleteId),
      supabase.from('athlete_races').select('*').eq('athlete_id', athleteId),
      supabase.from('weekly_summaries').select('*').eq('athlete_id', athleteId),
      supabase.from('strava_connections').select('strava_athlete_id, connected_at, last_sync_at, scope').eq('athlete_id', athleteId).single(),
    ]);

    // Fetch chat messages for all seasons
    const seasonIds = seasons.data?.map((s: any) => s.id) || [];
    const { data: messages } = seasonIds.length > 0
      ? await supabase.from('chat_messages').select('*').in('season_id', seasonIds)
      : { data: [] };

    const exportData = {
      exported_at: new Date().toISOString(),
      profile: profile.data,
      seasons: seasons.data || [],
      chat_messages: messages || [],
      activities: activities.data || [],
      races: races.data || [],
      weekly_summaries: summaries.data || [],
      strava_connection: stravaConn.data || null,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="laktic-athlete-data.json"');
    res.json(exportData);
  })
);

// ── Athlete: delete account ───────────────────────────────────────────────────
router.delete(
  '/athlete/account',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.id;

    // Cascade deletes handle most child records via FK ON DELETE CASCADE.
    // Explicitly delete athlete_profile (which cascades to seasons, messages, activities etc.)
    await supabase.from('athlete_profiles').delete().eq('user_id', userId);

    // Delete the auth user — requires service role
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) return res.status(500).json({ error: 'Failed to delete account. Please contact support.' });

    res.json({ ok: true });
  })
);

// ── Coach: data export ────────────────────────────────────────────────────────
router.get(
  '/coach/data-export',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const coachId = req.coach.id;

    const [profile, bot, team] = await Promise.all([
      supabase.from('coach_profiles').select('*').eq('id', coachId).single(),
      supabase.from('coach_bots').select('*').eq('coach_id', coachId).single(),
      supabase.from('teams').select('*').eq('coach_id', coachId).single(),
    ]);

    const botId = bot.data?.id;
    const teamId = team.data?.id;

    const [workouts, knowledge, members] = await Promise.all([
      botId
        ? supabase.from('bot_workouts').select('*').eq('bot_id', botId)
        : { data: [] },
      botId
        ? supabase.from('coach_knowledge_documents').select('title,document_type,created_at').eq('coach_bot_id', botId)
        : { data: [] },
      teamId
        ? supabase.from('team_members').select('joined_at, status').eq('team_id', teamId)
        : { data: [] },
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      profile: profile.data,
      bot: bot.data,
      workouts: workouts.data || [],
      knowledge_documents: knowledge.data || [],
      team: team.data,
      team_member_count: (members.data || []).length,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="laktic-coach-data.json"');
    res.json(exportData);
  })
);

// ── Coach: delete account ─────────────────────────────────────────────────────
router.delete(
  '/coach/account',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const coachId = req.coach.id;

    // Check for active subscribers before allowing deletion
    const { data: bot } = await supabase.from('coach_bots').select('id').eq('coach_id', coachId).single();
    if (bot) {
      const { data: activeSeasons } = await supabase
        .from('athlete_seasons')
        .select('id')
        .eq('bot_id', bot.id)
        .eq('status', 'active');
      if (activeSeasons && activeSeasons.length > 0) {
        return res.status(400).json({
          error: `Cannot delete account with ${activeSeasons.length} active athlete(s). Unpublish your bot first so athletes can migrate.`,
        });
      }
    }

    await supabase.from('coach_profiles').delete().eq('user_id', userId);

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) return res.status(500).json({ error: 'Failed to delete account. Please contact support.' });

    res.json({ ok: true });
  })
);

export default router;
