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
    const { data: season } = await supabase
      .from('athlete_seasons')
      .select(
        `
      *,
      coach_bots!bot_id (id, name, philosophy, event_focus, level_focus)
    `
      )
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

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

    const { data: season } = await supabase
      .from('athlete_seasons')
      .select('id')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

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
      .eq('status', 'active')
      .single();

    if (existingSeason) {
      return res
        .status(400)
        .json({ error: 'Already subscribed. Use Regenerate Plan to update your schedule.' });
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
    const { data: season } = await supabase
      .from('athlete_seasons')
      .select('*, coach_bots!bot_id(*)')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

    if (!season) return res.status(404).json({ error: 'No active season' });

    const bot = (season as any).coach_bots;
    const { data: botWorkouts } = await supabase
      .from('bot_workouts')
      .select('*')
      .eq('bot_id', season.bot_id)
      .order('day_of_week');

    const startDate = getWeekStartDate();
    const { plan, aiUsed } = await generate({
      athleteProfile: req.athlete,
      bot,
      botWorkouts: botWorkouts || [],
      raceCalendar: season.race_calendar || [],
      startDate,
      existingWeeks: season.season_plan || []
    });

    const { error } = await supabase
      .from('athlete_seasons')
      .update({ season_plan: plan, ai_used: aiUsed, updated_at: new Date().toISOString() })
      .eq('id', season.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ weeksRegenerated: plan.length, aiUsed });
  })
);

// GET /api/athlete/chat
router.get(
  '/chat',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: season } = await supabase
      .from('athlete_seasons')
      .select('id')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

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

    const { data: season } = await supabase
      .from('athlete_seasons')
      .select('*, coach_bots!bot_id(*)')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

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
    const { data: season } = await supabase
      .from('athlete_seasons')
      .select('id')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

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
    const { data: member } = await supabase
      .from('team_members')
      .select('teams!team_id(coach_id)')
      .eq('athlete_id', req.athlete.id)
      .single();

    if (!member) return res.json([]);
    const coachId = (member as any).teams?.coach_id;
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

    const { data: member } = await supabase
      .from('team_members')
      .select('teams!team_id(coach_id)')
      .eq('athlete_id', req.athlete.id)
      .single();

    if (!member) return res.status(404).json({ error: 'Not on any team' });
    const coachId = (member as any).teams?.coach_id;
    if (!coachId) return res.status(404).json({ error: 'No coach found' });

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ athlete_id: req.athlete.id, coach_id: coachId, sender_role: 'athlete', content: message })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

export default router;
