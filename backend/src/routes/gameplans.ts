import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireCoach, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import OpenAI from 'openai';
import { env } from '../config/env';
import { notifyPlanReady } from '../services/notificationService';

const router = Router();
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ── Schemas ───────────────────────────────────────────────────────────────────

const generateSchema = z.object({
  race_name: z.string().min(1),
  race_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  distance: z.string().nullish(),
  lat: z.number().nullish(),
  lon: z.number().nullish(),
  goal_time: z.string().max(20).nullish(),
  has_run_before: z.boolean().nullish(),
  biggest_concern: z.string().max(300).nullish(),
});

const approveSchema = z.object({
  gameplan: z.record(z.string(), z.unknown()).optional(),
  coach_note: z.string().optional()
});

// ── Core generation logic ─────────────────────────────────────────────────────

async function generateGameplanForAthlete(
  athleteId: string,
  raceName: string,
  raceDate: string,
  distance?: string,
  lat?: number,
  lon?: number,
  raceEventId?: string,
  goalTime?: string,
  hasRunBefore?: boolean,
  biggestConcern?: string
): Promise<string> {
  const now = new Date();
  const day28Ago = new Date(now);
  day28Ago.setDate(day28Ago.getDate() - 28);

  // Fetch recent activities summary
  const { data: activities } = await supabase
    .from('athlete_activities')
    .select('start_date, distance_miles, elapsed_time_seconds, activity_type')
    .eq('athlete_id', athleteId)
    .gte('start_date', day28Ago.toISOString())
    .order('start_date', { ascending: false });

  const actSummary = (activities ?? []).map(a => ({
    date: a.start_date,
    miles: a.distance_miles,
    seconds: a.elapsed_time_seconds,
    type: a.activity_type
  }));

  // Fetch latest injury risk
  const { data: riskScore } = await supabase
    .from('injury_risk_scores')
    .select('score, risk_level, explanation')
    .eq('athlete_id', athleteId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single();

  // Fetch athlete profile + their bot's personality
  const { data: athlete } = await supabase
    .from('athlete_profiles')
    .select('name, weekly_volume_miles, current_weekly_mileage, primary_events, pr_mile, pr_5k, pr_10k, pr_half_marathon, pr_marathon, experience_level, primary_goal')
    .eq('id', athleteId)
    .single();

  // Fetch athlete's team bot personality (optional — non-blocking)
  let personalityBlock = '';
  try {
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id, teams!team_id(coach_id, coach_bots!coach_id(personality_prompt))')
      .eq('athlete_id', athleteId)
      .is('left_at', null)
      .limit(1)
      .single();
    const personalityPrompt = (teamMember as any)?.teams?.coach_bots?.personality_prompt;
    if (personalityPrompt) {
      personalityBlock = `COACHING PERSONALITY: ${personalityPrompt}\n\nYour coaching philosophy and style must reflect the above personality in every response. Never break character.\n\n`;
    }
  } catch {
    // No team — proceed without personality
  }

  // Weather (optional) — fetch real forecast, convert to imperial for US athletes
  let weatherInfo = 'unavailable — use seasonal defaults';
  let weatherStructured: { temp_f: number; wind_mph: number; precip_mm: number; description: string } | null = null;

  if (lat !== undefined && lon !== undefined) {
    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,windspeed_10m_max,precipitation_sum&timezone=auto&forecast_days=14`;
      const weatherRes = await fetch(weatherUrl);
      if (weatherRes.ok) {
        const weatherData: any = await weatherRes.json();
        const idx = (weatherData.daily?.time ?? []).indexOf(raceDate);
        if (idx !== -1) {
          const tempC = weatherData.daily.temperature_2m_max[idx] as number;
          const windKph = weatherData.daily.windspeed_10m_max[idx] as number;
          const precipMm = weatherData.daily.precipitation_sum[idx] as number;
          const tempF = Math.round(tempC * 9 / 5 + 32);
          const windMph = Math.round(windKph * 0.621371);
          let description = 'clear';
          if (precipMm > 10) description = 'rainy';
          else if (precipMm > 2) description = 'light rain possible';
          else if (tempF > 80) description = 'hot and humid';
          else if (tempF > 70) description = 'warm';
          else if (tempF < 35) description = 'cold';
          else if (windMph > 20) description = 'windy';
          weatherStructured = { temp_f: tempF, wind_mph: windMph, precip_mm: precipMm, description };
          weatherInfo = `${tempF}°F, Wind ${windMph}mph, Precipitation ${precipMm}mm — ${description}`;
        }
      }
    } catch {
      // Weather fetch failed — proceed without it
    }
  } else {
    // No coords — estimate based on month
    const month = new Date(raceDate).getMonth();
    const isSummer = month >= 5 && month <= 8;
    const isWinter = month === 11 || month <= 1;
    weatherInfo = isSummer
      ? 'Summer conditions likely — could be warm/humid (70–90°F range). No specific forecast available.'
      : isWinter
        ? 'Winter conditions likely — could be cold (30–50°F range). No specific forecast available.'
        : 'Mild seasonal conditions expected. No specific forecast available.';
  }

  // Calculate target pace if goal_time and distance provided
  let targetPaceInfo = '';
  if (goalTime && distance) {
    const distMiles: Record<string, number> = { '5k': 3.107, '10k': 6.214, 'half': 13.1, 'halfmarathon': 13.1, 'marathon': 26.2, 'full': 26.2 };
    const distKey = distance.toLowerCase().replace(/[^a-z0-9]/g, '');
    const miles = distMiles[distKey] || distMiles[distance.toLowerCase()] || null;
    if (miles) {
      const parts = goalTime.split(':').map(Number);
      const totalMins = parts.length === 3 ? parts[0]*60 + parts[1] + parts[2]/60 : parts[0] + (parts[1] || 0)/60;
      const paceMin = totalMins / miles;
      const paceWhole = Math.floor(paceMin);
      const paceSec = Math.round((paceMin - paceWhole) * 60);
      targetPaceInfo = `${paceWhole}:${paceSec.toString().padStart(2,'0')} per mile`;
    }
  }

  const prompt = {
    athlete: {
      name: athlete?.name,
      weekly_volume_miles: athlete?.current_weekly_mileage ?? athlete?.weekly_volume_miles,
      experience_level: athlete?.experience_level,
      primary_goal: athlete?.primary_goal,
      primary_events: athlete?.primary_events,
      pr_mile: athlete?.pr_mile,
      pr_5k: athlete?.pr_5k,
      pr_10k: athlete?.pr_10k,
      pr_half_marathon: athlete?.pr_half_marathon,
      pr_marathon: athlete?.pr_marathon,
    },
    race: {
      name: raceName, date: raceDate, distance: distance ?? 'unknown',
      goal_time: goalTime ?? null,
      target_pace_per_mile: targetPaceInfo || null,
      has_run_before: hasRunBefore ?? false,
      biggest_concern: biggestConcern ?? null,
    },
    recent_activities_last_28_days: actSummary.slice(0, 20),
    injury_risk: riskScore ?? null,
    weather_on_race_day: weatherInfo,
    weather_structured: weatherStructured,
  };

  const gameplanSystemPrompt = `${personalityBlock}You are an elite running coach AI. Generate a detailed, highly personalized race gameplan.

NUTRITION RULES — Be specific with real foods. Never say "carbohydrates and protein" or "energy snack" or "stay hydrated":
- Name actual foods: "Bagel with peanut butter and a banana", "Half a Clif bar or 3 Medjool dates", "8oz water with a pinch of salt and squeeze of lemon"
- Scale to race distance: 5K athlete needs minimal fuel; marathon runner needs a full pre-race meal plan + mid-race gels
- Include specific timing (e.g., "3 hours before", "30 minutes before", "at mile 13")

WEATHER RULES — The athlete's weather_on_race_day field has the actual forecast (or seasonal estimate). Never tell the athlete to "check the weather":
- If temp > 75°F: recommend starting 10-20 sec/mile slower than goal pace, carrying extra water, adjusting expectations
- If wind > 15mph: recommend positioning behind other runners, adjusting perceived effort
- If rain: recommend anti-chafe precautions, waterproof socks, adjusted footing
- Give SPECIFIC pace/effort adjustments using the actual temperature number, not vague "it might be warm"

PACING STRATEGY — Generate mile-by-mile or segment splits using target_pace_per_mile as the anchor:
- Calculate each segment's target pace relative to the anchor pace
- 5K: segment 1 (mi 1): anchor+10s, segment 2 (mi 2): anchor, segment 3 (mi 3+): anchor-5s to finish
- 10K: segment 1 (mi 1-2): anchor+10s, segment 2 (mi 3-4): anchor, segment 3 (mi 5-6+): anchor-5s
- Half Marathon: segment 1 (mi 1-3): anchor+10s conservative, segment 2 (mi 4-9): anchor, segment 3 (mi 10-11): evaluate, segment 4 (mi 12-13.1): push -5 to -10s
- Marathon: segment 1 (mi 1-6): anchor+20s, segment 2 (mi 7-13): anchor+10s, segment 3 (mi 14-20): anchor, segment 4 (mi 21-26.2): survive and push
- If goal_time not provided, use experience level and PRs to estimate a realistic target pace
- If has_run_before=true, reference course-specific tactics

TEMPERATURE ADJUSTMENTS — Apply these to the anchor pace before generating segments:
- Under 45°F: subtract 0-5 sec/mile from target (cold = faster + extra warmup needed)
- 45-60°F: ideal, no adjustment
- 60-70°F: add 5-10 sec/mile to target
- Over 70°F: add 15-30 sec/mile to target, extra hydration critical
- Always state the adjusted pace explicitly in the pacing explanation

MENTAL CUES — Must reference the athlete's ACTUAL goal time, their specific PRs, and their biggest_concern directly. Never give generic cues like "stay focused" — say "When you hit the wall at mile 20, remember you negative-split your last half in [PR time]".

NUTRITION SCALING:
- 5K/10K: No mid-race nutrition. Pre-race light meal only.
- Half Marathon: 1-2 gels at miles 5 and 9, water at every station
- Marathon: gel every 45 minutes starting mile 6, electrolytes every other station

Respond ONLY with valid JSON in this exact structure:`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `${gameplanSystemPrompt}
{
  "pacing_strategy": {
    "target_pace": "X:XX/mi",
    "temp_adjusted_pace": "X:XX/mi",
    "segments": [
      { "label": "Miles 1-3", "target_pace": "X:XX/mi", "note": "..." },
      { "label": "Miles 4-9", "target_pace": "X:XX/mi", "note": "..." }
    ],
    "explanation": "..."
  },
  "warmup_routine": [{ "step": "...", "duration": "...", "intensity": "..." }],
  "nutrition_timing": [{ "time_before_race": "...", "what": "...", "why": "..." }],
  "weather_conditions": { "temp_f": 0, "wind_mph": 0, "description": "..." },
  "weather_adjustments": "...",
  "mental_cues": ["...", "..."],
  "coach_note": "..."
}`
      },
      {
        role: 'user',
        content: JSON.stringify(prompt)
      }
    ],
    response_format: { type: 'json_object' }
  });

  return completion.choices[0].message.content ?? '{}';
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/gameplans/generate
router.post(
  '/generate',
  auth,
  requireAthlete,
  validate(generateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { race_name, race_date, distance, lat, lon, goal_time, has_run_before, biggest_concern } = req.body;
    const athleteId = req.athlete.id;
    const userId = req.user!.id;

    let gameplanJson: Record<string, unknown> = {};
    try {
      const raw = await generateGameplanForAthlete(athleteId, race_name, race_date, distance ?? undefined, lat ?? undefined, lon ?? undefined, undefined, goal_time ?? undefined, has_run_before ?? undefined, biggest_concern ?? undefined);
      gameplanJson = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Failed to generate gameplan' });
    }

    const { data: inserted, error } = await supabase
      .from('race_gameplans')
      .insert({
        athlete_id: athleteId,
        race_name,
        race_date,
        gameplan: gameplanJson,
        status: 'draft'
      })
      .select()
      .single();

    if (error || !inserted) return res.status(400).json({ error: 'Failed to save gameplan' });

    // Push notification
    try {
      await notifyPlanReady(userId, 'Laktic AI');
    } catch {
      // Notification failure should not fail the request
    }

    return res.status(201).json(inserted);
  })
);

// POST /api/gameplans/generate-for-upcoming — internal cron endpoint
router.post('/generate-for-upcoming', auth, requireCoach, asyncHandler(async (_req: AuthRequest, res) => {
  const count = await runGameplanCron();
  return res.json({ generated: count });
}));

// GET /api/gameplans/my
router.get('/my', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('race_gameplans')
    .select('*')
    .eq('athlete_id', req.athlete.id)
    .order('race_date', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data ?? []);
}));

// GET /api/gameplans/team
router.get('/team', auth, requireCoach, asyncHandler(async (req: AuthRequest, res) => {
  const { data: teamData } = await supabase
    .from('teams')
    .select('id')
    .eq('coach_id', req.coach.id)
    .single();

  if (!teamData) return res.status(404).json({ error: 'No team found' });

  const { data: members } = await supabase
    .from('team_members')
    .select('athlete_id')
    .eq('team_id', teamData.id)
    .is('left_at', null);

  const athleteIds = (members ?? []).map((m: any) => m.athlete_id);
  if (athleteIds.length === 0) return res.json([]);

  const { data, error } = await supabase
    .from('race_gameplans')
    .select('*, athlete_profiles!athlete_id(name)')
    .in('athlete_id', athleteIds)
    .order('race_date', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data ?? []);
}));

// GET /api/gameplans/:id
router.get('/:id', auth, asyncHandler(async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('race_gameplans')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Gameplan not found' });
  return res.json(data);
}));

// PATCH /api/gameplans/:id/approve
router.patch('/:id/approve', auth, requireCoach, validate(approveSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { gameplan, coach_note } = req.body;

  const { data: existing } = await supabase
    .from('race_gameplans')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Gameplan not found' });

  const updatedGameplan = gameplan
    ? { ...existing.gameplan, ...gameplan, coach_note: coach_note ?? existing.gameplan?.coach_note }
    : existing.gameplan;

  const { data, error } = await supabase
    .from('race_gameplans')
    .update({ gameplan: updatedGameplan, coach_approved: true, status: 'approved' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data);
}));

// ── Cron function ─────────────────────────────────────────────────────────────

export async function runGameplanCron(): Promise<number> {
  let generated = 0;
  try {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const in48hStr = in48h.toISOString().slice(0, 10);
    const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Find race events in the next 48 hours
    const { data: events } = await supabase
      .from('team_calendar_events')
      .select('id, title, event_date, team_id')
      .in('event_type', ['race', 'meet'])
      .gte('event_date', tomorrowStr)
      .lte('event_date', in48hStr);

    for (const event of events ?? []) {
      // Get athletes on this team
      const { data: members } = await supabase
        .from('team_members')
        .select('athlete_id, athlete_profiles!athlete_id(id, user_id, name)')
        .eq('team_id', event.team_id)
        .is('left_at', null);

      for (const member of members ?? []) {
        const athlete = (member as any).athlete_profiles;
        if (!athlete) continue;

        // Check if gameplan already exists for this athlete + event
        const { data: existing } = await supabase
          .from('race_gameplans')
          .select('id')
          .eq('athlete_id', athlete.id)
          .eq('race_event_id', event.id)
          .limit(1)
          .single();

        if (existing) continue;

        try {
          const raw = await generateGameplanForAthlete(
            athlete.id,
            event.title,
            event.event_date
          );
          const gameplanJson = JSON.parse(raw);

          await supabase.from('race_gameplans').insert({
            athlete_id: athlete.id,
            race_event_id: event.id,
            race_name: event.title,
            race_date: event.event_date,
            gameplan: gameplanJson,
            status: 'draft'
          });

          // Notify athlete
          if (athlete.user_id) {
            try {
              await notifyPlanReady(athlete.user_id, 'Laktic AI');
            } catch {
              // Ignore notification errors
            }
          }

          generated++;
        } catch {
          // eslint-disable-next-line no-console
          console.error(`[gameplans] Failed to generate gameplan for athlete ${athlete.id}`);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[gameplans] Cron error:', err);
  }
  return generated;
}

export default router;
