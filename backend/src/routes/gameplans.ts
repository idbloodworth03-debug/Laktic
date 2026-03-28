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
  distance: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional()
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
  raceEventId?: string
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

  // Fetch athlete profile
  const { data: athlete } = await supabase
    .from('athlete_profiles')
    .select('name, weekly_volume_miles, primary_events, pr_mile, pr_5k')
    .eq('id', athleteId)
    .single();

  // Weather (optional)
  let weatherInfo = 'Weather data unavailable';
  if (lat !== undefined && lon !== undefined) {
    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,windspeed_10m_max,precipitation_sum&timezone=auto&forecast_days=7`;
      const weatherRes = await fetch(weatherUrl);
      if (weatherRes.ok) {
        const weatherData: any = await weatherRes.json();
        const idx = (weatherData.daily?.time ?? []).indexOf(raceDate);
        if (idx !== -1) {
          const tempMax = weatherData.daily.temperature_2m_max[idx];
          const windspeed = weatherData.daily.windspeed_10m_max[idx];
          const precip = weatherData.daily.precipitation_sum[idx];
          weatherInfo = `High: ${tempMax}°C, Wind: ${windspeed} km/h, Precipitation: ${precip}mm`;
        }
      }
    } catch {
      // Weather fetch failed — proceed without it
    }
  }

  const prompt = {
    athlete: {
      name: athlete?.name,
      weekly_volume_miles: athlete?.weekly_volume_miles,
      primary_events: athlete?.primary_events,
      pr_mile: athlete?.pr_mile,
      pr_5k: athlete?.pr_5k
    },
    race: { name: raceName, date: raceDate, distance: distance ?? 'unknown' },
    recent_activities_last_28_days: actSummary.slice(0, 20),
    injury_risk: riskScore ?? null,
    weather_on_race_day: weatherInfo
  };

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an elite running coach AI. Generate a detailed race gameplan based on the athlete data provided. Respond ONLY with valid JSON in this exact structure:
{
  "pacing_strategy": { "first_mile": "...", "middle_miles": "...", "final_mile": "...", "explanation": "..." },
  "warmup_routine": [{ "step": "...", "duration": "...", "intensity": "..." }],
  "nutrition_timing": [{ "time_before_race": "...", "what": "...", "why": "..." }],
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
    const { race_name, race_date, distance, lat, lon } = req.body;
    const athleteId = req.athlete.id;
    const userId = req.user!.id;

    let gameplanJson: Record<string, unknown> = {};
    try {
      const raw = await generateGameplanForAthlete(athleteId, race_name, race_date, distance, lat, lon);
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
