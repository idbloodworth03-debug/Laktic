import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { bodyMetricsSchema, fuelLogEntrySchema, fuelCalculatorSchema } from '../schemas';
import OpenAI from 'openai';
import { env } from '../config/env';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const router = Router();

// ── Body Metrics ──────────────────────────────────────────────────────────────

router.get(
  '/body-metrics',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data } = await supabase
      .from('athlete_body_metrics')
      .select('*')
      .eq('athlete_id', req.athlete.id)
      .single();
    res.json(data || null);
  })
);

router.put(
  '/body-metrics',
  auth,
  requireAthlete,
  validate(bodyMetricsSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data, error } = await supabase
      .from('athlete_body_metrics')
      .upsert(
        { athlete_id: req.athlete.id, ...req.body, updated_at: new Date().toISOString() },
        { onConflict: 'athlete_id' }
      )
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// ── Fuel Log ──────────────────────────────────────────────────────────────────

router.get(
  '/fuel-log',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const days = parseInt((req.query.days as string) || '30', 10);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data } = await supabase
      .from('fuel_log')
      .select('*')
      .eq('athlete_id', req.athlete.id)
      .gte('logged_at', since.toISOString().slice(0, 10))
      .order('logged_at', { ascending: false });

    res.json(data || []);
  })
);

router.post(
  '/fuel-log',
  auth,
  requireAthlete,
  validate(fuelLogEntrySchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data, error } = await supabase
      .from('fuel_log')
      .insert({ athlete_id: req.athlete.id, ...req.body })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

router.delete(
  '/fuel-log/:id',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { data: entry } = await supabase
      .from('fuel_log')
      .select('id')
      .eq('id', id)
      .eq('athlete_id', req.athlete.id)
      .single();
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    await supabase.from('fuel_log').delete().eq('id', id);
    res.json({ ok: true });
  })
);

// ── Fueling Calculator ────────────────────────────────────────────────────────

router.get(
  '/fueling-calculator',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = fuelCalculatorSchema.safeParse({
      duration_min: Number(req.query.duration_min),
      temp_c: req.query.temp_c !== undefined ? Number(req.query.temp_c) : undefined
    });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid parameters.' });

    const { duration_min, temp_c } = parsed.data;

    // Load stored body metrics for personalised calculation
    const { data: metrics } = await supabase
      .from('athlete_body_metrics')
      .select('weight_kg, sweat_rate_ml_per_hr')
      .eq('athlete_id', req.athlete.id)
      .single();

    const weightKg = metrics?.weight_kg ?? 68; // default 68 kg
    const sweatRateBase = metrics?.sweat_rate_ml_per_hr ?? 500;

    // Heat multiplier
    let heatMultiplier = 1.0;
    if (temp_c !== undefined) {
      if (temp_c > 32) heatMultiplier = 1.4;
      else if (temp_c > 25) heatMultiplier = 1.2;
      else if (temp_c > 18) heatMultiplier = 1.05;
    }

    // Hydration: sweat rate × duration + heat adjustment
    const hydrationMl = Math.round((sweatRateBase / 60) * duration_min * heatMultiplier);

    // Calorie burn estimate (MET 11 for running ~10 min/mile pace)
    const calsBurned = Math.round(11 * weightKg * (duration_min / 60));

    // Post-run replenishment targets (within 30-min window)
    // Carbs: 0.8g/kg for first hour, scales with duration
    const durationHours = duration_min / 60;
    const carbsG = Math.round(Math.min(weightKg * 0.8 * durationHours + 20, 120));
    const proteinG = Math.round(weightKg * 0.25);
    const replenishCals = Math.round(carbsG * 4 + proteinG * 4 + 5 * 9); // carbs + protein + ~5g fat

    res.json({
      duration_min,
      temp_c: temp_c ?? null,
      heat_multiplier: heatMultiplier,
      hydration_ml: hydrationMl,
      cals_burned: calsBurned,
      post_run: {
        calories: replenishCals,
        carbs_g: carbsG,
        protein_g: proteinG,
        window_minutes: 30,
        tip: duration_min >= 90
          ? 'Long run — prioritise carb-heavy recovery meal within 30 min, then a full meal within 2 hours.'
          : 'Aim for a balanced snack with carbs and protein within 30 minutes.'
      }
    });
  })
);

// ── AI Nutrition Advice ───────────────────────────────────────────────────────

