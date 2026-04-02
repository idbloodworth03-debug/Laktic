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
  WARMUP_COOLDOWN_SCALING,
  WEEKLY_PATTERN,
  WORKOUT_LIBRARY,
  DISTRIBUTION_BY_PHASE,
  LONG_RUN_SHARE_BY_PHASE,
  ROTATION_LOGIC,
  SPEED_DEVELOPMENT_MENUS,
  PHASE_MODEL,
} from '../utils/coachParamLibrary';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const SHORT_SYSTEM_PROMPT = `${PACE_PERSONA}

You are generating a complete multi-week periodized training season plan.
Return ONLY valid JSON with no markdown fences.
Wrap the array in: { "plan": [{ week_number, week_start_date, phase, workouts: [...] }] }

Each workout must have these fields:
- day_of_week (1=Mon … 7=Sun)
- date (YYYY-MM-DD)
- title (short workout name, e.g. "Progressive Tempo Run")
- description (FULL step-by-step: "Warmup: X mi easy. Main Set: [details]. Cooldown: Y mi easy. Coaching Cue: [one cue].")
- distance_miles (EXACT total including warmup + main set + cooldown)
- pace_guideline (e.g. "6:45-7:15/mi easy" or "4:42-4:55/mi LT2")
- type (one of: easy, aerobic, specific, bridge, speed_dev, long_run, off)
- ai_adjustable (boolean)
- change_reason (one sentence: why THIS workout THIS week)`;

// Map getMpwBand output → WORKOUT_LIBRARY volume key
function toLibraryBand(mpwBand: string): string {
  if (mpwBand === 'over_50') return 'mpw_50_60';
  return mpwBand;
}

function getRoleMapText(phase: string, trainingDays: number): string {
  const d = `d${Math.min(Math.max(trainingDays, 3), 7)}` as keyof typeof WEEKLY_PATTERN.role_maps.ease_in;
  const map =
    phase === 'ease_in'
      ? WEEKLY_PATTERN.role_maps.ease_in[d] ?? WEEKLY_PATTERN.role_maps.ease_in.d5
      : WEEKLY_PATTERN.role_maps.training_phases[d as keyof typeof WEEKLY_PATTERN.role_maps.training_phases] ??
        WEEKLY_PATTERN.role_maps.training_phases.d5;
  return (map as readonly string[]).join(', ');
}

function getPhaseRulesText(phase: string): string {
  const phaseModel = PHASE_MODEL[phase as keyof typeof PHASE_MODEL];
  const dist = DISTRIBUTION_BY_PHASE[phase];
  const lr = LONG_RUN_SHARE_BY_PHASE[phase as keyof typeof LONG_RUN_SHARE_BY_PHASE];
  const speedDev = SPEED_DEVELOPMENT_MENUS[phase];

  const lines: string[] = [];
  if (phaseModel) {
    lines.push(`Intent: ${phaseModel.intent}`);
  }
  if (dist) {
    const distStr = Object.entries(dist)
      .map(([k, v]) => `${k} ${v.min_pct}-${v.max_pct}%`)
      .join(' | ');
    lines.push(`Distribution: ${distStr}`);
  }
  if (lr) {
    lines.push(`Long run: ${lr.min_pct}-${lr.max_pct}% of weekly volume. ${lr.notes}`);
  }
  if (speedDev && speedDev.length > 0) {
    lines.push(`Speed dev options (wed): ${speedDev.slice(0, 2).join('; ')}`);
  }
  return lines.join('\n');
}

function getWorkoutLibraryText(phase: string, libraryBand: string): string {
  const phaseToUse = phase === 'ease_in' ? 'base' : phase;
  const entries = Object.entries(WORKOUT_LIBRARY).filter(
    ([, w]) => (w as any).phase === phaseToUse
  );

  const lines = entries.map(([name, w]) => {
    const wo = w as any;
    let volumeInfo = '';
    if (wo.volume_by_mpw?.[libraryBand]) {
      const v = wo.volume_by_mpw[libraryBand];
      volumeInfo = ` [main set: ${v.min_mi}-${v.max_mi} mi]`;
    } else if (wo.reps_by_mpw?.[libraryBand]) {
      const r = wo.reps_by_mpw[libraryBand];
      volumeInfo = ` [${r.min}-${r.max} reps]`;
    } else if (wo.sets_by_mpw?.[libraryBand]) {
      volumeInfo = ` [${wo.sets_by_mpw[libraryBand]} sets]`;
    } else if (wo.reps_150_by_mpw?.[libraryBand]) {
      volumeInfo = ` [${wo.reps_150_by_mpw[libraryBand]}x150m]`;
    }
    const tags = wo.tags ? ` (${wo.tags.join(', ')})` : '';
    return `  ${name}:${tags} ${wo.description}${volumeInfo}`;
  });
  return lines.join('\n');
}

