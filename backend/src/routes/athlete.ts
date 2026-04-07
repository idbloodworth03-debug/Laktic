import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { generate } from '../services/seasonPlanService';
import { getWeekStartDate } from '../utils/dateUtils';
import { asyncHandler } from '../utils/asyncHandler';
import { filterText, containsSevereProfanity } from '../utils/contentFilter';
import { validate } from '../middleware/validate';
import { aiLimiter } from '../middleware/rateLimit';
import { athleteProfileSchema, athleteProfileUpdateSchema, chatMessageSchema, racesSchema, directMessageSchema } from '../schemas';
import { sendAthleteWelcomeEmail } from '../services/emailService';
import { notifyPlanReady } from '../services/notificationService';
import { loadAthleteContext, formatContextForPrompt } from '../utils/athleteContext';
import { computeReadiness } from '../utils/readinessEngine';
import { classifyAthleteTier, derivePaceBands, deriveEventPaces } from '../utils/athleteTier';
import { predictRaceTime, getPredictionTrend, RACE_DISTANCES_M } from '../utils/performancePredictions';
import { updateWorkout, reduceWeekIntensity, markRestDay, addInjuryNote, flagCoach, saveMemory, summarizeSession } from '../utils/botActions';
import { extractMemories } from '../utils/memoryExtractor';
import OpenAI from 'openai';
import { env } from '../config/env';
import { RUNNING_EXPERT_BASELINE } from '../utils/runningExpertBaseline';
import { PACE_PERSONA } from '../utils/pacePersona';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const router = Router();

// In-memory readiness cache — 1 hour TTL per athlete
const _readinessCache = new Map<string, { result: unknown; expiresAt: number }>();
export function bustReadinessCache(athleteId: string) { _readinessCache.delete(athleteId); }

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

    console.log('[POST /athlete/profile] user_id:', req.user!.id, 'name:', name);
    const { data, error } = await supabase
      .from('athlete_profiles')
      .insert({ user_id: req.user!.id, name, weekly_volume_miles, primary_events, pr_mile, pr_5k })
      .select()
      .single();

    if (error) {
      console.error('[POST /athlete/profile] insert error:', error.message, '| code:', error.code);
      return res.status(400).json({ error: error.message });
    }

    // Fire-and-forget welcome email (non-blocking)
    const userEmail = req.user!.email;
    if (userEmail) sendAthleteWelcomeEmail(userEmail, name).catch(() => {});

    res.json(data);
  })
);

// GET /api/athlete/profile
router.get(
  '/profile',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    res.json(req.athlete);
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

// GET /api/athlete/readiness
router.get(
  '/readiness',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const athleteId = req.athlete.id;
    const bust = req.query.bust === '1';

    if (!bust) {
      const cached = _readinessCache.get(athleteId);
      if (cached && Date.now() < cached.expiresAt) {
        return res.json(cached.result);
      }
    }

    const result = await computeReadiness(athleteId, supabase);
    _readinessCache.set(athleteId, { result, expiresAt: Date.now() + 3_600_000 });
    res.json(result);
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

    // Fetch activity context for personalized plan generation
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: recentActivities }, { data: latestReadiness }] = await Promise.all([
      supabase.from('athlete_activities')
        .select('start_date, activity_type, distance_miles, pace, duration')
        .eq('athlete_id', req.athlete.id)
        .gte('start_date', thirtyDaysAgo)
        .order('start_date', { ascending: false })
        .limit(20),
      supabase.from('daily_readiness')
        .select('score, label, recommended_intensity')
        .eq('athlete_id', req.athlete.id)
        .order('date', { ascending: false })
        .limit(1)
        .single()
    ]);

    const generatePromise = generate({
      athleteProfile: req.athlete,
      bot,
      botWorkouts: botWorkouts || [],
      raceCalendar: [],
      startDate,
      recentActivities: recentActivities || [],
      latestReadiness: latestReadiness ?? null,
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

// GET /api/athlete/pace-zones — return computed pace bands + event paces + tier
router.get(
  '/pace-zones',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const bands = derivePaceBands(req.athlete);
    const eventPaces = deriveEventPaces(req.athlete);
    const tier = classifyAthleteTier(req.athlete);
    return res.json({ bands, eventPaces, tier });
  })
);

