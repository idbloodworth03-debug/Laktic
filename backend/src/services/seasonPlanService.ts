/**
 * seasonPlanService.ts
 * Generates multi-week periodized training plans via GPT-4o.
 *
 * MIGRATION 034 — informational only.
 * Workouts are stored as JSONB inside athlete_seasons.season_plan, so no schema
 * migration is required to persist the new fields. If a dedicated workouts table
 * is added later, run the following:
 *
 *   ALTER TABLE workouts
 *     ADD COLUMN IF NOT EXISTS description     TEXT,
 *     ADD COLUMN IF NOT EXISTS why             TEXT,
 *     ADD COLUMN IF NOT EXISTS warmup_miles    NUMERIC(4,2),
 *     ADD COLUMN IF NOT EXISTS cooldown_miles  NUMERIC(4,2),
 *     ADD COLUMN IF NOT EXISTS main_set_miles  NUMERIC(4,2);
 */

import OpenAI from 'openai';
import { env } from '../config/env';
import { getFormattedKnowledge } from './knowledgeService';
import { getWeekStartDate, addDays } from '../utils/dateUtils';
import { PACE_PERSONA } from '../utils/pacePersona';
import {
  classifyAthleteTier,
  getPhaseFromDates,
  derivePaceBands,
  deriveEventPaces,
} from '../utils/athleteTier';
import {
  getMpwBand,
  getWarmupCooldown,
  getRoleMap,
  DISTRIBUTION_BY_PHASE,
  LONG_RUN_SHARE_BY_PHASE,
  ROTATION_LOGIC,
  WORKOUT_LIBRARY,
  PHASE_MODEL,
} from '../utils/coachParamLibrary';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ── System message: persona only, no data ────────────────────────────────────
const PLAN_SYSTEM_PROMPT = `${PACE_PERSONA}

You are generating a structured multi-week periodized training plan. Follow every rule exactly. Do not improvise.

Return ONLY valid JSON — no markdown fences, no explanation. The root key must be "weeks".`;

// ── Day name → day_of_week number ────────────────────────────────────────────
const DAY_NAME_TO_NUM: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 7,
};

// ── Map getMpwBand output → WORKOUT_LIBRARY volume key ───────────────────────
function toLibraryBand(mpwBand: string): string {
  if (mpwBand === 'over_50') return 'mpw_50_60';
  return mpwBand;
}

// ── Phase rules text for prompt injection ────────────────────────────────────
function buildPhaseRulesText(phase: string): string {
  const phaseModel = PHASE_MODEL[phase as keyof typeof PHASE_MODEL];
  const dist = DISTRIBUTION_BY_PHASE[phase];
  const lr = LONG_RUN_SHARE_BY_PHASE[phase as keyof typeof LONG_RUN_SHARE_BY_PHASE];

  const lines: string[] = [];
  if (phaseModel) lines.push(`Intent: ${phaseModel.intent}`);
  if (dist) {
    lines.push('Distribution: ' + Object.entries(dist)
      .map(([k, v]) => `${k} ${v.min_pct}-${v.max_pct}%`)
      .join(' | '));
  }
  if (lr) lines.push(`Long run: ${lr.min_pct}-${lr.max_pct}% of weekly volume. ${lr.notes}`);
  return lines.join('\n');
}

// ── Workout library summary for prompt injection ──────────────────────────────
function buildWorkoutLibraryText(phase: string, libraryBand: string): string {
  const phaseToUse = phase === 'ease_in' ? 'base' : phase;
  const entries = Object.entries(WORKOUT_LIBRARY).filter(([, w]) => (w as any).phase === phaseToUse);
  if (entries.length === 0) return '(Easy runs only during Ease-In phase)';
  return entries.map(([name, w]) => {
    const wo = w as any;
    let vol = '';
    if (wo.volume_by_mpw?.[libraryBand]) {
      const v = wo.volume_by_mpw[libraryBand];
      vol = ` [main set ${v.min_mi}-${v.max_mi} mi]`;
    } else if (wo.reps_by_mpw?.[libraryBand]) {
      const r = wo.reps_by_mpw[libraryBand];
      vol = ` [${r.min}-${r.max} reps]`;
    } else if (wo.sets_by_mpw?.[libraryBand]) {
      vol = ` [${wo.sets_by_mpw[libraryBand]} sets]`;
    }
    return `  ${name}: ${wo.description}${vol}`;
  }).join('\n');
}

