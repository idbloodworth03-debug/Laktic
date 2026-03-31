import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, requireCoach, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { filterText, containsSevereProfanity } from '../utils/contentFilter';
import { z } from 'zod';
import OpenAI from 'openai';
import { env } from '../config/env';

const router = Router();
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ── Schemas ───────────────────────────────────────────────────────────────────

const logReadinessSchema = z.object({
  sleep_hours: z.number().min(0).max(24).optional(),
  sleep_quality: z.number().int().min(1).max(5).optional(),
  mood: z.number().int().min(1).max(5).optional(),
  soreness: z.number().int().min(0).max(10).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  hrv_ms: z.number().positive().optional(),
  resting_hr: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

// ── Core readiness algorithm ──────────────────────────────────────────────────

interface ReadinessFactors {
  sleep_hours?: number;
  sleep_quality?: number;
  mood?: number;
  soreness?: number;
  energy?: number;
  hrv_ms?: number;
  resting_hr?: number;
  acwr?: number;
}

function computeReadinessScore(factors: ReadinessFactors): { score: number; penalties: Record<string, number> } {
  let score = 100;
  const penalties: Record<string, number> = {};

  // Sleep hours penalty
  if (factors.sleep_hours !== undefined) {
    if (factors.sleep_hours < 5) { penalties.sleep_hours = 20; score -= 20; }
    else if (factors.sleep_hours < 6) { penalties.sleep_hours = 12; score -= 12; }
    else if (factors.sleep_hours < 7) { penalties.sleep_hours = 6; score -= 6; }
  }

  // Sleep quality penalty (1-5 scale; 3 is neutral)
  if (factors.sleep_quality !== undefined) {
    const qualityPenalty = Math.max(0, (3 - factors.sleep_quality) * 8);
    if (qualityPenalty > 0) { penalties.sleep_quality = qualityPenalty; score -= qualityPenalty; }
  }

  // Mood penalty (1-5; 3 is neutral)
  if (factors.mood !== undefined) {
    const moodPenalty = Math.max(0, (3 - factors.mood) * 6);
    if (moodPenalty > 0) { penalties.mood = moodPenalty; score -= moodPenalty; }
  }

  // Soreness penalty (0-10; 4+ is notable)
  if (factors.soreness !== undefined) {
    if (factors.soreness >= 8) { penalties.soreness = 20; score -= 20; }
    else if (factors.soreness >= 6) { penalties.soreness = 12; score -= 12; }
    else if (factors.soreness >= 4) { penalties.soreness = 6; score -= 6; }
  }

  // Energy penalty (1-5; 3 is neutral)
  if (factors.energy !== undefined) {
    const energyPenalty = Math.max(0, (3 - factors.energy) * 7);
    if (energyPenalty > 0) { penalties.energy = energyPenalty; score -= energyPenalty; }
  }

  // ACWR penalty
  if (factors.acwr !== undefined) {
    if (factors.acwr > 1.5) { penalties.acwr = 15; score -= 15; }
    else if (factors.acwr > 1.3) { penalties.acwr = 8; score -= 8; }
  }

  // Clamp
  score = Math.min(100, Math.max(0, score));
  return { score, penalties };
}

function getReadinessLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Moderate';
  if (score >= 30) return 'Low';
  return 'Poor';
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/recovery/readiness — log daily readiness
router.post(
  '/readiness',
  auth,
  requireAthlete,
  validate(logReadinessSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    try {
      const athleteId = req.athlete.id;
      const { sleep_hours, sleep_quality, mood, soreness, energy, hrv_ms, resting_hr, notes: rawNotes, date } = req.body;
      if (rawNotes && containsSevereProfanity(rawNotes)) return res.status(400).json({ error: 'Your message contains inappropriate content' });
      const cleanNotes = rawNotes ? filterText(rawNotes) : null;

      const today = date ?? new Date().toISOString().slice(0, 10);

      // Compute ACWR for this athlete
      const now = new Date();
      const day28Ago = new Date(now);
      day28Ago.setDate(day28Ago.getDate() - 28);
      const { data: activities } = await supabase
        .from('athlete_activities')
        .select('start_date, distance_miles')
        .eq('athlete_id', athleteId)
        .gte('start_date', day28Ago.toISOString());

      const weekMiles = [0, 0, 0, 0];
      for (const act of activities ?? []) {
        const daysAgo = Math.floor((now.getTime() - new Date(act.start_date).getTime()) / 86400000);
        const wk = Math.floor(daysAgo / 7);
        if (wk < 4) weekMiles[wk] += act.distance_miles ?? 0;
      }
      const acute = weekMiles[0];
      const chronic = (weekMiles[0] + weekMiles[1] + weekMiles[2] + weekMiles[3]) / 4;
      const acwr = chronic > 0 ? Math.min(acute / chronic, 2.0) : 0;

      const factors: ReadinessFactors = { sleep_hours, sleep_quality, mood, soreness, energy, hrv_ms, resting_hr, acwr };
      const { score, penalties } = computeReadinessScore(factors);
      const label = getReadinessLabel(score);
      const recommended_intensity = score >= 80 ? 'hard' : score >= 60 ? 'moderate' : score >= 40 ? 'easy' : 'rest';

      // GPT one-liner
      let explanation: string | null = null;
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a sports performance coach. In exactly ONE short sentence (max 20 words), tell the athlete what their readiness score means for today\'s training. Be direct and specific.'
            },
            {
              role: 'user',
              content: JSON.stringify({ score, label, penalties, factors })
            }
          ],
          max_tokens: 60
        });
        explanation = completion.choices[0].message.content?.trim() ?? null;
      } catch {
        // GPT failed — use label
        explanation = `Your readiness is ${label.toLowerCase()} — adjust today's effort accordingly.`;
      }

      // Upsert daily_readiness (one row per athlete per date)
      const { data: readiness, error } = await supabase
        .from('daily_readiness')
        .upsert({
          athlete_id: athleteId,
          date: today,
          score,
          label,
          recommended_intensity,
          sleep_hours: sleep_hours ?? null,
          sleep_quality: sleep_quality ?? null,
          mood: mood ?? null,
          soreness: soreness ?? null,
          energy: energy ?? null,
          hrv_ms: hrv_ms ?? null,
          resting_hr: resting_hr ?? null,
          notes: cleanNotes,
          explanation,
          factors: penalties
        }, { onConflict: 'athlete_id,date' })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });

      // Upsert recovery_profiles with latest values
      await supabase
        .from('recovery_profiles')
        .upsert({
          athlete_id: athleteId,
          avg_readiness_7d: score, // simplified: will be recalculated below
          updated_at: new Date().toISOString()
        }, { onConflict: 'athlete_id' });

      // Low readiness trigger: if score <= 40, reduce next workout intensity
      if (score <= 40) {
        try {
          const { data: seasonRow } = await supabase
            .from('athlete_seasons')
            .select('id, season_plan')
            .eq('athlete_id', athleteId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (seasonRow?.season_plan) {
            const plan = (seasonRow.season_plan as any[]).map(w => ({ ...w }));
            const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
            let modified = false;
            outer: for (const week of plan) {
              for (const wo of week.workouts) {
                if ((wo.date === today || wo.date === tomorrow) && wo.ai_adjustable !== false) {
                  wo.distance_miles = wo.distance_miles ? Math.round(wo.distance_miles * 0.75 * 10) / 10 : wo.distance_miles;
                  wo.description = `[Low readiness — intensity auto-reduced] ${wo.description || ''}`.trim();
                  wo.change_reason = `Readiness score ${score}/100: auto-reduced to protect recovery`;
                  modified = true;
                  break outer;
                }
              }
            }
            if (modified) {
              await supabase.from('athlete_seasons')
                .update({ season_plan: plan, updated_at: new Date().toISOString() })
                .eq('id', seasonRow.id);
            }
          }
        } catch { /* non-blocking */ }
      }

      return res.status(201).json({ ...readiness, explanation });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to log readiness' });
    }
  })
);