// GET /api/athlete/nutrition/advice — AI-generated pre/during/post advice for next workout
router.get(
  '/nutrition/advice',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const athleteId = req.athlete.id;
    const today = new Date().toISOString().slice(0, 10);

    // Load body metrics + next workout in parallel
    const [{ data: metrics }, { data: season }] = await Promise.all([
      supabase.from('athlete_body_metrics').select('weight_kg, height_cm, sweat_rate_ml_per_hr').eq('athlete_id', athleteId).single(),
      supabase.from('athlete_seasons').select('season_plan').eq('athlete_id', athleteId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).single(),
    ]);

    // Find next upcoming non-rest workout
    let nextWorkout: any = null;
    if (season?.season_plan) {
      outer: for (const week of (season.season_plan as any[])) {
        for (const wo of (week.workouts || [])) {
          if (wo.date >= today && (wo.distance_miles || 0) > 0 && !wo.is_rest_day) {
            nextWorkout = { ...wo, week_phase: week.phase };
            break outer;
          }
        }
      }
    }

    if (!nextWorkout) return res.json({ workout: null, advice: null });

    const weightKg = metrics?.weight_kg ?? 68;
    const sweatRate = metrics?.sweat_rate_ml_per_hr ?? 500;
    const estimatedMinutes = Math.round((nextWorkout.distance_miles || 5) * 10); // rough 10 min/mile
    const needsMidFuel = estimatedMinutes > 60;

    const metricsLine = metrics
      ? `Weight ${weightKg}kg, Height ${metrics.height_cm ?? 'unknown'}cm, Sweat rate ${sweatRate}ml/hr`
      : 'No body metrics on file — use typical 68kg runner defaults';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an elite running nutritionist. Give precise, specific nutrition advice for a runner\'s next workout. Name real foods with exact amounts. Never say "eat carbs" — say "2 slices of sourdough with honey". Respond only with valid JSON matching the structure provided.',
        },
        {
          role: 'user',
          content: `Next workout: ${nextWorkout.title} — ${nextWorkout.distance_miles} miles on ${nextWorkout.date}${nextWorkout.pace_guideline ? ` @ ${nextWorkout.pace_guideline}/mi` : ''}${nextWorkout.description ? `. ${nextWorkout.description}` : ''}.
Training phase: ${nextWorkout.week_phase || 'base'}.
Athlete: ${metricsLine}.
Estimated duration: ~${estimatedMinutes} minutes.

Respond with JSON:
{
  "night_before": "specific dinner recommendation with foods and portions",
  "morning_of": "timed eating plan e.g. '2h before: X. 30min before: Y. 10min before: Z'",
  "during": ${needsMidFuel ? '"what to carry and when — specific gels, chews, or real food with mile markers"' : 'null'},
  "after": "recovery meal within 30 min with specific foods, then a real meal within 2 hours — give examples"
}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 700,
    });

    let advice: any = null;
    try { advice = JSON.parse(completion.choices[0].message.content ?? '{}'); } catch { /* use null */ }

    res.json({ workout: nextWorkout, advice, generated_at: new Date().toISOString() });
  })
);

// ── Weather Proxy ─────────────────────────────────────────────────────────────
// Returns current weather at the team's most recent practice location.
// Uses Open-Meteo (free, no API key required).

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Heavy thunderstorm with hail'
};

router.get(
  '/weather',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    // Find athlete's team to get a practice location
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

    if (!membership) return res.json(null);

    // Get the most recent practice event with a location
    const { data: event } = await supabase
      .from('team_calendar_events')
      .select('location_lat, location_lng, location_name')
      .eq('team_id', membership.team_id)
      .eq('event_type', 'practice')
      .not('location_lat', 'is', null)
      .order('event_date', { ascending: false })
      .limit(1)
      .single();

    if (!event?.location_lat || !event?.location_lng) return res.json(null);

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${event.location_lat}&longitude=${event.location_lng}` +
        `&current_weather=true&temperature_unit=celsius`;

      const response = await fetch(url);
      if (!response.ok) return res.json(null);

      const weather = await response.json() as any;
      const cw = weather.current_weather;
      if (!cw) return res.json(null);

      res.json({
        temp_c: cw.temperature,
        windspeed_kmh: cw.windspeed,
        description: WMO_DESCRIPTIONS[cw.weathercode] ?? 'Unknown',
        weathercode: cw.weathercode,
        location_name: event.location_name ?? null
      });
    } catch {
      res.json(null);
    }
  })
);

export default router;