function getRotationText(phase: string): string {
  if (phase === 'ease_in') return 'Ease-in: easy runs only, no specific work.';
  const r = ROTATION_LOGIC as any;
  if (phase === 'base') {
    return `Aerobic rotation: ${r.base_aerobic_rotation.join(' → ')}\nSpecific rotation: ${r.base_specific_rotation.join(' → ')}\nNo-repeat window: ${r.non_repeat_window_weeks} weeks`;
  }
  if (phase === 'pre_competition') {
    return `Aerobic rotation: ${r.pre_comp_aerobic_rotation.join(' → ')}\nSpecific rotation: ${r.pre_comp_specific_rotation.join(' → ')}\nNo-repeat window: ${r.non_repeat_window_weeks} weeks`;
  }
  if (phase === 'competition') {
    return `Specific rotation: ${r.competition_specific_rotation.join(' → ')}\nNo-repeat window: ${r.non_repeat_window_weeks} weeks`;
  }
  return '';
}

function getTierRules(tier: string): string {
  if (tier === 'beginner') {
    return `BEGINNER RULES:
- Weeks 1-2: easy runs ONLY. No threshold, tempo, or specific work.
- Max single workout: 3.5 miles.
- No workout harder than easy/conversational effort.
- No speed development until week 3+.
- Focus: habit formation, injury-free accumulation.`;
  }
  if (tier === 'intermediate') {
    return `INTERMEDIATE RULES:
- Use the LOWER end of each MPW band for volumes and reps.
- Introduce threshold work gradually (weeks 2+).
- Limit speed dev to 4 reps max.
- One quality session per week max in first 2 weeks.`;
  }
  return `ADVANCED RULES:
- Use full workout library as prescribed.
- Can handle full MPW band volumes and reps from week 1.
- Two quality sessions per week allowed (aerobic + specific).`;
}

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
  const { bot, botWorkouts, athleteProfile, raceCalendar, coachKnowledge, startDate, numWeeks, recentActivities, latestReadiness, planType } = params;
  const ap = athleteProfile;
  const todayDate = new Date().toISOString().split('T')[0];

  // ── Pre-compute server-side values ──
  const tier = classifyAthleteTier(ap);
  const phase = getPhaseFromDates(ap);
  const bands = derivePaceBands(ap);
  const events = deriveEventPaces(ap);
  const mpw = Number(ap.current_weekly_mileage || ap.weekly_volume_miles || 20);
  const mpwBand = getMpwBand(mpw);
  const libraryBand = toLibraryBand(mpwBand);
  const wc = WARMUP_COOLDOWN_SCALING[mpwBand] ?? WARMUP_COOLDOWN_SCALING.under_30;
  const trainingDays = Number(ap.training_days_per_week || 5);
  const roleMap = getRoleMapText(phase, trainingDays);
  const phaseRules = getPhaseRulesText(phase);
  const workoutLib = getWorkoutLibraryText(phase, libraryBand);
  const rotationText = getRotationText(phase);
  const tierRules = getTierRules(tier);

  // ── Pace band display ──
  const paceDisplay = bands.needs_aerobic_pr
    ? 'No aerobic PR available — use effort-based guidance (easy, moderate, hard).'
    : [
        `LT2/Threshold: ${bands.LT2}`,
        `LT1/Tempo: ${bands.LT1}`,
        `Steady State: ${bands.steady}`,
        `Easy: ${bands.easy}`,
        `Recovery: ${bands.recovery}`,
        bands.source_pr ? `(derived from ${bands.source_pr})` : null,
      ].filter(Boolean).join(' | ');

  const eventPaceDisplay = [
    events.mile_pace ? `Mile: ${events.mile_pace}` : null,
    events.pace_1500 ? `1500m per 400m: ${events.pace_1500}` : null,
    events.pace_800 ? `800m per 400m: ${events.pace_800}` : null,
    events.pace_5k ? `5K: ${events.pace_5k}` : null,
  ].filter(Boolean).join(' | ') || 'No event paces available — use effort-based guidance.';

  // ── Athlete profile block ──
  const profileLines = [
    `Name: ${ap.name}`,
    ap.age ? `Age: ${ap.age}` : null,
    ap.gender ? `Gender: ${ap.gender}` : null,
    ap.experience_level ? `Experience: ${ap.experience_level}` : null,
    `Fitness Level: ${ap.fitness_level || 'Not specified'}`,
    ap.fitness_rating != null ? `Self-Rated Fitness (1-10): ${ap.fitness_rating}` : null,
    `Events: ${(ap.primary_events || []).join(', ') || 'Not specified'}`,
    ap.runner_types?.length ? `Runner Type: ${(ap.runner_types as string[]).join(', ')}` : null,
    `Primary Goal: ${ap.primary_goal || 'Not specified'}`,
    `Training Days/Week: ${trainingDays}`,
    `Current MPW: ${mpw} mi/wk`,
    ap.long_run_distance ? `Comfortable Long Run: ${ap.long_run_distance} miles` : null,
    ap.pr_800m ? `PR 800m: ${ap.pr_800m}` : null,
    ap.pr_1500m ? `PR 1500m: ${ap.pr_1500m}` : null,
    ap.pr_mile ? `PR Mile: ${ap.pr_mile}` : null,
    ap.pr_5k ? `PR 5K: ${ap.pr_5k}` : null,
    ap.pr_10k ? `PR 10K: ${ap.pr_10k}` : null,
    ap.pr_half_marathon ? `PR Half: ${ap.pr_half_marathon}` : null,
    ap.pr_marathon ? `PR Marathon: ${ap.pr_marathon}` : null,
    ap.has_target_race && ap.target_race_name
      ? `Target Race: ${ap.target_race_name}${ap.target_race_date ? ` on ${ap.target_race_date}` : ''}${ap.target_race_distance ? ` (${ap.target_race_distance})` : ''}${ap.goal_time ? ` — Goal: ${ap.goal_time}` : ''}`
      : null,
    ap.injury_notes ? `Injuries/Limitations: ${ap.injury_notes}` : null,
    ap.biggest_challenges?.length
      ? `Challenges: ${(ap.biggest_challenges as string[]).join(', ')}`
      : ap.biggest_challenge ? `Challenge: ${ap.biggest_challenge}` : null,
  ].filter(Boolean).join('\n');

  const activitiesBlock =
    recentActivities && recentActivities.length > 0
      ? `\nRECENT TRAINING (last 30 days):\n${recentActivities
          .slice(0, 15)
          .map(
            (a: any) =>
              `- ${(a.start_date || '').slice(0, 10)}: ${a.activity_type || 'Run'} ${a.distance_miles ? a.distance_miles + ' mi' : ''} ${a.pace ? '@ ' + a.pace + '/mi' : ''}`
          )
          .join('\n')}`
      : '';

  const readinessBlock = latestReadiness
    ? `\nCURRENT READINESS: ${latestReadiness.score}/100 — ${latestReadiness.label}.${latestReadiness.score <= 40 ? ' Start conservatively.' : latestReadiness.score >= 80 ? ' Full load OK.' : ''}`
    : '';

  return `════════════════════════════════
COACH CONTEXT
════════════════════════════════
Philosophy: ${bot.philosophy || 'Science-based periodized training.'}
Plan Type Requested: ${planType || 'standard'}
${coachKnowledge ? `Additional Knowledge:\n${coachKnowledge}\n` : ''}
════════════════════════════════
ATHLETE PROFILE
════════════════════════════════
${profileLines}${activitiesBlock}${readinessBlock}

Computed Tier: ${tier}
Computed Phase: ${phase}
MPW Band: ${mpwBand}

════════════════════════════════
PACE ZONES (server-computed from PRs)
════════════════════════════════
Aerobic Paces: ${paceDisplay}
Event Paces:   ${eventPaceDisplay}

════════════════════════════════
WARMUP / COOLDOWN SCALING
════════════════════════════════
For this athlete's MPW band (${mpwBand}):
  Warmup: ${wc.warmup_mi} mi easy before every quality session
  Cooldown: ${wc.cooldown_mi} mi easy after every quality session
  Easy days and long run: no formal warmup/cooldown needed (just start easy)
  IMPORTANT: distance_miles = warmup + main set + cooldown EXACTLY. Never round differently.

════════════════════════════════
WEEKLY ROLE MAP (${trainingDays} days/week, phase: ${phase})
════════════════════════════════
${roleMap}
  - mon_aerobic / mon_easy = Monday aerobic or easy run
  - tue_easy = Tuesday easy run
  - wed_easy_speeddev = Wednesday easy run + optional speed development appended
  - thu_specific = Thursday specific/quality workout (the key workout of the week)
  - fri_easy = Friday easy run
  - sat_longrun = Saturday long run (${LONG_RUN_SHARE_BY_PHASE[phase as keyof typeof LONG_RUN_SHARE_BY_PHASE]?.min_pct ?? 12}-${LONG_RUN_SHARE_BY_PHASE[phase as keyof typeof LONG_RUN_SHARE_BY_PHASE]?.max_pct ?? 21}% of weekly volume, easy effort)
  - sun_off = Sunday rest

════════════════════════════════
PHASE RULES: ${phase.toUpperCase()}
════════════════════════════════
${phaseRules}

════════════════════════════════
WORKOUT LIBRARY (phase: ${phase === 'ease_in' ? 'base' : phase}, band: ${libraryBand})
════════════════════════════════
Use ONLY these named workouts on quality days. Pick from this list each week:
${workoutLib || '(Easy runs only — ease-in phase)'}

════════════════════════════════
ROTATION RULES
════════════════════════════════
${rotationText}

════════════════════════════════
TIER-SPECIFIC RULES
════════════════════════════════
${tierRules}

════════════════════════════════
COACH TEMPLATE WORKOUTS (ai_adjustable=false only)
════════════════════════════════
${JSON.stringify(botWorkouts)}

════════════════════════════════
RACE CALENDAR
════════════════════════════════
${JSON.stringify(raceCalendar)}

════════════════════════════════
GENERATION RULES
════════════════════════════════
1. EVERY WEEK MUST BE DIFFERENT. No repeated workout titles in adjacent weeks.
2. PROGRESSIVE OVERLOAD: add 5-10% volume per week during build. Every 4th week = recovery (reduce 30-40%, easy only, phase="recovery").
3. DESCRIPTION FORMAT (required):
   "Warmup: X mi easy (Y:YY-Z:ZZ/mi). Main Set: [exact reps/distance/pace]. Cooldown: X mi easy. Coaching Cue: [one tactical cue]."
4. MILEAGE ACCURACY: distance_miles = warmup_mi + main_set_mi + cooldown_mi. No rounding errors.
5. PACE ACCURACY: Use the server-computed paces above. Never invent paces.
6. For easy runs: no formal warmup structure needed — just run easy at ${bands.easy || 'conversational pace'}.
7. Long run: easy effort, distance = ${LONG_RUN_SHARE_BY_PHASE[phase as keyof typeof LONG_RUN_SHARE_BY_PHASE]?.min_pct ?? 12}-${LONG_RUN_SHARE_BY_PHASE[phase as keyof typeof LONG_RUN_SHARE_BY_PHASE]?.max_pct ?? 21}% of weekly total, never split.
8. Taper the final 2 weeks before goal races (reduce volume 20% then 40%, phase="taper").
9. Every workout has change_reason (one sentence: why this workout this week).
10. Return ONLY valid JSON: { "plan": [...] }

TODAY: ${todayDate} | START: ${startDate} | WEEKS: ${numWeeks}

Generate the full ${numWeeks}-week season plan now.`;
}

