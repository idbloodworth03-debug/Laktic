import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { generate } from '../services/seasonPlanService';
import { respond } from '../services/chatService';
import { getWeekStartDate } from '../utils/dateUtils';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { aiLimiter } from '../middleware/rateLimit';
import { athleteProfileSchema, athleteProfileUpdateSchema, chatMessageSchema, racesSchema, directMessageSchema } from '../schemas';
import { sendAthleteWelcomeEmail } from '../services/emailService';
import { notifyPlanReady } from '../services/notificationService';

const router = Router();

// ── Helper: resolve the active season for the athlete's currently active team ──
async function getActiveSeasonForTeam(
  athleteId: string,
  activeTeamId: string | null,
  selectClause: string
): Promise<any> {
  if (activeTeamId) {
    const { data: team } = await supabase
      .from('teams')
      .select('default_bot_id')
      .eq('id', activeTeamId)
      .single();
    if (!team?.default_bot_id) return null;
    const { data } = await supabase
      .from('athlete_seasons')
      .select(selectClause)
      .eq('athlete_id', athleteId)
      .eq('bot_id', team.default_bot_id)
      .eq('status', 'active')
      .single();
    return data ?? null;
  }
  // No active team — return the most recent active season (backwards compat)
  const { data: rows } = await supabase
    .from('athlete_seasons')
    .select(selectClause)
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  return rows?.[0] ?? null;
}

// ── Helper: resolve coach_id for the active team ──────────────────────────────
// Falls back to most recently joined team_members row if active_team_id is unset or stale.
async function getActiveTeamCoachId(activeTeamId: string | null, athleteId?: string): Promise<string | null> {
  // Primary path: use the explicitly set active team
  if (activeTeamId) {
    const { data: team } = await supabase
      .from('teams')
      .select('coach_id')
      .eq('id', activeTeamId)
      .single();
    if (team?.coach_id) return team.coach_id;
  }

  // Fallback: find the most recently joined active team membership
  if (athleteId) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('teams!team_id(coach_id)')
      .eq('athlete_id', athleteId)
      .is('left_at', null)
      .order('joined_at', { ascending: false })
      .limit(1)
      .single();
    const coachId = (membership as any)?.teams?.coach_id;
    if (coachId) return coachId;
  }

  return null;
}

// POST /api/athlete/profile
router.post(
  '/profile',
  auth,
  validate(athleteProfileSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { name, weekly_volume_miles, primary_events, pr_mile, pr_5k } = req.body;

    const { data, error } = await supabase
      .from('athlete_profiles')
      .insert({ user_id: req.user!.id, name, weekly_volume_miles, primary_events, pr_mile, pr_5k })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Fire-and-forget welcome email (non-blocking)
    const userEmail = req.user!.email;
    if (userEmail) sendAthleteWelcomeEmail(userEmail, name).catch(() => {});

    res.json(data);
  })
);

// PATCH /api/athlete/profile
router.patch(
  '/profile',
  auth,
  requireAthlete,
  validate(athleteProfileUpdateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data, error } = await supabase
      .from('athlete_profiles')
      .update(req.body)
      .eq('id', req.athlete.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// GET /api/athlete/season
router.get(
  '/season',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const season = await getActiveSeasonForTeam(
      req.athlete.id,
      req.athlete.active_team_id ?? null,
      '*, coach_bots!bot_id (id, name, philosophy, event_focus, level_focus)'
    );

    if (!season) return res.json({ season: null });
    res.json({ season });
  })
);

