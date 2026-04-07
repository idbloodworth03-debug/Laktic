/**
 * seasonPlanService.ts
 * Code-first plan generation: deterministic skeleton + GPT-4o descriptions only.
 *
 * MIGRATION 034 — informational only.
 * Workouts are stored as JSONB inside athlete_seasons.season_plan.
 * Fields: description, why, warmup_miles, cooldown_miles, main_set_miles require no SQL migration.
 */

import OpenAI from 'openai';
import { env } from '../config/env';
import { getWeekStartDate, addDays } from '../utils/dateUtils';
import {
  buildPlanSkeleton,
  validateAndFixPlan,
  PlannedWorkout,
  PlanSkeleton,
} from '../utils/planEngine';
import { classifyAthleteTier } from '../utils/athleteTier';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ── GPT-4o description system prompt ─────────────────────────────────────────

const DESC_SYSTEM = `You are Pace, an elite running coach. Write workout descriptions.
Be direct and specific. Use coaching voice — short sentences, no fluff.
Return ONLY valid JSON — no markdown, no explanation.`;

// ── Generate description for a single structured workout ─────────────────────

async function generateWorkoutDescription(
  wo:      PlannedWorkout,
  tier:    string,
  mpwBand: string,
  phase:   string,
  easyPg:  string,
  recPg:   string,
): Promise<{ description: string; why: string }> {
  const warmupLine   = wo.warmupMiles > 0 ? `${wo.warmupMiles} mi at easy pace (${easyPg})` : 'none';
  const cooldownLine = wo.cooldownMiles > 0 ? `${wo.cooldownMiles} mi at recovery pace (${recPg})` : 'none';

  const userContent = `Write a description for this workout:
Title: ${wo.title}
Type: ${wo.role}
Main set: ${wo.mainSetDescription}
Pace: ${wo.paceGuideline}
Warmup: ${warmupLine}
Cooldown: ${cooldownLine}
Athlete: ${tier}, ${mpwBand} mpw, ${phase} phase

Return JSON only:
{
  "description": "Full step-by-step instructions. If warmup exists: start with 'Warmup: X miles...' then blank line. Main set: every rep written out explicitly with distance, pace, rest. If cooldown exists: end with 'Cooldown: X miles...'. Blank line then one coaching cue from Pace.",
  "why": "One sentence on why this workout is in the plan this week."
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: DESC_SYSTEM },
        { role: 'user',   content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
    });
    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
    return {
      description: (parsed.description as string | undefined) ?? buildCodeDescription(wo, easyPg, recPg),
      why:         (parsed.why as string | undefined) ?? `${wo.title} supports ${phase} phase development.`,
    };
  } catch {
    return {
      description: buildCodeDescription(wo, easyPg, recPg),
      why:         `${wo.title} supports ${phase} phase development.`,
    };
  }
}

// ── Code-generated descriptions (easy runs, long runs, rest days) ─────────────

function buildCodeDescription(wo: PlannedWorkout, easyPg: string, _recPg: string): string {
  if (wo.isRestDay) return '';

  if (wo.role === 'easy' || wo.role === 'easy_speeddev') {
    const suffix = wo.role === 'easy_speeddev'
      ? '\n\nFinish with 4-6 x 100m strides at controlled fast effort. Walk back for full recovery after each.'
      : '';
    return `Easy run at ${easyPg}. Run by feel — this should be comfortable enough to hold a conversation the entire time.${suffix}`;
  }

  if (wo.role === 'long_run') {
    return (
      `${wo.mainSetDistance} miles easy at ${easyPg}. Run the entire distance at easy effort — never split.\n\n` +
      `Keep effort conversational throughout. If you have to think about your pace, you are going too hard.\n\n` +
      `Coaching cue: Easy means easy. Hold a conversation the entire way. This run builds your aerobic base — not your fitness limit.`
    );
  }

  // Fallback for structured workouts when GPT-4o fails
  const warmupPart   = wo.warmupMiles > 0 ? `Warmup: ${wo.warmupMiles} miles at ${easyPg}.\n\n` : '';
  const cooldownPart = wo.cooldownMiles > 0 ? `\n\nCooldown: ${wo.cooldownMiles} miles easy.` : '';
  return `${warmupPart}${wo.mainSetDescription}.${cooldownPart}`;
}

// ── Convert skeleton week → DB-format week ────────────────────────────────────

function skeletonWeekToDb(
  week:     PlanSkeleton['weeks'][0],
  easyPg:   string,
  recPg:    string,
  weekStart: string,
): any {
  const workouts = week.workouts.map(wo => ({
    day:              wo.day,
    day_of_week:      wo.dayOfWeek,
    date:             wo.date ?? addDays(weekStart, wo.dayOfWeek - 1),
    title:            wo.title,
    type:             wo.role,
    role:             wo.role,
    workout_key:      wo.workoutKey,
    distance_miles:   wo.totalDistance,
    total_distance:   wo.totalDistance,
    pace_guideline:   wo.paceGuideline,
    description:      wo.role === 'easy' || wo.role === 'easy_speeddev'
                        ? buildCodeDescription(wo, easyPg, recPg)
                        : wo.role === 'long_run'
                          ? buildCodeDescription(wo, easyPg, recPg)
                          : '',  // filled by GPT-4o
    library_description: wo.libraryDescription ?? '',
    why:              '',       // filled by GPT-4o
    change_reason:    '',       // filled by GPT-4o
    warmup_miles:     wo.warmupMiles  > 0 ? wo.warmupMiles  : null,
    cooldown_miles:   wo.cooldownMiles > 0 ? wo.cooldownMiles : null,
    main_set_miles:   wo.mainSetDistance > 0 ? wo.mainSetDistance : null,
    is_rest_day:      wo.isRestDay,
    ai_adjustable:    !wo.isRestDay,
    _planWorkout:     wo,       // temporary — stripped before save
  }));

  return {
    week_number:    week.weekNumber,
    week_start_date: weekStart,
    phase:          week.phase,
    total_miles:    week.targetMiles,
    workouts,
  };
}

// ── Needs GPT-4o description? ─────────────────────────────────────────────────

function needsGptDescription(wo: PlannedWorkout): boolean {
  if (wo.isRestDay) return false;
  if (wo.role === 'easy' || wo.role === 'easy_speeddev' || wo.role === 'long_run') return false;
  return true;
}

// ── Fallback plan ──────────────────────────────────────────────────────────────

function fallbackPlan(startDate: string, numWeeks: number, athlete: any): any[] {
  const tier        = classifyAthleteTier(athlete);
  const rawMpw      = Number(athlete.current_weekly_mileage ?? athlete.weekly_volume_miles ?? 0);
  const baseMpw     = rawMpw > 0 ? rawMpw : (tier === 'beginner' ? 12 : tier === 'intermediate' ? 25 : 40);
  const days        = Math.max(3, Math.min(7, Number(athlete.training_days_per_week ?? 4)));
  const easyMi      = Math.round(baseMpw / days * 4) / 4;

  const dayNums     = [1, 3, 5].slice(0, days); // Mon, Wed, Fri baseline
  const phases      = ['base', 'base', 'base', 'recovery'];
  const mults       = [1.0, 1.05, 1.10, 0.70];

  return Array.from({ length: numWeeks }, (_, wi) => {
    const weekStart = addDays(startDate, wi * 7);
    const phase     = phases[wi % 4];
    const mult      = mults[wi % 4];
    const workouts  = dayNums.map(dow => ({
      day_of_week:    dow,
      date:           addDays(weekStart, dow - 1),
      title:          'Easy Run',
      type:           'easy',
      role:           'easy',
      distance_miles: Math.round(easyMi * mult * 4) / 4,
      total_distance: Math.round(easyMi * mult * 4) / 4,
      pace_guideline: 'Easy effort — conversational pace',
      description:    'Easy run at conversational pace. Run by feel — comfortable enough to hold a conversation throughout.',
      why:            `Week ${wi + 1} ${phase} — easy running.`,
      change_reason:  `Week ${wi + 1} ${phase}.`,
      warmup_miles:   null,
      cooldown_miles: null,
      main_set_miles: null,
      is_rest_day:    false,
      ai_adjustable:  true,
    }));
    return { week_number: wi + 1, week_start_date: weekStart, phase, workouts };
  });
}

// ── Validate basic structure ──────────────────────────────────────────────────

function validatePlan(arr: any[]): boolean {
  return Array.isArray(arr) && arr.every((w: any) =>
    w.week_number && w.week_start_date && Array.isArray(w.workouts),
  );
}

// ── Main generate function ────────────────────────────────────────────────────

export async function generate(params: {
  athleteProfile:   any;
  bot:              any;
  botWorkouts:      any[];
  raceCalendar:     any[];
  startDate?:       string;
  existingWeeks?:   any[];
  recentActivities?: any[];
  latestReadiness?: { score: number; label: string; recommended_intensity?: string } | null;
  planType?:        string;
  athleteTier?:     string;
}): Promise<{ plan: any[]; aiUsed: boolean }> {
  console.log('[seasonPlan] generate() called — build 2026-04-06-v2');
  const { athleteProfile, raceCalendar } = params;
  const startDate   = params.startDate ?? getWeekStartDate();
  const today       = new Date().toISOString().slice(0, 10);

  // ── Step A: Build deterministic skeleton ─────────────────────────────────────
  let skeleton: PlanSkeleton;
  try {
    skeleton = buildPlanSkeleton(athleteProfile, startDate, raceCalendar);
  } catch (err) {
    console.error('[seasonPlan] planEngine failed, using fallback:', err);
    const numWeeks = 8;
    return {
      plan: [...(params.existingWeeks ?? []).filter((w: any) => w.week_start_date < today),
             ...fallbackPlan(startDate, numWeeks, athleteProfile)],
      aiUsed: false,
    };
  }

  console.log('[planEngine] skeleton week 1 workouts:', skeleton.weeks[0]?.workouts.map(w => w.title));

  const { tier, phase, mpwBand, paceBands, eventPaces, warmup, cooldown } = skeleton;
  const easyPg = paceBands?.easy ?? 'easy effort';
  const recPg  = paceBands?.recovery ?? 'recovery effort';

  // ── Step B: Convert skeleton to DB format, pre-fill easy descriptions ────────
  const dbWeeks: any[] = skeleton.weeks.map((week, wi) => {
    const weekStart = addDays(startDate, wi * 7);
    return skeletonWeekToDb(week, easyPg, recPg, weekStart);
  });

  // ── Step C: Call GPT-4o for structured workout descriptions in parallel ───────
  type DescTarget = { weekIdx: number; woIdx: number; planWo: PlannedWorkout };
  const targets: DescTarget[] = [];

  for (let wi = 0; wi < dbWeeks.length; wi++) {
    for (let woi = 0; woi < dbWeeks[wi].workouts.length; woi++) {
      const planWo: PlannedWorkout = dbWeeks[wi].workouts[woi]._planWorkout;
      if (needsGptDescription(planWo)) {
        targets.push({ weekIdx: wi, woIdx: woi, planWo });
      }
    }
  }

  console.log(`[seasonPlan] Generating GPT-4o descriptions for ${targets.length} structured workouts`);

  let aiUsed = false;

  if (targets.length > 0) {
    try {
      const results = await Promise.all(
        targets.map(t =>
          generateWorkoutDescription(t.planWo, tier, mpwBand, phase, easyPg, recPg),
        ),
      );

      for (let i = 0; i < targets.length; i++) {
        const { weekIdx, woIdx } = targets[i];
        const dbWo = dbWeeks[weekIdx].workouts[woIdx];
        dbWo.description  = results[i].description;
        dbWo.why          = results[i].why;
        dbWo.change_reason = results[i].why;
      }
      aiUsed = true;
    } catch (err) {
      console.error('[seasonPlan] GPT-4o description batch failed:', err);
      // Fallback: use code-generated descriptions for all remaining
      for (const t of targets) {
        const dbWo = dbWeeks[t.weekIdx].workouts[t.woIdx];
        if (!dbWo.description) {
          dbWo.description   = buildCodeDescription(t.planWo, easyPg, recPg);
          dbWo.why           = `${t.planWo.title} supports ${phase} phase development.`;
          dbWo.change_reason = dbWo.why;
        }
      }
    }
  }

  // ── Strip internal _planWorkout references before saving ─────────────────────
  for (const week of dbWeeks) {
    for (const wo of week.workouts) {
      delete wo._planWorkout;
    }
  }

  // ── Step D: Validate and fix before saving ────────────────────────────────────
  const validatedWeeks = validateAndFixPlan(dbWeeks, athleteProfile);

  if (!validatePlan(validatedWeeks)) {
    console.error('[seasonPlan] Plan failed validation after fix, using fallback');
    return {
      plan: [...(params.existingWeeks ?? []).filter((w: any) => w.week_start_date < today),
             ...fallbackPlan(startDate, skeleton.totalWeeks, athleteProfile)],
      aiUsed: false,
    };
  }

  // ── Preserve past weeks ───────────────────────────────────────────────────────
  const pastWeeks = (params.existingWeeks ?? []).filter((w: any) => w.week_start_date < today);

  console.log(
    `[seasonPlan] Plan complete — tier=${tier} phase=${phase} weeks=${validatedWeeks.length} ` +
    `easeIn=${skeleton.weeksOfEaseIn} mpw=${skeleton.weeks[0]?.targetMiles ?? 0} aiDescriptions=${aiUsed}`,
  );

  return { plan: [...pastWeeks, ...validatedWeeks], aiUsed };
}
