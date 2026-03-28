import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireCoach, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import OpenAI from 'openai';
import { env } from '../config/env';
import { notifyPlanReady } from '../services/notificationService';

const router = Router();
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeStringToSeconds(timeStr: string): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function secondsToTimeString(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function riegelPredict(baseTimeSec: number, baseDistM: number, targetDistM: number): number {
  return baseTimeSec * Math.pow(targetDistM / baseDistM, 1.06);
}

async function computePredictionsForAthlete(athleteId: string): Promise<Array<{
  distance: string;
  predicted_time_seconds: number;
  confidence: string;
  trend: string;
  explanation: string;
}>> {
  const now = new Date();
  const day56Ago = new Date(now);
  day56Ago.setDate(day56Ago.getDate() - 56);

  // Fetch last 8 weeks of race results
  const { data: raceResults } = await supabase
    .from('race_results')
    .select('distance, finish_time, race_date, is_pr')
    .eq('athlete_id', athleteId)
    .gte('race_date', day56Ago.toISOString().slice(0, 10))
    .order('race_date', { ascending: false });

  // Fetch athlete profile for PRs
  const { data: athlete } = await supabase
    .from('athlete_profiles')
    .select('pr_mile, pr_5k, weekly_volume_miles')
    .eq('id', athleteId)
    .single();

  // Fetch weekly summaries for trend
  const { data: weeklySummaries } = await supabase
    .from('weekly_summaries')
    .select('week_start, total_miles')
    .eq('athlete_id', athleteId)
    .gte('week_start', day56Ago.toISOString().slice(0, 10))
    .order('week_start', { ascending: false })
    .limit(8);

  // Compute training load trend
  const summaries = weeklySummaries ?? [];
  let trainingAdjustment = 1.0;
  if (summaries.length >= 4) {
    const recent4 = summaries.slice(0, 4).reduce((s, w) => s + (w.total_miles ?? 0), 0) / 4;
    const prior4 = summaries.slice(4).reduce((s, w) => s + (w.total_miles ?? 0), 0) / Math.max(summaries.slice(4).length, 1);
    if (prior4 > 0) {
      const change = (recent4 - prior4) / prior4;
      if (change > 0.05) trainingAdjustment = 0.98; // improving → faster
      else if (change < -0.05) trainingAdjustment = 1.02; // declining → slower
    }
  }

  // Determine base time for Riegel
  let baseTimeSec: number | null = null;
  let baseDistM: number | null = null;

  // Look for 5K result first
  const fiveKResult = (raceResults ?? []).find(r =>
    r.distance?.toLowerCase().includes('5k') || r.distance?.toLowerCase().includes('5000')
  );
  if (fiveKResult?.finish_time) {
    const t = timeStringToSeconds(fiveKResult.finish_time);
    if (t) { baseTimeSec = t; baseDistM = 5000; }
  }

  // Fall back to pr_5k from profile
  if (!baseTimeSec && athlete?.pr_5k) {
    const t = timeStringToSeconds(athlete.pr_5k);
    if (t) { baseTimeSec = t; baseDistM = 5000; }
  }

  // Fall back to pr_mile
  if (!baseTimeSec && athlete?.pr_mile) {
    const t = timeStringToSeconds(athlete.pr_mile);
    if (t) { baseTimeSec = t; baseDistM = 1609; }
  }

  // Build baseline predictions using Riegel
  const distances: Array<{ key: string; meters: number }> = [
    { key: '5K', meters: 5000 },
    { key: '10K', meters: 10000 },
    { key: 'half_marathon', meters: 21097 },
    { key: 'marathon', meters: 42195 }
  ];

  const riegelPredictions: Record<string, number> = {};
  if (baseTimeSec && baseDistM) {
    for (const d of distances) {
      riegelPredictions[d.key] = Math.round(riegelPredict(baseTimeSec, baseDistM, d.meters) * trainingAdjustment);
    }
  }

  // Send to GPT-4o for refined predictions
  const prompt = {
    athlete: {
      weekly_volume_miles: athlete?.weekly_volume_miles,
      pr_mile: athlete?.pr_mile,
      pr_5k: athlete?.pr_5k
    },
    recent_race_results: (raceResults ?? []).slice(0, 5),
    riegel_baseline_predictions: Object.entries(riegelPredictions).map(([d, t]) => ({
      distance: d,
      predicted_time: secondsToTimeString(t),
      predicted_seconds: t
    })),
    training_load_trend: trainingAdjustment < 1 ? 'improving' : trainingAdjustment > 1 ? 'declining' : 'stable',
    weekly_summaries_last_8_weeks: summaries.slice(0, 8)
  };

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a performance analytics AI for runners. Based on the athlete data, predict race times. Use the Riegel baseline as a starting point and adjust based on training trends and race history. Respond ONLY with valid JSON:
{
  "5K": { "predicted_time_seconds": 0, "confidence": "low|medium|high", "trend": "improving|plateau|declining", "explanation": "..." },
  "10K": { "predicted_time_seconds": 0, "confidence": "low|medium|high", "trend": "improving|plateau|declining", "explanation": "..." },
  "half_marathon": { "predicted_time_seconds": 0, "confidence": "low|medium|high", "trend": "improving|plateau|declining", "explanation": "..." },
  "marathon": { "predicted_time_seconds": 0, "confidence": "low|medium|high", "trend": "improving|plateau|declining", "explanation": "..." }
}`
      },
      { role: 'user', content: JSON.stringify(prompt) }
    ],
    response_format: { type: 'json_object' }
  });

  const gptResult: any = JSON.parse(completion.choices[0].message.content ?? '{}');

  return distances.map(d => {
    const pred = gptResult[d.key];
    const riegelSec = riegelPredictions[d.key] ?? (pred?.predicted_time_seconds ?? 1800);
    return {
      distance: d.key,
      predicted_time_seconds: pred?.predicted_time_seconds ?? riegelSec,
      confidence: pred?.confidence ?? 'low',
      trend: pred?.trend ?? 'plateau',
      explanation: pred?.explanation ?? ''
    };
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/predictions/compute
router.post('/compute', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const athleteId = req.athlete.id;
  const userId = req.user!.id;

  let predictions: Awaited<ReturnType<typeof computePredictionsForAthlete>>;
  try {
    predictions = await computePredictionsForAthlete(athleteId);
  } catch {
    return res.status(400).json({ error: 'Failed to compute predictions' });
  }

  const results = [];
  for (const pred of predictions) {
    // Check previous prediction for improvement notification
    const { data: existing } = await supabase
      .from('performance_predictions')
      .select('predicted_time_seconds')
      .eq('athlete_id', athleteId)
      .eq('distance', pred.distance)
      .single();

    const { data: upserted } = await supabase
      .from('performance_predictions')
      .upsert({
        athlete_id: athleteId,
        distance: pred.distance,
        predicted_time_seconds: pred.predicted_time_seconds,
        confidence: pred.confidence,
        trend: pred.trend,
        explanation: pred.explanation,
        computed_at: new Date().toISOString()
      }, { onConflict: 'athlete_id,distance' })
      .select()
      .single();

    // Notify if improved by more than 10 seconds
    if (existing && (existing.predicted_time_seconds - pred.predicted_time_seconds) > 10) {
      try {
        await notifyPlanReady(userId, 'Laktic AI');
      } catch {
        // Ignore
      }
    }

    results.push(upserted ?? pred);
  }

  return res.json({ predictions: results });
}));

// POST /api/predictions/compute-all
router.post('/compute-all', auth, requireCoach, asyncHandler(async (req: AuthRequest, res) => {
  const { data: teamData } = await supabase
    .from('teams')
    .select('id')
    .eq('coach_id', req.coach.id)
    .single();

  if (!teamData) return res.status(404).json({ error: 'No team found' });

  const { data: members } = await supabase
    .from('team_members')
    .select('athlete_id, athlete_profiles!athlete_id(id, user_id)')
    .eq('team_id', teamData.id)
    .is('left_at', null);

  const results = [];
  for (const member of members ?? []) {
    const profile = (member as any).athlete_profiles;
    if (!profile) continue;
    try {
      const predictions = await computePredictionsForAthlete(profile.id);
      for (const pred of predictions) {
        await supabase.from('performance_predictions').upsert({
          athlete_id: profile.id,
          distance: pred.distance,
          predicted_time_seconds: pred.predicted_time_seconds,
          confidence: pred.confidence,
          trend: pred.trend,
          explanation: pred.explanation,
          computed_at: new Date().toISOString()
        }, { onConflict: 'athlete_id,distance' });
      }
      results.push({ athlete_id: profile.id, predictions });
    } catch {
      results.push({ athlete_id: profile.id, error: 'Computation failed' });
    }
  }

  return res.json({ results });
}));

// GET /api/predictions/my
router.get('/my', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('performance_predictions')
    .select('*')
    .eq('athlete_id', req.athlete.id)
    .order('distance');

  if (error) return res.status(400).json({ error: error.message });

  // Augment with formatted time strings
  const formatted = (data ?? []).map(p => ({
    ...p,
    predicted_time_formatted: secondsToTimeString(p.predicted_time_seconds)
  }));

  return res.json(formatted);
}));

// GET /api/predictions/team
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
    .from('performance_predictions')
    .select('*, athlete_profiles!athlete_id(name)')
    .in('athlete_id', athleteIds)
    .order('athlete_id');

  if (error) return res.status(400).json({ error: error.message });

  const formatted = (data ?? []).map(p => ({
    ...p,
    predicted_time_formatted: secondsToTimeString(p.predicted_time_seconds)
  }));

  return res.json(formatted);
}));

export default router;