// GET /api/recovery/readiness — recent readiness logs
router.get(
  '/readiness',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const days = Math.min(parseInt(String(req.query.days ?? '14'), 10), 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
      .from('daily_readiness')
      .select('*')
      .eq('athlete_id', req.athlete.id)
      .gte('date', since.toISOString().slice(0, 10))
      .order('date', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data ?? []);
  })
);

// GET /api/recovery/today — today's readiness
router.get(
  '/today',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await supabase
      .from('daily_readiness')
      .select('*')
      .eq('athlete_id', req.athlete.id)
      .eq('date', today)
      .single();

    if (!data) return res.json({ logged: false });
    return res.json({ logged: true, ...data });
  })
);

// GET /api/recovery/team — coach view: all athletes' latest readiness
router.get(
  '/team',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {

    const { data: teamData } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (!teamData) return res.status(404).json({ error: 'No team found' });

    const { data: members } = await supabase
      .from('team_members')
      .select('athlete_id, athlete_profiles!athlete_id(id, name)')
      .eq('team_id', teamData.id)
      .is('left_at', null);

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const results = [];
    for (const member of members ?? []) {
      const athlete = (member as any).athlete_profiles;
      if (!athlete) continue;

      const { data: latest } = await supabase
        .from('daily_readiness')
        .select('date, score, label, sleep_hours, soreness, energy, explanation')
        .eq('athlete_id', athlete.id)
        .gte('date', yesterday)
        .order('date', { ascending: false })
        .limit(1)
        .single();

      // Map to shape TeamRecovery expects
      const score = latest?.score ?? null;
      let recommended_intensity: string | null = null;
      if (score !== null) {
        if (score >= 80) recommended_intensity = 'Hard';
        else if (score >= 60) recommended_intensity = 'Moderate';
        else if (score >= 40) recommended_intensity = 'Easy';
        else recommended_intensity = 'Rest';
      }

      results.push({
        athlete_id: athlete.id,
        athlete_name: athlete.name,
        readiness_score: score,
        recommended_intensity,
        explanation: latest?.explanation ?? null,
        computed_at: latest?.date ?? null,
      });
    }

    return res.json(results);
  })
);

export default router;