function fallbackPlan(botWorkouts: any[], startDate: string, numWeeks: number): any[] {
  const weeks = [];
  const phases = ['base', 'build', 'build', 'recovery'];
  const volumeMultipliers = [1.0, 1.08, 1.15, 0.75];

  for (let w = 0; w < numWeeks; w++) {
    const weekStart = addDays(startDate, w * 7);
    const phaseIdx = w % 4;
    const phase = phases[phaseIdx];
    const multiplier = volumeMultipliers[phaseIdx];
    const weekNum = w + 1;

    const workouts = (botWorkouts || []).map((wo: any) => {
      const baseDist = wo.distance_miles || 0;
      const scaledDist = wo.ai_adjustable ? Math.round(baseDist * multiplier * 10) / 10 : baseDist;

      let title = wo.title;
      if (wo.ai_adjustable && phase !== 'recovery') {
        const variants: Record<number, string[]> = {
          1: ['Easy Base Run', 'Recovery Run', 'Comfortable Run', 'Easy Aerobic'],
          2: ['Tempo Effort', 'Progression Run', 'Steady State', 'Aerobic Threshold'],
          3: ['Long Run', 'Extended Long Run', 'Distance Build', 'Long Effort'],
        };
        const dayVariants = variants[wo.day_of_week] || [wo.title];
        title = dayVariants[(Math.floor(w / 4)) % dayVariants.length];
      } else if (phase === 'recovery') {
        title = wo.ai_adjustable ? 'Easy Recovery Run' : wo.title;
      }

      return {
        day_of_week: wo.day_of_week,
        date: addDays(weekStart, wo.day_of_week - 1),
        title,
        description: phase === 'recovery'
          ? 'Recovery week — keep it very easy, no hard efforts. Run by feel, conversational pace throughout.'
          : wo.description || '',
        distance_miles: scaledDist,
        pace_guideline: phase === 'recovery' ? 'Very easy, conversational pace' : wo.pace_guideline || '',
        type: phase === 'recovery' ? 'easy' : 'easy',
        ai_adjustable: wo.ai_adjustable,
        change_reason: phase === 'recovery'
          ? `Week ${weekNum} recovery — reduce load to absorb training adaptations.`
          : `Week ${weekNum} ${phase} — ${multiplier > 1 ? `+${Math.round((multiplier - 1) * 100)}% volume progression` : 'establishing base fitness'}.`,
      };
    });
    weeks.push({ week_number: weekNum, week_start_date: weekStart, phase, workouts });
  }
  return weeks;
}