// PATCH /api/athlete/season/races
router.patch(
  '/season/races',
  auth,
  requireAthlete,
  validate(racesSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { races } = req.body;

    const season = await getActiveSeasonForTeam(req.athlete.id, req.athlete.active_team_id ?? null, 'id');
    if (!season) return res.status(404).json({ error: 'No active season' });

    const { data, error } = await supabase
      .from('athlete_seasons')
      .update({ race_calendar: races, updated_at: new Date().toISOString() })
      .eq('id', season.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// POST /api/athlete/subscribe/:botId
router.post(
  '/subscribe/:botId',
  auth,
  requireAthlete,
  aiLimiter,
  asyncHandler(async (req: AuthRequest, res) => {
    const { botId } = req.params;

    const { data: bot } = await supabase.from('coach_bots').select('*').eq('id', botId).single();
    if (!bot?.is_published) return res.status(400).json({ error: 'Bot is not published' });

    const { data: existingSeason } = await supabase
      .from('athlete_seasons')
      .select('id')
      .eq('athlete_id', req.athlete.id)
      .eq('bot_id', botId)
      .eq('status', 'active')
      .single();

    if (existingSeason) {
      return res
        .status(400)
        .json({ error: 'Already subscribed to this bot. Use Regenerate Plan to update your schedule.' });
    }

    const { data: botWorkouts } = await supabase
      .from('bot_workouts')
      .select('*')
      .eq('bot_id', botId)
      .order('day_of_week');

    // Create job record before kicking off generation so we always have a traceable id
    const { data: job, error: jobError } = await supabase
      .from('plan_jobs')
      .insert({ athlete_id: req.athlete.id, bot_id: botId, status: 'generating' })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[subscribe] plan_jobs insert failed:', jobError?.code, jobError?.message);
      return res.status(500).json({ error: `Failed to initialise plan job: ${jobError?.message ?? 'unknown error'}` });
    }

    const jobId: string = job.id;
    const athleteId: string = req.athlete.id;
    const userId: string = req.user!.id;
    const startDate = getWeekStartDate();

    const generatePromise = generate({
      athleteProfile: req.athlete,
      bot,
      botWorkouts: botWorkouts || [],
      raceCalendar: [],
      startDate
    });

    // Helper: persist completed plan and mark job done
    const savePlan = async (plan: any[], aiUsed: boolean): Promise<string> => {
      const { data: season, error: seasonErr } = await supabase
        .from('athlete_seasons')
        .insert({
          athlete_id: athleteId,
          bot_id: botId,
          race_calendar: [],
          season_plan: plan,
          ai_used: aiUsed,
          status: 'active'
        })
        .select('id')
        .single();

      if (seasonErr || !season) throw new Error(seasonErr?.message || 'Failed to save season');

      await supabase
        .from('plan_jobs')
        .update({ status: 'complete', result: { seasonId: season.id }, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      // Set active_team_id to the team that owns this bot (if not already set or if this is different)
      const { data: botTeam } = await supabase
        .from('teams')
        .select('id')
        .eq('default_bot_id', botId)
        .single();
      if (botTeam) {
        await supabase
          .from('athlete_profiles')
          .update({ active_team_id: botTeam.id })
          .eq('id', athleteId);
      }

      notifyPlanReady(userId, bot.name).catch(() => {});
      return season.id;
    };

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 25000)
    );

    try {
      const { plan, aiUsed } = await Promise.race([generatePromise, timeoutPromise]);

      // Fast path: generation completed within the timeout window
      const seasonId = await savePlan(plan, aiUsed);
      return res.json({ seasonId, weeksGenerated: plan.length, aiUsed });
    } catch (err: any) {
      if (err.message !== 'TIMEOUT') {
        // Generation itself failed — mark job failed and surface the error
        await supabase
          .from('plan_jobs')
          .update({ status: 'failed', error: err.message, updated_at: new Date().toISOString() })
          .eq('id', jobId);
        return res.status(500).json({ error: 'Plan generation failed. Please try again.' });
      }

      // Timeout path — return 202 immediately so Railway doesn't kill the request,
      // then let generation finish in the background and save via the job record.
      res.status(202).json({ status: 'generating', jobId });

      generatePromise
        .then(({ plan, aiUsed }) => savePlan(plan, aiUsed))
        .catch(async (bgErr: any) => {
          await supabase
            .from('plan_jobs')
            .update({ status: 'failed', error: bgErr.message || 'Generation failed', updated_at: new Date().toISOString() })
            .eq('id', jobId);
        });
    }
  })
);

// POST /api/athlete/season/regenerate
router.post(
  '/season/regenerate',
  auth,
  requireAthlete,
  aiLimiter,
  asyncHandler(async (req: AuthRequest, res) => {
    // 24h rate limit: no regenerate job in last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentJob } = await supabase
      .from('plan_jobs')
      .select('id, created_at')
      .eq('athlete_id', req.athlete.id)
      .eq('source', 'regenerate')
      .in('status', ['complete', 'generating'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (recentJob) {
      const nextAllowed = new Date(new Date(recentJob.created_at).getTime() + 24 * 60 * 60 * 1000);
      const hoursLeft = Math.ceil((nextAllowed.getTime() - Date.now()) / (60 * 60 * 1000));
      return res.status(429).json({
        error: `You can regenerate your plan once every 24 hours. Try again in ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}.`
      });
    }

    const season = await getActiveSeasonForTeam(
      req.athlete.id,
      req.athlete.active_team_id ?? null,
      '*, coach_bots!bot_id(*)'
    );
    if (!season) return res.status(404).json({ error: 'No active season' });

    const bot = (season as any).coach_bots;
    const { data: botWorkouts } = await supabase
      .from('bot_workouts')
      .select('*')
      .eq('bot_id', season.bot_id)
      .order('day_of_week');

    const { data: job, error: jobError } = await supabase
      .from('plan_jobs')
      .insert({ athlete_id: req.athlete.id, bot_id: season.bot_id, status: 'generating', source: 'regenerate' })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[regenerate] plan_jobs insert failed:', jobError?.code, jobError?.message);
      return res.status(500).json({ error: `Failed to initialise plan job: ${jobError?.message ?? 'unknown error'}` });
    }

    const jobId: string = job.id;
    const seasonId: string = season.id;
    const startDate = getWeekStartDate();

    const generatePromise = generate({
      athleteProfile: req.athlete,
      bot,
      botWorkouts: botWorkouts || [],
      raceCalendar: season.race_calendar || [],
      startDate,
      existingWeeks: season.season_plan || []
    });

    const savePlan = async (plan: any[], aiUsed: boolean): Promise<void> => {
      const { error: updateErr } = await supabase
        .from('athlete_seasons')
        .update({ season_plan: plan, ai_used: aiUsed, updated_at: new Date().toISOString() })
        .eq('id', seasonId);

      if (updateErr) throw new Error(updateErr.message);

      await supabase
        .from('plan_jobs')
        .update({ status: 'complete', result: { seasonId }, updated_at: new Date().toISOString() })
        .eq('id', jobId);
    };

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 25000)
    );

    try {
      const { plan, aiUsed } = await Promise.race([generatePromise, timeoutPromise]);
      await savePlan(plan, aiUsed);
      return res.json({ status: 'complete', jobId, weeksRegenerated: plan.length, aiUsed });
    } catch (err: any) {
      if (err.message !== 'TIMEOUT') {
        await supabase
          .from('plan_jobs')
          .update({ status: 'failed', error: err.message, updated_at: new Date().toISOString() })
          .eq('id', jobId);
        return res.status(500).json({ error: 'Plan generation failed. Please try again.' });
      }

      // Timeout — return 202 so Railway doesn't kill the connection, finish in background
      res.status(202).json({ status: 'generating', jobId });

      generatePromise
        .then(({ plan, aiUsed }) => savePlan(plan, aiUsed))
        .catch(async (bgErr: any) => {
          await supabase
            .from('plan_jobs')
            .update({ status: 'failed', error: bgErr.message || 'Generation failed', updated_at: new Date().toISOString() })
            .eq('id', jobId);
        });
    }
  })
);

// GET /api/athlete/chat
router.get(
  '/chat',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const season = await getActiveSeasonForTeam(req.athlete.id, req.athlete.active_team_id ?? null, 'id');

    if (!season) return res.json([]);

    const { data: messages } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('season_id', season.id)
      .order('created_at', { ascending: true });

    res.json(messages || []);
  })
);