// ── Rotation text ─────────────────────────────────────────────────────────────
function buildRotationText(phase: string): string {
  const r = ROTATION_LOGIC as any;
  if (phase === 'ease_in') return 'Ease-in: easy runs only, no specific work.';
  if (phase === 'base') {
    return `Aerobic: ${r.base_aerobic_rotation.join(' → ')}\nSpecific: ${r.base_specific_rotation.join(' → ')}\nNo-repeat window: ${r.non_repeat_window_weeks} weeks`;
  }
  if (phase === 'pre_competition') {
    return `Aerobic: ${r.pre_comp_aerobic_rotation.join(' → ')}\nSpecific: ${r.pre_comp_specific_rotation.join(' → ')}\nNo-repeat window: ${r.non_repeat_window_weeks} weeks`;
  }
  if (phase === 'competition') {
    return `Rotation: ${r.competition_specific_rotation.join(' → ')}\nNo-repeat window: ${r.non_repeat_window_weeks} weeks`;
  }
  return '';
}

// ── Tier rules ────────────────────────────────────────────────────────────────
function buildTierRules(tier: string): string {
  if (tier === 'beginner') {
    return [
      'If tier = beginner:',
      '- Weeks 1-2: easy runs only, 20-30 min, no pace targets, pace_guideline = "Easy effort — conversational pace"',
      '- No threshold or intervals until week 4',
      '- Max single run = 3.5 miles in week 1, 4.5 miles in week 2',
      '- Long run never exceeds 30% of weekly volume',
    ].join('\n');
  }
  if (tier === 'intermediate') {
    return [
      'If tier = intermediate:',
      '- Use lower end of MPW band volumes',
      '- Threshold from week 2, event-specific from week 4',
    ].join('\n');
  }
  return [
    'If tier = advanced:',
    '- Full param library volumes immediately',
    '- Show exact computed paces on every workout',
  ].join('\n');
}