function parseAndValidate(text: string): any[] | null {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return null;
    for (const week of parsed) {
      if (!week.week_number || !week.week_start_date || !Array.isArray(week.workouts)) return null;
    }
    return parsed;
  } catch { return null; }
}

export async function generate(params: {
  athleteProfile: any; bot: any; botWorkouts: any[];
  raceCalendar: any[]; startDate?: string; existingWeeks?: any[];
  recentActivities?: any[]; latestReadiness?: { score: number; label: string; recommended_intensity?: string } | null;
  planType?: string; athleteTier?: string;
}): Promise<{ plan: any[]; aiUsed: boolean }> {
  const { athleteProfile, bot, botWorkouts, raceCalendar, recentActivities, latestReadiness, planType } = params;
  const startDate = params.startDate || getWeekStartDate();
  const coachKnowledge = await getFormattedKnowledge(bot.id);

  const goalRaces = raceCalendar.filter((r: any) => r.is_goal_race);
  let numWeeks = 8;
  if (goalRaces.length > 0) {
    const lastRace = goalRaces.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(lastRace.date + 'T00:00:00Z');
    const diffWeeks = Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
    numWeeks = Math.min(Math.max(diffWeeks, 1), 24);
  }

  const personalityBlock = bot.personality_prompt
    ? `COACHING PERSONALITY: ${bot.personality_prompt}\n\nYour coaching philosophy and style must reflect the above personality in every response. Never break character.\n\n`
    : '';

  const systemContent = personalityBlock + SHORT_SYSTEM_PROMPT;
  const userContent = buildPlanPrompt({
    bot,
    botWorkouts,
    athleteProfile,
    raceCalendar,
    coachKnowledge,
    startDate,
    numWeeks,
    recentActivities,
    latestReadiness,
    planType,
  });

  let aiPlan: any[] | null = null;

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
      aiPlan = Array.isArray(parsed) ? parsed : (parsed.plan ?? parsed.weeks ?? null);
      if (aiPlan && parseAndValidate(JSON.stringify(aiPlan))) break;
      aiPlan = null;
    } catch (err) { console.error(`[seasonPlan] OpenAI error attempt ${attempt + 1}:`, err); }
  }

  const existingWeeks = params.existingWeeks || [];
  const today = new Date().toISOString().split('T')[0];
  const pastWeeks = existingWeeks.filter((w: any) => w.week_start_date < today);

  if (aiPlan) return { plan: [...pastWeeks, ...aiPlan], aiUsed: true };

  console.warn('[seasonPlan] OpenAI failed, using fallback');
  return { plan: [...pastWeeks, ...fallbackPlan(botWorkouts, startDate, numWeeks)], aiUsed: false };
}