// POST /api/athlete/season/generate — create the very first season plan for a new athlete
router.post(
  '/season/generate',
  auth,
  requireAthlete,
  aiLimiter,
  asyncHandler(async (req: AuthRequest, res) => {
    // If an active season already exists, tell the client to use regenerate instead
    const existing = await getActiveSeasonForTeam(req.athlete.id, req.athlete.active_team_id ?? null, 'id');
    if (existing) return res.status(400).json({ error: 'Season already exists. Use regenerate to update your plan.' });

    // Find any published bot — fall back to Pace defaults if none exists
    const { data: botRow } = await supabase
      .from('coach_bots')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    const bot = botRow ?? {
      id: null,
      name: 'Pace',
      philosophy: RUNNING_EXPERT_BASELINE,
      personality_prompt: PACE_PERSONA,
      event_focus: 'running',
      level_focus: 'all',
    };

    const botWorkoutsResult = botRow
      ? await supabase.from('bot_workouts').select('*').eq('bot_id', botRow.id).order('day_of_week')
      : { data: [] };
    const botWorkouts = botWorkoutsResult.data;

    const { data: job, error: jobError } = await supabase
      .from('plan_jobs')
      .insert({ athlete_id: req.athlete.id, bot_id: botRow?.id ?? null, status: 'generating', source: 'onboarding' })
      .select('id')
      .single();

    if (jobError || !job) {
      return res.status(500).json({ error: `Failed to initialise plan job: ${jobError?.message ?? 'unknown error'}` });
    }

    const jobId: string = job.id;
    const athleteId: string = req.athlete.id;
    const userId: string = req.user!.id;
    const startDate = getWeekStartDate();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: recentActivities }, { data: latestReadiness }] = await Promise.all([
      supabase.from('athlete_activities')
        .select('start_date, activity_type, distance_miles, pace, duration')
        .eq('athlete_id', req.athlete.id)
        .gte('start_date', thirtyDaysAgo)
        .order('start_date', { ascending: false })
        .limit(20),
      supabase.from('daily_readiness')
        .select('score, label, recommended_intensity')
        .eq('athlete_id', req.athlete.id)
        .order('date', { ascending: false })
        .limit(1)
        .single(),
    ]);

    console.log('[plan/generate] Generating plan for athlete:', athleteId);
    console.log('[plan/generate] Athlete context loaded:', JSON.stringify(req.athlete).slice(0, 200));

    const planType: string | undefined = (req.body as any)?.plan_type ?? undefined;
    const athleteTier = classifyAthleteTier(req.athlete);

    const generatePromise = generate({
      athleteProfile: req.athlete,
      bot,
      botWorkouts: botWorkouts || [],
      raceCalendar: [],
      startDate,
      recentActivities: recentActivities || [],
      latestReadiness: latestReadiness ?? null,
      planType,
      athleteTier,
    });

    const savePlan = async (plan: any[], aiUsed: boolean): Promise<string> => {
      console.log('[plan/generate] Plan generated successfully, weeks:', plan.length);
      const { data: season, error: seasonErr } = await supabase
        .from('athlete_seasons')
        .insert({ athlete_id: athleteId, bot_id: botRow?.id ?? null, race_calendar: [], season_plan: plan, ai_used: aiUsed, status: 'active' })
        .select('id')
        .single();
      if (seasonErr || !season) throw new Error(seasonErr?.message || 'Failed to save season');
      console.log('[plan/generate] Plan saved to DB:', season.id);
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
      const seasonId = await savePlan(plan, aiUsed);
      return res.json({ seasonId, weeksGenerated: plan.length, aiUsed });
    } catch (err: any) {
      if (err.message !== 'TIMEOUT') {
        await supabase.from('plan_jobs')
          .update({ status: 'failed', error: err.message, updated_at: new Date().toISOString() })
          .eq('id', jobId);
        return res.status(500).json({ error: 'Plan generation failed. Please try again.' });
      }
      res.status(202).json({ status: 'generating', jobId });
      generatePromise
        .then(({ plan, aiUsed }) => savePlan(plan, aiUsed))
        .catch(async (bgErr: any) => {
          await supabase.from('plan_jobs')
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
    console.log('[regenerate] endpoint hit for athlete:', req.athlete?.id);
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

    const bot = (season as any).coach_bots ?? {
      id: null,
      name: 'Pace',
      philosophy: RUNNING_EXPERT_BASELINE,
      personality_prompt: PACE_PERSONA,
      event_focus: 'running',
      level_focus: 'all',
    };
    const botWorkoutsResult = season.bot_id
      ? await supabase.from('bot_workouts').select('*').eq('bot_id', season.bot_id).order('day_of_week')
      : { data: [] };
    const botWorkouts = botWorkoutsResult.data;

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

    // Fetch activity context for personalized plan generation
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: recentActivities }, { data: latestReadiness }] = await Promise.all([
      supabase.from('athlete_activities')
        .select('start_date, activity_type, distance_miles, pace, duration')
        .eq('athlete_id', req.athlete.id)
        .gte('start_date', thirtyDaysAgo)
        .order('start_date', { ascending: false })
        .limit(20),
      supabase.from('daily_readiness')
        .select('score, label, recommended_intensity')
        .eq('athlete_id', req.athlete.id)
        .order('date', { ascending: false })
        .limit(1)
        .single()
    ]);

    const generatePromise = generate({
      athleteProfile: req.athlete,
      bot,
      botWorkouts: botWorkouts || [],
      raceCalendar: season.race_calendar || [],
      startDate,
      existingWeeks: season.season_plan || [],
      recentActivities: recentActivities || [],
      latestReadiness: latestReadiness ?? null,
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
      console.log('[regenerate] new plan generated, weeks:', plan?.length);
      await savePlan(plan, aiUsed);
      return res.json({ status: 'complete', jobId, weeksRegenerated: plan.length, aiUsed, season_plan: plan });
    } catch (err: any) {
      if (err.message !== 'TIMEOUT') {
        console.error('[regenerate] error:', err);
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

// ── Response length enforcement ───────────────────────────────────────────────

const CONVERSATIONAL_WORD_LIMIT = 150;
const WORKOUT_LIST_WORD_LIMIT = 300;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Heuristic: treat response as a workout list if it has 3+ bullet lines or 3+ distance mentions in list form */
function isWorkoutList(text: string): boolean {
  const bulletLines = (text.match(/\n- /g) || []).length;
  const distanceMentions = (text.match(/\d+(\.\d+)?\s*mi/gi) || []).length;
  return bulletLines >= 3 || (distanceMentions >= 3 && text.includes('\n'));
}

/** Trim response to the nearest complete sentence at or under `limit` words */
function trimToWordLimit(text: string, limit: number): string {
  if (countWords(text) <= limit) return text;
  // Split on sentence-ending punctuation followed by whitespace
  const sentences = text.split(/(?<=[.!?])\s+/);
  let result = '';
  let wordCount = 0;
  for (const sentence of sentences) {
    const sentWords = sentence.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount + sentWords > limit) break;
    result = result ? `${result} ${sentence}` : sentence;
    wordCount += sentWords;
  }
  // Fallback: hard-cut at word limit if no sentence boundary found
  if (!result) {
    result = text.trim().split(/\s+/).slice(0, limit).join(' ');
  }
  return result;
}

// ── Agent tools definition ────────────────────────────────────────────────────

const AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'update_workout',
      description: 'Update a specific workout in the athlete\'s training plan by date. Use this to change distance, pace, or description of a single workout. Never changes the workout title — that is set by the plan engine.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Workout date in YYYY-MM-DD format' },
          description: { type: 'string', description: 'New workout description (optional)' },
          distance_miles: { type: 'number', description: 'New distance in miles (optional)' },
          pace_guideline: { type: 'string', description: 'New pace guideline, e.g. "8:30/mi easy" (optional)' },
          change_reason: { type: 'string', description: 'One sentence explaining why the change is being made' },
          is_rest_day: { type: 'boolean', description: 'Set true to convert this workout to a rest day (optional)' },
        },
        required: ['date', 'change_reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reduce_week_intensity',
      description: 'Reduce the distance of all remaining workouts this week by a percentage. Use when the athlete is fatigued, sick, or recovering.',
      parameters: {
        type: 'object',
        properties: {
          percentage: { type: 'number', description: 'Percentage to reduce (e.g. 25 reduces all workouts by 25%). Max 80.' },
        },
        required: ['percentage'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_rest_day',
      description: 'Replace a workout with a complete rest day. Use for injury, illness, or extreme fatigue on a specific date.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date to mark as rest in YYYY-MM-DD format' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_injury_note',
      description: 'Record an injury or physical limitation to the athlete\'s profile. Use when the athlete mentions pain, injury, or a persistent physical issue.',
      parameters: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'Description of the injury or limitation to record' },
        },
        required: ['note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'flag_coach',
      description: 'Send an alert email to the athlete\'s coach. Use for serious injuries, mental health concerns, or situations that require human coach judgment.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The alert message to send to the coach' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_session',
      description: 'Save a 2-3 sentence summary of this coaching session to persistent memory. Call this at the end of a substantive conversation where training decisions, athlete concerns, or notable context was discussed.',
      parameters: {
        type: 'object',
        properties: {
          summary_text: { type: 'string', description: '2-3 sentence summary of what was discussed and any key decisions made' },
          message_count: { type: 'number', description: 'Approximate number of messages exchanged in this session' },
        },
        required: ['summary_text', 'message_count'],
      },
    },
  },
];

// POST /api/athlete/chat
router.post(
  '/chat',
  auth,
  requireAthlete,
  aiLimiter,
  validate(chatMessageSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { message: rawMessage } = req.body;
    if (containsSevereProfanity(rawMessage)) return res.status(400).json({ error: 'Your message contains inappropriate content' });
    const message = filterText(rawMessage);

    const season = await getActiveSeasonForTeam(
      req.athlete.id,
      req.athlete.active_team_id ?? null,
      'id'
    );

    if (!season) return res.status(404).json({ error: 'No active season. Subscribe to a coaching bot first.' });

    const { data: chatHistory } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('season_id', season.id)
      .order('created_at', { ascending: true });

    // Load full athlete context
    const ctx = await loadAthleteContext(req.athlete.id, req.athlete.active_team_id ?? null);

    if (!ctx.coachBot) {
      return res.status(500).json({ error: 'Coaching bot not found. Please contact support.' });
    }

    // Build system prompt
    const personalityBlock = ctx.coachBot.personality_prompt
      ? `COACHING PERSONALITY:\n${ctx.coachBot.personality_prompt}\n\nRespond in this coaching voice at all times.\n\n`
      : '';

    const systemPrompt = `${personalityBlock}You are a real coaching agent with access to tools that can modify this athlete's training plan and alert their coach.

COACH PHILOSOPHY:
${ctx.coachBot.philosophy || ''}

COACH KNOWLEDGE:
${ctx.coachKnowledge}

Rules:
1. Respond in the coach's voice — warm, direct, expert.
2. You can only modify workouts within the next 14 days. For larger changes, tell the athlete to use Regenerate Plan.
3. For injuries: reduce load conservatively. Always recommend professional medical evaluation for significant symptoms.
4. Use tools when action is needed — don't just suggest changes, make them.
5. After using tools, tell the athlete exactly what you changed.
6. Flag the human coach for serious injuries, mental health concerns, or anything requiring human judgment.`;

    // Build conversation messages
    const historyText = (chatHistory || []).slice(-20).map((msg: any) =>
      `${msg.role === 'athlete' ? 'ATHLETE' : 'COACH BOT'}: ${msg.content}`
    ).join('\n');

    const contextBlock = formatContextForPrompt(ctx);

    const userContent = `${contextBlock}

CONVERSATION HISTORY:
${historyText}

ATHLETE: ${message}`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    // ── Tool-calling agent loop ───────────────────────────────────────────────
    let botReply = '';
    let planUpdated = false;
    const updatedDays: string[] = [];
    const MAX_LOOPS = 6;

    for (let loop = 0; loop < MAX_LOOPS; loop++) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: AGENT_TOOLS,
        tool_choice: 'auto',
      });

      const choice = response.choices[0];
      messages.push(choice.message);

      if (choice.finish_reason !== 'tool_calls' || !choice.message.tool_calls?.length) {
        botReply = choice.message.content ?? '';
        break;
      }

      // Execute each tool call
      for (const tc of choice.message.tool_calls) {
        if (tc.type !== 'function') continue;
        let result: { ok: boolean; message: string };
        try {
          const args = JSON.parse(tc.function.arguments);
          const toolName = tc.function.name;
          switch (toolName) {
            case 'update_workout':
              result = await updateWorkout(req.athlete.id, args.date, {
                description: args.description,
                distance_miles: args.distance_miles,
                pace_guideline: args.pace_guideline,
                change_reason: args.change_reason,
                is_rest_day: args.is_rest_day,
              });
              if (result.ok) { planUpdated = true; if (args.date) updatedDays.push(args.date); }
              break;
            case 'reduce_week_intensity':
              result = await reduceWeekIntensity(req.athlete.id, args.percentage);
              if (result.ok) planUpdated = true;
              break;
            case 'mark_rest_day':
              result = await markRestDay(req.athlete.id, args.date);
              if (result.ok) { planUpdated = true; if (args.date) updatedDays.push(args.date); }
              break;
            case 'add_injury_note':
              result = await addInjuryNote(req.athlete.id, args.note);
              break;
            case 'flag_coach':
              result = await flagCoach(req.athlete.id, args.message);
              break;
            case 'summarize_session':
              result = await summarizeSession(req.athlete.id, args.summary_text, args.message_count ?? 0);
              break;
            default:
              result = { ok: false, message: `Unknown tool: ${toolName}` };
          }
        } catch (toolErr: any) {
          result = { ok: false, message: toolErr.message || 'Tool execution failed' };
        }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    if (!botReply) botReply = 'Sorry, I ran into a technical issue. Your plan has not been changed.';

    // Enforce response length limits
    const replyWordCount = countWords(botReply);
    const replyIsWorkoutList = isWorkoutList(botReply);
    const wordLimit = replyIsWorkoutList ? WORKOUT_LIST_WORD_LIMIT : CONVERSATIONAL_WORD_LIMIT;
    if (replyWordCount > wordLimit) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[pace] reply over limit: ${replyWordCount} words (limit: ${wordLimit}, workoutList: ${replyIsWorkoutList})`
        );
      }
      botReply = trimToWordLimit(botReply, wordLimit);
    }

    // Save athlete message
    await supabase.from('chat_messages').insert({
      season_id: season.id,
      role: 'athlete',
      content: message,
      plan_was_updated: false,
    });

    // Save bot reply
    await supabase.from('chat_messages').insert({
      season_id: season.id,
      role: 'bot',
      content: botReply,
      plan_was_updated: planUpdated,
    });

    res.json({ botReply, planUpdated, updatedDays });

    // Auto-extract memories every 10 messages (fire and forget — never delays response)
    const totalMessages = (chatHistory?.length ?? 0) + 2;
    if (totalMessages % 10 === 0) {
      // Include the current turn so extraction sees the messages that just triggered it
      const fullHistory = [
        ...(chatHistory || []).map((m: any) => ({ role: m.role as string, content: m.content as string })),
        { role: 'athlete', content: message },
        { role: 'bot', content: botReply },
      ];
      const recentSlice = fullHistory.slice(-10);
      extractMemories(recentSlice)
        .then(async (memories) => {
          for (const mem of memories) {
            await saveMemory(req.athlete.id, mem, season.id);
          }
        })
        .catch(() => {
          // non-blocking — extraction failure must never surface to the athlete
        });
    }
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

// GET /api/athlete/workouts/completions — fetch completion dates for current season
router.get(
  '/workouts/completions',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data } = await supabase
      .from('workout_completions')
      .select('workout_date')
      .eq('athlete_id', req.athlete.id)
      .order('workout_date', { ascending: false })
      .limit(200);
    res.json((data || []).map((r: any) => r.workout_date));
  })
);

// POST /api/athlete/workouts/:date/complete — mark a workout complete
router.post(
  '/workouts/:date/complete',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const { data: season } = await supabase
      .from('athlete_seasons')
      .select('id')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const { error } = await supabase
      .from('workout_completions')
      .upsert({
        athlete_id: req.athlete.id,
        season_id: season?.id ?? null,
        workout_date: date,
      }, { onConflict: 'athlete_id,workout_date' });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  })
);

// DELETE /api/athlete/workouts/:date/complete — unmark a workout
router.delete(
  '/workouts/:date/complete',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

    await supabase
      .from('workout_completions')
      .delete()
      .eq('athlete_id', req.athlete.id)
      .eq('workout_date', date);

    res.json({ ok: true });
  })
);

// GET /api/athlete/predictions — race time predictions and trend data
router.get(
  '/predictions',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const athlete = req.athlete;

    // Load active season to compute compliance
    const season = await getActiveSeasonForTeam(athlete.id, athlete.active_team_id ?? null, 'id, season_plan, race_calendar');
    const plan: any[] = season?.season_plan || [];

    // Count planned workouts in the past (with distance > 0)
    const planned: string[] = [];
    for (const week of plan) {
      for (const wo of week.workouts || []) {
        if (wo.date && wo.date < today && (wo.distance_miles || wo.total_distance || 0) > 0 && !wo.is_rest_day) {
          planned.push(wo.date);
        }
      }
    }

    // Count completions
    const { data: completionRows } = await supabase
      .from('workout_completions')
      .select('workout_date')
      .eq('athlete_id', athlete.id);

    const completedDates = new Set((completionRows || []).map((r: any) => r.workout_date as string));
    const completedCount = planned.filter(d => completedDates.has(d)).length;
    const complianceRate = planned.length > 0 ? Math.round((completedCount / planned.length) * 100) : 0;

    // Weeks of training completed (weeks that have at least one planned workout in the past)
    const weekStarts = new Set(plan.filter(w => w.week_start_date < today).map(w => w.week_start_date as string));
    const weeksOfTraining = weekStarts.size;

    // Weeks to race
    const raceCalendar: any[] = season?.race_calendar || [];
    const goalRaces = raceCalendar.filter((r: any) => r.is_goal_race && r.date > today);
    goalRaces.sort((a: any, b: any) => a.date.localeCompare(b.date));
    const nextGoalRace = goalRaces[0] ?? null;
    const weeksToRace = nextGoalRace
      ? Math.ceil((new Date(nextGoalRace.date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / (7 * 24 * 60 * 60 * 1000))
      : null;

    // Logged activity weeks (approximation: distinct ISO weeks in recent activities)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: recentActs } = await supabase
      .from('athlete_activities')
      .select('start_date')
      .eq('athlete_id', athlete.id)
      .gte('start_date', thirtyDaysAgo);
    const actWeeks = new Set((recentActs || []).map((a: any) => (a.start_date as string).slice(0, 7)));
    const loggedWeeks = actWeeks.size;

    // Primary events to predict
    const primaryEvents: string[] = Array.isArray(athlete.primary_events) ? athlete.primary_events : [];
    // Map event labels to distance keys
    const eventToKey: Record<string, string> = {
      '800m': '800m', '1500m': '1500m', '1500': '1500m', 'mile': 'mile', 'Mile': 'mile',
      '5k': '5K', '5K': '5K', '5000m': '5K',
      '10k': '10K', '10K': '10K', '10000m': '10K',
      'half marathon': 'half', 'half': 'half',
      'marathon': 'marathon',
    };

    // Build prediction for each event + goal race distance
    const distancesToPredict = new Set<string>();
    for (const ev of primaryEvents) {
      const key = eventToKey[ev] ?? eventToKey[ev.toLowerCase()];
      if (key && RACE_DISTANCES_M[key]) distancesToPredict.add(key);
    }
    if (athlete.target_race_distance) {
      const k = eventToKey[athlete.target_race_distance] ?? eventToKey[(athlete.target_race_distance as string).toLowerCase()];
      if (k) distancesToPredict.add(k);
    }
    // Always include at least one prediction
    if (distancesToPredict.size === 0) distancesToPredict.add('5K');

    const predictions = Array.from(distancesToPredict).map(dist => {
      const pred = predictRaceTime(athlete, dist, weeksOfTraining, complianceRate, weeksToRace, loggedWeeks);
      const trend = weeksToRace
        ? getPredictionTrend(athlete, dist, weeksOfTraining, complianceRate, weeksToRace)
        : [];
      return { ...pred, complianceRate, weeksOfTraining, weeksToRace, trend };
    });

    // Also compute primary goal prediction for context
    const primaryPred = predictions[0] ?? null;

    res.json({
      predictions,
      primaryPrediction: primaryPred,
      complianceRate,
      weeksOfTraining,
      weeksToRace,
    });
  })
);

// POST /api/athlete/activities — Save a manually tracked run
router.post(
  '/activities',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const {
      name,
      start_date,
      distance_meters,
      moving_time_seconds,
      elapsed_time_seconds,
      average_speed,
      total_elevation_gain,
      average_heartrate,
      route_coordinates,
    } = req.body;

    if (!distance_meters || !moving_time_seconds || !start_date) {
      return res.status(400).json({ error: 'distance_meters, moving_time_seconds, and start_date are required' });
    }

    const { data, error } = await supabase
      .from('athlete_activities')
      .insert({
        athlete_id: req.athlete.id,
        source: 'manual',
        activity_type: 'Run',
        name: name || 'Manual Run',
        start_date,
        distance_meters,
        moving_time_seconds,
        elapsed_time_seconds: elapsed_time_seconds ?? moving_time_seconds,
        average_speed: average_speed ?? (distance_meters / moving_time_seconds),
        total_elevation_gain: total_elevation_gain ?? 0,
        average_heartrate: average_heartrate ?? null,
        raw_data: route_coordinates ? { route_coordinates } : null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ activity: data });
  })
);

export default router;