// POST /api/athlete/chat
router.post(
  '/chat',
  auth,
  requireAthlete,
  aiLimiter,
  validate(chatMessageSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { message } = req.body;

    const season = await getActiveSeasonForTeam(
      req.athlete.id,
      req.athlete.active_team_id ?? null,
      '*, coach_bots!bot_id(*)'
    );

    if (!season) return res.status(404).json({ error: 'No active season. Subscribe to a coaching bot first.' });

    const bot = (season as any).coach_bots;
    if (!bot) {
      console.error('[chat] season', season.id, 'has no coach_bots join — bot_id:', season.bot_id);
      return res.status(500).json({ error: 'Coaching bot not found. Please contact support.' });
    }

    const { data: chatHistory } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('season_id', season.id)
      .order('created_at', { ascending: true });

    const { botReply, planUpdates } = await respond({
      bot,
      athleteProfile: req.athlete,
      raceCalendar: season.race_calendar || [],
      seasonPlan: season.season_plan || [],
      chatHistory: chatHistory || [],
      newMessage: message
    });

    // Save athlete message
    await supabase.from('chat_messages').insert({
      season_id: season.id,
      role: 'athlete',
      content: message,
      plan_was_updated: false
    });

    const planWasUpdated = planUpdates !== null && planUpdates.length > 0;

    // Save bot reply
    await supabase.from('chat_messages').insert({
      season_id: season.id,
      role: 'bot',
      content: botReply,
      plan_was_updated: planWasUpdated
    });

    // Apply plan updates
    if (planWasUpdated && planUpdates) {
      const updatedPlan = [...(season.season_plan || [])];
      for (const update of planUpdates) {
        const weekIdx = updatedPlan.findIndex((w: any) => w.week_number === update.week_number);
        if (weekIdx === -1) continue;
        const dayIdx = updatedPlan[weekIdx].workouts.findIndex(
          (wo: any) => wo.day_of_week === update.day_of_week
        );
        if (dayIdx === -1) continue;
        const existing = updatedPlan[weekIdx].workouts[dayIdx];
        updatedPlan[weekIdx].workouts[dayIdx] = {
          ...existing,
          title: update.title ?? existing.title,
          description: update.description ?? existing.description,
          distance_miles: update.distance_miles ?? existing.distance_miles,
          pace_guideline: update.pace_guideline ?? existing.pace_guideline,
          change_reason: update.change_reason ?? existing.change_reason
        };
      }
      await supabase
        .from('athlete_seasons')
        .update({ season_plan: updatedPlan, updated_at: new Date().toISOString() })
        .eq('id', season.id);
    }

    const updatedDays = planUpdates?.map((u: any) => u.date) || [];
    res.json({ botReply, planUpdated: planWasUpdated, updatedDays });
  })
);