// ── Build the full plan generation user prompt ────────────────────────────────
function buildPlanPrompt(params: {
  bot: any;
  botWorkouts: any[];
  athleteProfile: any;
  raceCalendar: any[];
  coachKnowledge: string;
  startDate: string;
  numWeeks: number;
  recentActivities?: any[];
  latestReadiness?: { score: number; label: string } | null;
  planType?: string;
}): string {
  const { bot, athleteProfile, raceCalendar, coachKnowledge, startDate, numWeeks, recentActivities, latestReadiness, planType } = params;
  const ap = athleteProfile;
  const today = new Date().toISOString().split('T')[0];

  // Pre-compute all values server-side
  const tier = classifyAthleteTier(ap);
  const phase = getPhaseFromDates(ap);
  const bands = derivePaceBands(ap);
  const events = deriveEventPaces(ap);
  const mpw = Number(ap.current_weekly_mileage || ap.weekly_volume_miles || 20);
  const trainingDays = Number(ap.training_days_per_week || 5);
  const mpwBand = getMpwBand(mpw);
  const libraryBand = toLibraryBand(mpwBand);
  const wc = getWarmupCooldown(mpwBand);
  const roleMapArr = getRoleMap(trainingDays, phase);
  const roleMapText = roleMapArr.join(', ');

  // Weeks to race
  const goalRaces = raceCalendar.filter((r: any) => r.is_goal_race && r.date >= today);
  goalRaces.sort((a: any, b: any) => a.date.localeCompare(b.date));
  const nextGoalRace = goalRaces[0];
  const weeksToRace = nextGoalRace
    ? Math.ceil((new Date(nextGoalRace.date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / (7 * 24 * 60 * 60 * 1000))
    : null;

  // Computed paces
  const lt2 = bands.needs_aerobic_pr ? 'null' : bands.LT2;
  const lt1 = bands.needs_aerobic_pr ? 'null' : bands.LT1;
  const steady = bands.needs_aerobic_pr ? 'null' : bands.steady;
  const easy = bands.needs_aerobic_pr ? 'null' : bands.easy;
  const recovery = bands.needs_aerobic_pr ? 'null' : bands.recovery;
  const milePace = events.mile_pace ?? 'null';
  const pace800 = events.pace_800 ?? 'null';
  const pace1500 = events.pace_1500 ?? 'null';

  const activitiesText = recentActivities && recentActivities.length > 0
    ? recentActivities.slice(0, 15).map((a: any) =>
        `  ${(a.start_date || '').slice(0, 10)}: ${a.activity_type || 'Run'} ${a.distance_miles ? a.distance_miles + ' mi' : ''} ${a.pace ? '@ ' + a.pace + '/mi' : ''}`
      ).join('\n')
    : '  No recent activities';

  const readinessText = latestReadiness
    ? `${latestReadiness.score}/100 — ${latestReadiness.label}${latestReadiness.score <= 40 ? ' — start conservatively this week' : latestReadiness.score >= 80 ? ' — full load OK' : ''}`
    : 'Not logged';

  return `You are Pace, an elite running coach. Generate a structured training plan. Follow every rule exactly. Do not improvise.

ATHLETE:
- Name: ${ap.name || 'Athlete'}, Age: ${ap.age ?? 'unknown'}, Experience: ${ap.experience_level || 'not specified'}
- Tier: ${tier}
- Weekly mileage target: ${mpw} mpw
- Training days/week: ${trainingDays}
- Events: ${(ap.primary_events || []).join(', ') || 'not specified'}
- Goal: ${ap.target_race_distance || 'not specified'} on ${ap.target_race_date || 'not specified'}${ap.goal_time ? ` — goal time: ${ap.goal_time}` : ''}
- PRs: 800m=${ap.pr_800m ?? 'none'} | 1500m=${ap.pr_1500m ?? 'none'} | Mile=${ap.pr_mile ?? 'none'} | 5K=${ap.pr_5k ?? 'none'}
- Fitness rating: ${ap.fitness_rating ?? 'not specified'}/10
- Injuries/limitations: ${ap.injury_notes || 'none'}
- Plan type: ${planType || 'standard'}
${coachKnowledge ? `\nCOACH KNOWLEDGE:\n${coachKnowledge}` : ''}
COACH PHILOSOPHY:
${bot.philosophy || 'Science-based periodized training.'}

RECENT ACTIVITIES (last 30 days):
${activitiesText}

CURRENT READINESS: ${readinessText}

COMPUTED TRAINING PACES — use these exact values in every workout. Do not guess or approximate:
- LT2 (threshold): ${lt2}/mi
- LT1: ${lt1}/mi
- Steady: ${steady}/mi
- Easy: ${easy}/mi
- Recovery: ${recovery}/mi
- Mile pace: ${milePace}/mi
- 800m pace: ${pace800} per 400m
- 1500m pace: ${pace1500} per 400m
Note: If a value is null, write "by effort" — do not invent a pace.

WARMUP AND COOLDOWN — use these exact distances on every non-easy non-rest day:
- Warmup: ${wc.warmup_mi} miles at easy pace (${easy}/mi)
- Cooldown: ${wc.cooldown_mi} miles at recovery pace (${recovery}/mi)

CURRENT TRAINING PHASE: ${phase}
WEEKS TO RACE: ${weeksToRace ?? 'no race set'}
MPW BAND: ${mpwBand}

WEEKLY ROLE MAP for ${trainingDays} days/week in ${phase} phase:
${roleMapText}
  - mon_aerobic / mon_easy = Monday aerobic or easy run
  - tue_easy = Tuesday easy
  - wed_easy_speeddev = Wednesday easy + speed development appended
  - thu_specific = Thursday quality/specific workout
  - fri_easy = Friday easy
  - sat_longrun = Saturday long run (easy effort, never split)
  - sun_off = Sunday rest

PHASE RULES:
${buildPhaseRulesText(phase)}

WORKOUT LIBRARY for phase "${phase === 'ease_in' ? 'base' : phase}", MPW band "${libraryBand}":
${buildWorkoutLibraryText(phase, libraryBand)}

ROTATION RULES:
${buildRotationText(phase)}

TIER RULES:
${buildTierRules(tier)}

MILEAGE ACCURACY — critical:
- total_distance = warmup_miles + main_set_miles + cooldown_miles, calculated precisely
- For intervals: count rep distances + jog recovery distances
- Weekly total must be within 5% of target weekly mileage (${mpw} mpw)
- Round to nearest 0.25 miles

GENERATION RULES:
1. Every week must be different — no repeated workout titles in adjacent weeks
2. Progressive overload: add 5-10% volume per week during build. Every 4th week = recovery (reduce 30-40%, easy only, phase="recovery")
3. Taper the final 2 weeks before goal races (reduce volume 20% then 40%, phase="taper")
4. Use ONLY named workouts from the library for quality days
5. The description field must include:
   a. Warmup: exact distance + pace
   b. Main set: every rep written out explicitly with distance, pace, rest
   c. Cooldown: exact distance + pace
   d. Coaching cue: 1-2 sentences from Pace on what to focus on
   Separate each section with a blank line (\\n\\n)
6. The why field: 1 sentence — why this workout this week

RACE CALENDAR:
${JSON.stringify(raceCalendar)}

TODAY: ${today} | PLAN STARTS: ${startDate} | TOTAL WEEKS: ${numWeeks}

OUTPUT — return valid JSON only, no markdown, no explanation:
{
  "weeks": [
    {
      "week_number": 1,
      "phase": "base",
      "total_miles": 28.5,
      "workouts": [
        {
          "day": "Monday",
          "day_of_week": 1,
          "date": "YYYY-MM-DD",
          "title": "Progressive Tempo Run",
          "type": "aerobic",
          "total_distance": 6.5,
          "distance_miles": 6.5,
          "pace_guideline": "5:02-5:12/mi building to 4:42-4:55/mi",
          "description": "Warmup: 1.0 mile easy at 6:45-7:15/mi.\\n\\nMain set: 4.5 miles progressive tempo. Start the first mile at LT1 (5:02-5:12/mi). Each mile, increase effort slightly. Finish at LT2 (4:42-4:55/mi).\\n\\nCooldown: 1.0 mile easy at recovery pace (7:15-8:00/mi).\\n\\nCoaching cue: The first mile should feel almost too easy. That is correct.",
          "why": "Progressive tempos train the aerobic system to handle increasing effort over time.",
          "change_reason": "Progressive tempos train the aerobic system to handle increasing effort over time.",
          "warmup_miles": 1.0,
          "cooldown_miles": 1.0,
          "main_set_miles": 4.5,
          "ai_adjustable": true
        }
      ]
    }
  ]
}

Generate the full ${numWeeks}-week season plan now.`;
}

// ── Normalize plan output to ensure backward-compatible field names ───────────
function normalizePlan(weeks: any[], startDate: string): any[] {
  return weeks.map((week: any, wi: number) => {
    const weekStart = week.week_start_date || addDays(startDate, wi * 7);
    const workouts = (week.workouts || []).map((wo: any) => {
      // day_of_week: accept number or derive from day name
      let dayNum: number = wo.day_of_week;
      if (!dayNum && wo.day) {
        dayNum = DAY_NAME_TO_NUM[(wo.day as string).toLowerCase()] ?? 1;
      }
      // distance_miles: prefer explicit, fall back to total_distance
      const dist = wo.distance_miles ?? wo.total_distance ?? 0;
      // change_reason: prefer explicit, fall back to why
      const reason = wo.change_reason ?? wo.why ?? '';
      // date: prefer explicit, else compute from week start + day_of_week
      const date = wo.date || (dayNum ? addDays(weekStart, dayNum - 1) : weekStart);
      return {
        ...wo,
        day_of_week: dayNum || 1,
        date,
        distance_miles: dist,
        total_distance: dist,
        change_reason: reason,
        why: reason,
        warmup_miles: wo.warmup_miles ?? null,
        cooldown_miles: wo.cooldown_miles ?? null,
        main_set_miles: wo.main_set_miles ?? null,
        ai_adjustable: wo.ai_adjustable ?? true,
      };
    });
    return {
      ...week,
      week_number: week.week_number ?? wi + 1,
      week_start_date: weekStart,
      workouts,
    };
  });
}

// ── Fallback plan when OpenAI fails ──────────────────────────────────────────
function fallbackPlan(botWorkouts: any[], startDate: string, numWeeks: number): any[] {
  const phases = ['base', 'build', 'build', 'recovery'];
  const multipliers = [1.0, 1.08, 1.15, 0.75];
  const weeks = [];

  for (let w = 0; w < numWeeks; w++) {
    const weekStart = addDays(startDate, w * 7);
    const phaseIdx = w % 4;
    const phase = phases[phaseIdx];
    const mult = multipliers[phaseIdx];
    const weekNum = w + 1;

    const workouts = (botWorkouts || []).map((wo: any) => {
      const dist = wo.ai_adjustable ? Math.round((wo.distance_miles || 0) * mult * 4) / 4 : (wo.distance_miles || 0);
      return {
        day_of_week: wo.day_of_week,
        date: addDays(weekStart, wo.day_of_week - 1),
        title: phase === 'recovery' && wo.ai_adjustable ? 'Easy Recovery Run' : wo.title,
        description: phase === 'recovery'
          ? 'Easy recovery run. Keep effort conversational throughout.\n\nCoaching cue: If you feel tired, slow down. This run is about recovery, not fitness.'
          : (wo.description || ''),
        distance_miles: dist,
        total_distance: dist,
        pace_guideline: phase === 'recovery' ? 'Very easy, conversational pace' : (wo.pace_guideline || ''),
        type: 'easy',
        ai_adjustable: wo.ai_adjustable,
        change_reason: phase === 'recovery'
          ? `Week ${weekNum} recovery — absorb training adaptations.`
          : `Week ${weekNum} ${phase} — ${mult > 1 ? `+${Math.round((mult - 1) * 100)}% volume` : 'base building'}.`,
        why: phase === 'recovery' ? `Recovery week ${weekNum}.` : `Week ${weekNum} ${phase}.`,
      };
    });

    weeks.push({ week_number: weekNum, week_start_date: weekStart, phase, workouts });
  }
  return weeks;
}

// ── Validate the top-level plan array ────────────────────────────────────────
function validatePlan(arr: any[]): boolean {
  return arr.every((w: any) => w.week_number && w.week_start_date && Array.isArray(w.workouts));
}

// ── Main generate function ────────────────────────────────────────────────────
export async function generate(params: {
  athleteProfile: any; bot: any; botWorkouts: any[];
  raceCalendar: any[]; startDate?: string; existingWeeks?: any[];
  recentActivities?: any[]; latestReadiness?: { score: number; label: string; recommended_intensity?: string } | null;
  planType?: string; athleteTier?: string;
}): Promise<{ plan: any[]; aiUsed: boolean }> {
  const { athleteProfile, bot, botWorkouts, raceCalendar, recentActivities, latestReadiness, planType } = params;
  const startDate = params.startDate || getWeekStartDate();
  const coachKnowledge = await getFormattedKnowledge(bot.id);

  // Determine number of weeks from goal races
  const goalRaces = raceCalendar.filter((r: any) => r.is_goal_race);
  let numWeeks = 8;
  if (goalRaces.length > 0) {
    const lastRace = goalRaces.sort((a: any, b: any) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(lastRace.date + 'T00:00:00Z');
    const diff = Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
    numWeeks = Math.min(Math.max(diff, 1), 24);
  }

  const personalityBlock = bot.personality_prompt
    ? `COACHING PERSONALITY: ${bot.personality_prompt}\n\nRespond in this coaching voice at all times. Never break character.\n\n`
    : '';

  const systemContent = personalityBlock + PLAN_SYSTEM_PROMPT;
  const userContent = buildPlanPrompt({
    bot, botWorkouts, athleteProfile, raceCalendar, coachKnowledge,
    startDate, numWeeks, recentActivities, latestReadiness, planType,
  });

  let rawWeeks: any[] | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
      });
      const text = completion.choices[0].message.content ?? '';
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed)
        ? parsed
        : (parsed.weeks ?? parsed.plan ?? parsed.data ?? null);
      if (Array.isArray(arr) && arr.length > 0) {
        const normalized = normalizePlan(arr, startDate);
        if (validatePlan(normalized)) {
          rawWeeks = normalized;
          break;
        }
      }
    } catch (err) {
      console.error(`[seasonPlan] OpenAI error attempt ${attempt + 1}:`, err);
    }
  }

  const existingWeeks = params.existingWeeks || [];
  const today = new Date().toISOString().split('T')[0];
  const pastWeeks = existingWeeks.filter((w: any) => w.week_start_date < today);

  if (rawWeeks) return { plan: [...pastWeeks, ...rawWeeks], aiUsed: true };

  console.warn('[seasonPlan] OpenAI failed, using fallback');
  return { plan: [...pastWeeks, ...fallbackPlan(botWorkouts, startDate, numWeeks)], aiUsed: false };
}