// DELETE /api/athlete/chat — Clear bot chat history
router.delete(
  '/chat',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const season = await getActiveSeasonForTeam(req.athlete.id, req.athlete.active_team_id ?? null, 'id');

    if (season) {
      await supabase.from('chat_messages').delete().eq('season_id', season.id);
    }
    res.json({ ok: true });
  })
);

// GET /api/athlete/messages — Direct messages with coach
router.get(
  '/messages',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const coachId = await getActiveTeamCoachId(req.athlete.active_team_id ?? null, req.athlete.id);
    if (!coachId) return res.json([]);

    const { data: messages } = await supabase
      .from('direct_messages')
      .select('*')
      .eq('athlete_id', req.athlete.id)
      .eq('coach_id', coachId)
      .order('created_at', { ascending: true });

    res.json(messages || []);
  })
);

// POST /api/athlete/messages — Send direct message to coach
router.post(
  '/messages',
  auth,
  requireAthlete,
  validate(directMessageSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { message } = req.body;

    const coachId = await getActiveTeamCoachId(req.athlete.active_team_id ?? null, req.athlete.id);
    if (!coachId) return res.status(404).json({ error: 'No active team or coach found' });

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ athlete_id: req.athlete.id, coach_id: coachId, sender_role: 'athlete', content: message })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// GET /api/athlete/teams — list all active team memberships
router.get(
  '/teams',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: memberships } = await supabase
      .from('team_members')
      .select(`
        id, status, joined_at,
        teams!team_id (id, name, default_bot_id, coach_id,
          coach_profiles!coach_id (name)
        )
      `)
      .eq('athlete_id', req.athlete.id)
      .is('left_at', null)
      .order('joined_at', { ascending: true });

    const teams = (memberships || []).map((m: any) => ({
      membership_id: m.id,
      status: m.status,
      joined_at: m.joined_at,
      ...m.teams,
      coach_name: m.teams?.coach_profiles?.name,
      is_active: m.teams?.id === req.athlete.active_team_id,
    }));

    res.json(teams);
  })
);

// POST /api/athlete/teams/leave — leave a team
router.post(
  '/teams/leave',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { team_id } = req.body;
    if (!team_id) return res.status(400).json({ error: 'team_id is required' });

    const { data: member, error: findErr } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', team_id)
      .eq('athlete_id', req.athlete.id)
      .is('left_at', null)
      .single();

    if (findErr || !member) return res.status(404).json({ error: 'Not a member of this team' });

    await supabase
      .from('team_members')
      .update({ left_at: new Date().toISOString() })
      .eq('id', member.id);

    // Get team info for notification
    const { data: team } = await supabase
      .from('teams')
      .select('id, name, coach_id, coach_profiles!coach_id(user_id)')
      .eq('id', team_id)
      .single();

    // Notify coach (fire-and-forget)
    if (team) {
      const coachUserId = (team as any).coach_profiles?.user_id;
      if (coachUserId) {
        const { notifyAthleteLeft } = await import('../services/notificationService');
        notifyAthleteLeft(coachUserId, req.athlete.name).catch(() => {});
      }

      // Log team event
      await supabase.from('team_events').insert({
        team_id: team.id,
        actor_id: req.athlete.id,
        action: 'left',
        details: { athlete_name: req.athlete.name }
      });
    }

    // If this was the active team, switch to another team or clear
    if (req.athlete.active_team_id === team_id) {
      const { data: remaining } = await supabase
        .from('team_members')
        .select('teams!team_id(id)')
        .eq('athlete_id', req.athlete.id)
        .is('left_at', null)
        .limit(1);

      const nextTeamId = (remaining as any)?.[0]?.teams?.id ?? null;
      await supabase
        .from('athlete_profiles')
        .update({ active_team_id: nextTeamId })
        .eq('id', req.athlete.id);
    }

    res.json({ ok: true });
  })
);

// PUT /api/athlete/active-team — switch active team
router.put(
  '/active-team',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { team_id } = req.body;
    if (!team_id) return res.status(400).json({ error: 'team_id is required' });

    // Verify athlete is on this team
    const { data: member } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', team_id)
      .eq('athlete_id', req.athlete.id)
      .is('left_at', null)
      .single();

    if (!member) return res.status(403).json({ error: 'Not a member of this team' });

    await supabase
      .from('athlete_profiles')
      .update({ active_team_id: team_id })
      .eq('id', req.athlete.id);

    res.json({ ok: true, active_team_id: team_id });
  })
);

export default router;
