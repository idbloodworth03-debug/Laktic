/**
 * planEngine.ts
 * Deterministic plan skeleton builder.
 *
 * GPT-4o only fills in workout descriptions — never the structure.
 * The structure, days, distances, workouts, and paces are all computed here.
 */

import {
  classifyAthleteTier,
  getPhaseFromDates,
  derivePaceBands,
  deriveEventPaces,
  AthleteTier,
  TrainingPhase,
  PaceBands,
  EventPaces,
} from './athleteTier';
import {
  getMpwBand,
  getWarmupCooldown,
  getRoleMap,
  WORKOUT_LIBRARY,
  ROTATION_LOGIC,
  LONG_RUN_SHARE_BY_PHASE,
  EASE_IN_MILEAGE_RAMP,
} from './coachParamLibrary';
import { addDays, getWeekStartDate } from './dateUtils';

// ── Constants ─────────────────────────────────────────────────────────────────

const METERS_PER_MILE = 1609.344;

const DEFAULT_MPW: Record<AthleteTier, number> = {
  intermediate: 25,
  advanced:     40,
};

const DEFAULT_DAYS: Record<AthleteTier, number> = {
  intermediate: 4,
  advanced:     5,
};

const MAX_EASY_MILES: Record<AthleteTier, number> = {
  intermediate: 8,
  advanced:     10,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlannedWorkout {
  day:                string;   // 'Monday' etc
  dayOfWeek:          number;   // 1-7
  date?:              string;   // YYYY-MM-DD
  role:               string;
  workoutKey:         string | null;
  title:              string;
  totalDistance:      number;
  paceGuideline:      string;
  mainSetDistance:    number;
  mainSetDescription: string;
  warmupMiles:        number;
  cooldownMiles:      number;
  isRestDay:          boolean;
  libraryDescription?: string;
}

export interface PlanWeek {
  weekNumber:   number;
  phase:        string;
  targetMiles:  number;
  trainingDays: number;
  workouts:     PlannedWorkout[];
}

export interface PlanSkeleton {
  tier:          AthleteTier;
  phase:         TrainingPhase;
  totalWeeks:    number;
  weeksOfEaseIn: number;
  mpwBand:       string;
  paceBands:     PaceBands | null;
  eventPaces:    EventPaces | null;
  warmup:        number;
  cooldown:      number;
  weeks:         PlanWeek[];
}

// ── Day mapping ───────────────────────────────────────────────────────────────

const DAY_CODE_TO_NAME: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

const DAY_CODE_TO_NUM: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
};

// ── Workout titles ────────────────────────────────────────────────────────────

const WORKOUT_TITLE: Record<string, string> = {
  tempo_run:                             'Tempo Run',
  progressive_tempo_run:                 'Progressive Tempo Run',
  threshold_1000s:                       'Threshold 1000s',
  threshold_1600s:                       'Threshold 1600s',
  base_400s_5k_to_3k:                    '400m Repeats (5K to 3K)',
  half_threshold_plus_cutdown:           'Half Threshold + Cutdown',
  half_tempo_plus_600s_at_3k:            'Half Tempo + 600s at 3K Pace',
  sixty_second_hills:                    '60-Second Hill Repeats',
  tempo_plus_400s_3k:                    'Tempo + 400s at 3K Pace',
  progressive_tempo_plus_150s:           'Progressive Tempo + 150s',
  threshold_1000s_fast_first_plus_400s:  'Fast-First 1000s + 400s',
  threshold_1600s_plus_alt_200s:         'Threshold 1600s + Alternating 200s',
  mile_300s:                             'Mile-Pace 300s',
  quarter_threshold_plus_800s_plus_400s: 'Quarter Threshold + 800s + 400s',
  sets_400_300_200:                      'Sets of 400-300-200',
  sets_4x250_mile:                       'Sets of 4x250m at Mile Pace',
  sets_800_600_plus_150s:                '800-600 Sets + 150s',
  goal_pace_tune_up:                     'Goal Pace Tune-Up',
  mile_300s_plus_two_800pace:            'Mile-Pace 300s + 800-Pace 300s',
  competition_sets_400_300_200:          'Competition Sets 400-300-200',
};

// ── Math helpers ──────────────────────────────────────────────────────────────

/** Round to nearest 0.25 miles. */
function r25(mi: number): number {
  return Math.round(mi * 4) / 4;
}

function mToMi(meters: number): number {
  return meters / METERS_PER_MILE;
}

function clamp(val: number, lo: number, hi: number): number {
  return Math.min(Math.max(val, lo), hi);
}

export function toLibraryBand(mpwBand: string): string {
  if (mpwBand === 'over_50') return 'mpw_50_60';
  return mpwBand;
}

// ── Role entry parser ─────────────────────────────────────────────────────────

function parseRoleEntry(entry: string): { day: string; dayCode: string; role: string } {
  const parts = entry.split('_');
  const dayCode = parts[0];
  const day = DAY_CODE_TO_NAME[dayCode] ?? 'Monday';
  const rolePart = parts.slice(1).join('_');

  let role: string;
  if (rolePart === 'off') role = 'rest';
  else if (rolePart === 'longrun') role = 'long_run';
  else if (rolePart === 'easy_speeddev') role = 'easy_speeddev';
  else if (rolePart === 'easy') role = 'easy';
  else if (rolePart === 'aerobic') role = 'aerobic';
  else if (rolePart === 'specific') role = 'specific';
  else role = 'easy';

  return { day, dayCode, role };
}

// ── Step A: Total weeks ───────────────────────────────────────────────────────

function computeTotalWeeks(athlete: any, raceCalendar: any[], today: string): number {
  const athleteRaceDate = (athlete.target_race_date ?? null) as string | null;
  if (athleteRaceDate && athleteRaceDate > today) {
    const weeks = Math.ceil(
      (new Date(athleteRaceDate + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) /
      (7 * 24 * 60 * 60 * 1000),
    );
    return clamp(weeks, 4, 24);
  }
  const goalRaces = (raceCalendar || [])
    .filter((r: any) => r.is_goal_race && r.date > today)
    .sort((a: any, b: any) => (a.date as string).localeCompare(b.date));
  if (goalRaces.length > 0) {
    const weeks = Math.ceil(
      (new Date(goalRaces[0].date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) /
      (7 * 24 * 60 * 60 * 1000),
    );
    return clamp(weeks, 4, 24);
  }
  return 12;
}

function computeWeeksToRace(athlete: any, raceCalendar: any[], today: string): number | null {
  const athleteRaceDate = (athlete.target_race_date ?? null) as string | null;
  if (athleteRaceDate && athleteRaceDate > today) {
    return Math.ceil(
      (new Date(athleteRaceDate + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) /
      (7 * 24 * 60 * 60 * 1000),
    );
  }
  const goalRaces = (raceCalendar || [])
    .filter((r: any) => r.is_goal_race && r.date > today)
    .sort((a: any, b: any) => (a.date as string).localeCompare(b.date));
  if (goalRaces.length > 0) {
    return Math.ceil(
      (new Date(goalRaces[0].date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) /
      (7 * 24 * 60 * 60 * 1000),
    );
  }
  return null;
}

// ── Step B: Ease-in weeks ─────────────────────────────────────────────────────

function computeEaseInWeeks(athlete: any, tier: AthleteTier): number {
  const fitnessRating = Number(athlete.fitness_rating ?? 5);
  const exp = (athlete.experience_level ?? '') as string;

  let easeIn: number;
  if (fitnessRating <= 3) easeIn = 4;
  else if (fitnessRating <= 4) easeIn = 3;
  else if (fitnessRating <= 5) easeIn = 2;
  else if (fitnessRating <= 7) easeIn = 1;
  else easeIn = (exp === '3_plus_years' || tier === 'advanced') ? 0 : 1;

  return easeIn;
}

// ── Step C: Target miles per week ─────────────────────────────────────────────

function computeTargetMiles(
  baseMpw:       number,
  weekIndex:     number,
  weeksOfEaseIn: number,
  weekPhase:     string,
  isRecoveryWeek: boolean,
  isTaperWeek:   boolean,
  weeksLeft:     number,
  tier:          AthleteTier,
): number {
  const isEaseIn = weekIndex < weeksOfEaseIn;
  let target: number;

  if (isEaseIn) {
    const rampKeys = ['week_1', 'week_2', 'week_3', 'week_4'] as const;
    const rampKey = rampKeys[Math.min(weekIndex, 3)];
    const ramp = EASE_IN_MILEAGE_RAMP[rampKey] ?? 1.0;
    target = baseMpw * ramp;
  } else if (isTaperWeek) {
    target = weeksLeft === 2 ? baseMpw * 0.80 : baseMpw * 0.60;
  } else if (isRecoveryWeek) {
    target = baseMpw * 0.65;
  } else {
    const buildWeeks = weekIndex - weeksOfEaseIn;
    const cyclePos = buildWeeks % 4;
    const phaseMult =
      weekPhase === 'pre_competition' ? 0.90 :
      weekPhase === 'competition'     ? 0.80 : 1.0;
    const cycleMults = [1.0, 1.05, 1.10, 1.0];
    target = baseMpw * phaseMult * (cycleMults[cyclePos] ?? 1.0);
  }

  return r25(target);
}

// ── Long run bounds ───────────────────────────────────────────────────────────

function getLongRunMiles(targetMiles: number, weekPhase: string, tier: AthleteTier): number {
  const lrShare = LONG_RUN_SHARE_BY_PHASE[weekPhase as keyof typeof LONG_RUN_SHARE_BY_PHASE]
    ?? LONG_RUN_SHARE_BY_PHASE.base;
  const pct = (lrShare.min_pct + lrShare.max_pct) / 200;
  const fromPct = targetMiles * pct;
  const minLr = tier === 'intermediate' ? 5.0 : 7.0;
  const maxLr = Math.min(
    targetMiles * 0.30,
    tier === 'intermediate' ? 14.0 : 22.0,
  );
  return r25(clamp(fromPct, minLr, maxLr));
}

// ── Pace guideline builder ────────────────────────────────────────────────────

function buildPaceGuideline(
  role:       string,
  paceBands:  PaceBands | null,
  eventPaces: EventPaces | null,
): string {
  // Band strings already contain "/mi" — do not append it again.
  const hasBands = paceBands && !paceBands.needs_aerobic_pr;
  if (role === 'easy' || role === 'easy_speeddev' || role === 'long_run') {
    return hasBands ? paceBands.easy : 'Easy effort — conversational pace';
  }
  if (role === 'aerobic') {
    return hasBands ? paceBands.LT2 : 'Threshold effort';
  }
  if (role === 'specific') {
    if (eventPaces?.mile_pace) return eventPaces.mile_pace;
    return hasBands ? paceBands.LT2 : 'By effort';
  }
  return hasBands ? paceBands.easy : 'Easy effort';
}

// ── Rotation helpers ──────────────────────────────────────────────────────────

function getRotation(phase: string, role: string): string[] {
  const rl = ROTATION_LOGIC as Record<string, any>;
  if (phase === 'base') {
    if (role === 'aerobic') return rl['base_aerobic_rotation'] as string[];
    return rl['base_specific_rotation'] as string[];
  }
  if (phase === 'pre_competition') {
    if (role === 'aerobic') return rl['pre_comp_aerobic_rotation'] as string[];
    return rl['pre_comp_specific_rotation'] as string[];
  }
  if (phase === 'competition') {
    return rl['competition_specific_rotation'] as string[];
  }
  return rl['base_aerobic_rotation'] as string[];
}

function pickWorkoutKey(
  rotation:      string[],
  roleKey:       string,
  rotationState: Record<string, number>,
  recentlyUsed:  Record<string, string[]>,
): string {
  const recent      = recentlyUsed[roleKey] ?? [];
  const nonRepeat   = ROTATION_LOGIC.non_repeat_window_weeks;
  const startIdx    = rotationState[roleKey] ?? 0;

  for (let attempt = 0; attempt < rotation.length; attempt++) {
    const idx       = (startIdx + attempt) % rotation.length;
    const candidate = rotation[idx];
    if (!recent.slice(-nonRepeat).includes(candidate)) {
      rotationState[roleKey] = (idx + 1) % rotation.length;
      recentlyUsed[roleKey]  = [...recent, candidate].slice(-(nonRepeat + 1));
      return candidate;
    }
  }

  // All recently used — just advance
  const idx = startIdx % rotation.length;
  const key = rotation[idx];
  rotationState[roleKey] = (idx + 1) % rotation.length;
  recentlyUsed[roleKey]  = [...recent, key].slice(-(nonRepeat + 1));
  return key;
}

// ── Workout distance + description computation ────────────────────────────────

interface WorkoutDistances {
  mainSetMiles:        number;
  mainSetDescription:  string;
}

function getWorkoutDistances(
  workoutKey: string,
  mpwBand:    string,
  paceBands:  PaceBands | null,
  eventPaces: EventPaces | null,
): WorkoutDistances {
  const wo = (WORKOUT_LIBRARY as Record<string, any>)[workoutKey];
  const lb = toLibraryBand(mpwBand);

  const fallbackMi: Record<string, number> = {
    under_30: 3.0, mpw_30_40: 3.5, mpw_40_50: 4.0, mpw_50_60: 4.5, over_50: 4.5,
  };
  if (!wo) {
    return { mainSetMiles: fallbackMi[mpwBand] ?? 3.0, mainSetDescription: 'Main set' };
  }

  const lt2       = paceBands?.LT2 ?? 'threshold effort';
  const lt1       = paceBands?.LT1 ?? 'LT1 effort';
  const milePace  = eventPaces?.mile_pace ?? 'mile effort';
  const pace800   = eventPaces?.pace_800  ?? '800 effort';
  const pace1500  = eventPaces?.pace_1500 ?? '1500 effort';
  const pace5k    = eventPaces?.pace_5k   ?? '5K effort';

  // ── Continuous volume-based workouts ─────────────────────────────────────────
  if (wo.volume_by_mpw?.[lb]) {
    const v     = wo.volume_by_mpw[lb] as { min_mi: number; max_mi: number };
    const midMi = r25((v.min_mi + v.max_mi) / 2);
    if (workoutKey === 'tempo_run') {
      return {
        mainSetMiles: midMi,
        mainSetDescription: `${midMi} miles continuous tempo at midpoint between LT1 and LT2 (${lt1} building toward ${lt2})`,
      };
    }
    if (workoutKey === 'progressive_tempo_run') {
      return {
        mainSetMiles: midMi,
        mainSetDescription: `${midMi} miles progressive tempo — start at LT1 effort (${lt1}), build to LT2 (${lt2}) by the final mile`,
      };
    }
    return {
      mainSetMiles: midMi,
      mainSetDescription: `${midMi} miles at ${lt2}`,
    };
  }

  // ── Rep-based workouts ────────────────────────────────────────────────────────
  if (wo.reps_by_mpw?.[lb]) {
    const rBand = wo.reps_by_mpw[lb] as { min: number; max: number };
    const reps  = Math.round((rBand.min + rBand.max) / 2);

    if (workoutKey === 'threshold_1000s') {
      const mainMi = r25(reps * mToMi(1000) + (reps - 1) * mToMi(200));
      return {
        mainSetMiles: mainMi,
        mainSetDescription: `${reps} x 1000m at LT2 pace (${lt2}). 60-90 sec jog recovery between reps`,
      };
    }
    if (workoutKey === 'threshold_1600s') {
      const mainMi = r25(reps * mToMi(1600) + (reps - 1) * mToMi(200));
      return {
        mainSetMiles: mainMi,
        mainSetDescription: `${reps} x 1600m at LT2 pace (${lt2}). 60-90 sec jog recovery between reps`,
      };
    }
    if (workoutKey === 'base_400s_5k_to_3k') {
      const mainMi = r25(reps * mToMi(400) + reps * mToMi(400));
      return {
        mainSetMiles: mainMi,
        mainSetDescription: `${reps} x 400m starting at 5K pace (${pace5k}), progressing toward 3K pace over the session. Equal-time rest between reps`,
      };
    }
    if (workoutKey === 'sixty_second_hills') {
      const mainMi = r25(reps * mToMi(250) + reps * mToMi(250));
      return {
        mainSetMiles: mainMi,
        mainSetDescription: `${reps} x 60-second hill reps at strong aerobic effort. Jog back down for full recovery. If no hill available: ${reps} x 400m at 5K-3K effort`,
      };
    }
    if (workoutKey === 'mile_300s') {
      const mainMi = r25(reps * mToMi(300) + reps * mToMi(100));
      return {
        mainSetMiles: mainMi,
        mainSetDescription: `${reps} x 300m at mile pace (${milePace}). 50m walk + 50m jog recovery between reps`,
      };
    }
  }

  // ── Compound workouts ──────────────────────────────────────────────────────────

  if (workoutKey === 'half_threshold_plus_cutdown') {
    const threshWo = (WORKOUT_LIBRARY as Record<string, any>)['threshold_1000s'];
    const r        = (threshWo?.reps_by_mpw?.[lb] ?? { min: 3, max: 5 }) as { min: number; max: number };
    const halfReps = Math.max(1, Math.floor(Math.round((r.min + r.max) / 2) / 2));
    const threshMi = r25(halfReps * mToMi(1000) + Math.max(0, halfReps - 1) * mToMi(200));
    const cutdownMi = r25(mToMi(2200));
    const transitionMi = r25(mToMi(400));
    const mainMi = r25(threshMi + transitionMi + cutdownMi);
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${halfReps} x 1000m at LT2 (${lt2}), 60-90s jog. ` +
        `3-4min easy jog transition. ` +
        `Cutdown: 800m then 600m then 400m then 200m then 200m, cutting from 3K pace down to 800 pace (${pace800})`,
    };
  }

  if (workoutKey === 'half_tempo_plus_600s_at_3k') {
    const tempoWo  = (WORKOUT_LIBRARY as Record<string, any>)['tempo_run'];
    const tv       = (tempoWo?.volume_by_mpw?.[lb] ?? { min_mi: 3.75, max_mi: 4.75 }) as { min_mi: number; max_mi: number };
    const halfMi   = r25(((tv.min_mi + tv.max_mi) / 2) / 2);
    const reps600  = (wo.reps_600_by_mpw?.[lb] ?? 3) as number;
    const reps600Mi = r25(reps600 * mToMi(600) + reps600 * mToMi(400));
    const mainMi   = r25(halfMi + reps600Mi);
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${halfMi} miles tempo at LT1-LT2 midpoint (${lt2}). ` +
        `Then: ${reps600} x 600m at 3K effort. Equal rest between reps`,
    };
  }

  if (workoutKey === 'tempo_plus_400s_3k') {
    const tv      = (wo.tempo_volume_by_mpw?.[lb] ?? { min_mi: 2.5, max_mi: 3.5 }) as { min_mi: number; max_mi: number };
    const tempoMi = r25((tv.min_mi + tv.max_mi) / 2);
    const reps400 = (wo.reps_400_by_mpw?.[lb] ?? 5) as number;
    const repsMi  = r25(reps400 * mToMi(400) + reps400 * mToMi(200));
    const mainMi  = r25(tempoMi + repsMi);
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${tempoMi} miles tempo at LT1-LT2 midpoint (${lt2}). ` +
        `Then: ${reps400} x 400m at 3K pace (${pace5k} range). 200m jog recovery`,
    };
  }

  if (workoutKey === 'progressive_tempo_plus_150s') {
    const tempoWo = (WORKOUT_LIBRARY as Record<string, any>)['progressive_tempo_run'];
    const tv      = (tempoWo?.volume_by_mpw?.[lb] ?? { min_mi: 3.75, max_mi: 4.75 }) as { min_mi: number; max_mi: number };
    const tempoMi = r25(((tv.min_mi + tv.max_mi) / 2) * 0.80);
    const reps150 = (wo.reps_150_by_mpw?.[lb] ?? 5) as number;
    const repsMi  = r25(reps150 * mToMi(150) + reps150 * mToMi(200));
    const mainMi  = r25(tempoMi + repsMi);
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${tempoMi} miles progressive tempo (LT1 to LT2). ` +
        `Then: ${reps150} x 150m at mile-to-800 rhythm (${milePace}). Full walk/jog recovery`,
    };
  }

  if (workoutKey === 'threshold_1000s_fast_first_plus_400s') {
    const threshWo = (WORKOUT_LIBRARY as Record<string, any>)['threshold_1000s'];
    const r        = (threshWo?.reps_by_mpw?.[lb] ?? { min: 3, max: 5 }) as { min: number; max: number };
    const reps     = Math.max(1, Math.round(Math.round((r.min + r.max) / 2) * 0.90));
    const threshMi = r25(reps * mToMi(1000) + Math.max(0, reps - 1) * mToMi(200));
    const reps400  = 4;
    const repsMi   = r25(reps400 * mToMi(400) + reps400 * mToMi(200));
    const mainMi   = r25(threshMi + repsMi);
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${reps} x 1000m — first 200m at 3K effort, settle to LT2 (${lt2}). 5min recovery. ` +
        `Then: 4 x 400m at mile pace (${milePace}). 90s-2min between 400s`,
    };
  }

  if (workoutKey === 'threshold_1600s_plus_alt_200s') {
    const threshWo = (WORKOUT_LIBRARY as Record<string, any>)['threshold_1600s'];
    const r        = (threshWo?.reps_by_mpw?.[lb] ?? { min: 2, max: 4 }) as { min: number; max: number };
    const reps     = Math.max(1, Math.round(Math.round((r.min + r.max) / 2) * 0.90));
    const threshMi = r25(reps * mToMi(1600) + Math.max(0, reps - 1) * mToMi(200));
    const reps200  = (wo.reps_200_by_mpw?.[lb] ?? 4) as number;
    const repsMi   = r25(reps200 * mToMi(200) + reps200 * mToMi(150));
    const mainMi   = r25(threshMi + repsMi);
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${reps} x 1600m at LT2 (${lt2}). 60-90s jog. ` +
        `Then: ${reps200} x 200m alternating mile pace (${milePace}) and 800 pace (${pace800}). 75s standing rest`,
    };
  }

  if (workoutKey === 'quarter_threshold_plus_800s_plus_400s') {
    const threshReps = (wo.threshold_reps_by_mpw?.[lb] ?? 1) as number;
    const reps800    = (wo.reps_800_by_mpw?.[lb] ?? 2) as number;
    const threshMi   = r25(threshReps * mToMi(1000));
    const reps800Mi  = r25(reps800 * mToMi(800) + reps800 * mToMi(400));
    const reps400Mi  = r25(2 * mToMi(400) + 2 * mToMi(200));
    const mainMi     = r25(threshMi + reps800Mi + reps400Mi);
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${threshReps} x 1000m at LT2 (${lt2}), 60-90s recovery. ` +
        `${reps800} x 800m at 3200 pace. ~2min recovery. ` +
        `2 x 400m at mile pace (${milePace}). 90s-2min recovery`,
    };
  }

  if (workoutKey === 'sets_400_300_200') {
    const sets   = (wo.sets_by_mpw?.[lb] ?? 3) as number;
    const mainMi = r25(sets * mToMi(900) + sets * mToMi(400));
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${sets} sets: 400m at mile pace (${milePace}), 90s rest, ` +
        `300m cutting to 800 pace, 90s rest, 200m at 800 pace (${pace800}). 3min between sets`,
    };
  }

  if (workoutKey === 'sets_4x250_mile') {
    const sets   = (wo.sets_by_mpw?.[lb] ?? 2) as number;
    const mainMi = r25(sets * mToMi(1000) + sets * mToMi(400));
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${sets} sets of 4 x 250m at mile pace (${milePace}). 60s between reps. 3min between sets`,
    };
  }

  if (workoutKey === 'sets_800_600_plus_150s') {
    const v      = (wo.sets_and_150s_by_mpw?.[lb] ?? { sets: 2, reps_150: 3 }) as { sets: number; reps_150: number };
    const setsMi = r25(v.sets * mToMi(1400) + v.sets * mToMi(400));
    const rps150 = r25(v.reps_150 * mToMi(150) + v.reps_150 * mToMi(250));
    const mainMi = r25(setsMi + rps150);
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${v.sets} sets: 800m at threshold (${lt2}), 90s rest, 600m at 3200 pace. 2min after 600. ` +
        `Then: ${v.reps_150} x 150m at mile-800 rhythm. 200m jog + 50m walk`,
    };
  }

  if (workoutKey === 'goal_pace_tune_up') {
    const reps400 = (wo.reps_400_by_mpw?.[lb] ?? 2) as number;
    const mainMi  = r25(
      mToMi(1000) + mToMi(200) +
      2 * mToMi(150) + 2 * mToMi(250) +
      mToMi(800) + mToMi(400) +
      reps400 * mToMi(400) + reps400 * mToMi(200) +
      mToMi(300),
    );
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `1 x 1000m at LT2 (${lt2}). 2 x 150m at mile pace (${milePace}). ` +
        `1 x 800m at goal 1500 pace (${pace1500}). 6min easy. ` +
        `${reps400} x 400m at goal pace (${pace1500}). 90s between 400s. ` +
        `1 x 300m cutdown to 800 pace (${pace800})`,
    };
  }

  if (workoutKey === 'mile_300s_plus_two_800pace') {
    const v      = (wo.total_volume_by_mpw?.[lb] ?? { mile_reps: 7, pace_800_reps: 2, total_m: 2700 }) as { mile_reps: number; pace_800_reps: number; total_m: number };
    const mainMi = r25(mToMi(v.total_m) + v.mile_reps * mToMi(100) + v.pace_800_reps * mToMi(200));
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${v.mile_reps} x 300m at mile pace (${milePace}). 50m walk + 50m jog. ` +
        `Then: 2 x 300m at 800 pace (${pace800}). 3min between 800-pace reps`,
    };
  }

  if (workoutKey === 'competition_sets_400_300_200') {
    const base400 = (WORKOUT_LIBRARY as Record<string, any>)['sets_400_300_200'];
    const baseSets = ((base400?.sets_by_mpw?.[lb] ?? 3) as number);
    const sets     = Math.max(1, baseSets - 1);
    const mainMi   = r25(sets * mToMi(900) + sets * mToMi(400));
    return {
      mainSetMiles: mainMi,
      mainSetDescription:
        `${sets} sets: 400m at mile pace (${milePace}), 90s rest, ` +
        `300m cutting to 800 pace, 90s rest, 200m at 800 pace (${pace800}). 3min between sets`,
    };
  }

  // Fallback
  return { mainSetMiles: fallbackMi[mpwBand] ?? 3.0, mainSetDescription: 'Main set — see workout description' };
}

// ── Week builder ──────────────────────────────────────────────────────────────

function buildWeekWorkouts(
  roleMap:       string[],
  weekNum:       number,
  weekPhase:     string,
  targetMiles:   number,
  tier:          AthleteTier,
  mpwBand:       string,
  wc:            { warmup_mi: number; cooldown_mi: number },
  paceBands:     PaceBands | null,
  eventPaces:    EventPaces | null,
  rotationState: Record<string, number>,
  recentlyUsed:  Record<string, string[]>,
  isEaseIn:      boolean,
): PlannedWorkout[] {
  const lrPctPhase  = isEaseIn ? 'ease_in' : weekPhase;
  const longRunMiles = getLongRunMiles(targetMiles, lrPctPhase, tier);

  // Intermediate accumulation pass
  interface RawWo {
    day: string; dayOfWeek: number; role: string;
    workoutKey: string | null; title: string;
    mainSetMiles: number; warmupMiles: number; cooldownMiles: number;
    paceGuideline: string; mainSetDescription: string;
    isRestDay: boolean; isEasy: boolean;
    libraryDescription?: string;
  }

  const raw: RawWo[] = [];
  let qualityMilesUsed = 0;
  let longRunAssigned  = 0;
  let easyCount        = 0;

  for (const entry of roleMap) {
    const { day, dayCode, role } = parseRoleEntry(entry);
    const dayOfWeek = DAY_CODE_TO_NUM[dayCode] ?? 1;
    const easyPg    = buildPaceGuideline('easy', paceBands, eventPaces);

    if (role === 'rest') {
      raw.push({ day, dayOfWeek, role: 'rest', workoutKey: null, title: 'Rest Day',
        mainSetMiles: 0, warmupMiles: 0, cooldownMiles: 0, paceGuideline: '',
        mainSetDescription: '', isRestDay: true, isEasy: false });
      continue;
    }

    // ── Long run ──
    if (role === 'long_run') {
      const lrTitle = 'Easy Long Run';
      const lrDesc  = `Easy long run at conversational pace. Never split. Keep effort comfortable enough to hold a conversation throughout.`;
      longRunAssigned = longRunMiles;
      raw.push({ day, dayOfWeek, role: 'long_run', workoutKey: null, title: lrTitle,
        mainSetMiles: longRunMiles, warmupMiles: 0, cooldownMiles: 0,
        paceGuideline: buildPaceGuideline('long_run', paceBands, eventPaces),
        mainSetDescription: lrDesc, isRestDay: false, isEasy: false });
      continue;
    }

    // ── Ease-in: easy runs only ──
    if (isEaseIn) {
      easyCount++;
      raw.push({ day, dayOfWeek, role: 'easy', workoutKey: null, title: 'Easy Run',
        mainSetMiles: 0, warmupMiles: 0, cooldownMiles: 0, paceGuideline: easyPg,
        mainSetDescription: 'Easy run at conversational pace',
        isRestDay: false, isEasy: true });
      continue;
    }

    // ── Aerobic role ──
    if (role === 'aerobic') {
      const rotation  = getRotation(weekPhase, 'aerobic');
      const key       = pickWorkoutKey(rotation, `aerobic_${weekPhase}`, rotationState, recentlyUsed);
      const { mainSetMiles, mainSetDescription } = getWorkoutDistances(key, mpwBand, paceBands, eventPaces);
      const capped    = Math.min(mainSetMiles, targetMiles * 0.35);
      const total     = r25(wc.warmup_mi + capped + wc.cooldown_mi);
      qualityMilesUsed += total;
      const libDesc   = (WORKOUT_LIBRARY as Record<string, any>)[key]?.full_description as string | undefined;
      raw.push({ day, dayOfWeek, role: 'aerobic', workoutKey: key,
        title: WORKOUT_TITLE[key] ?? key,
        mainSetMiles: capped, warmupMiles: wc.warmup_mi, cooldownMiles: wc.cooldown_mi,
        paceGuideline: buildPaceGuideline('aerobic', paceBands, eventPaces),
        mainSetDescription, isRestDay: false, isEasy: false, libraryDescription: libDesc });
      continue;
    }

    // ── Specific role ──
    if (role === 'specific') {
      const rotation  = getRotation(weekPhase, 'specific');
      const key       = pickWorkoutKey(rotation, `specific_${weekPhase}`, rotationState, recentlyUsed);
      const { mainSetMiles, mainSetDescription } = getWorkoutDistances(key, mpwBand, paceBands, eventPaces);
      const capped    = Math.min(mainSetMiles, targetMiles * 0.35);
      qualityMilesUsed += r25(wc.warmup_mi + capped + wc.cooldown_mi);
      const libDescS  = (WORKOUT_LIBRARY as Record<string, any>)[key]?.full_description as string | undefined;
      raw.push({ day, dayOfWeek, role: 'specific', workoutKey: key,
        title: WORKOUT_TITLE[key] ?? key,
        mainSetMiles: capped, warmupMiles: wc.warmup_mi, cooldownMiles: wc.cooldown_mi,
        paceGuideline: buildPaceGuideline('specific', paceBands, eventPaces),
        mainSetDescription, isRestDay: false, isEasy: false, libraryDescription: libDescS });
      continue;
    }

    // ── Easy / easy+speeddev ──
    easyCount++;
    const speedDevSuffix = role === 'easy_speeddev'
      ? ' Finish with 4-6 x 100m strides at controlled fast effort. Walk back recovery.'
      : '';
    raw.push({
      day, dayOfWeek,
      role: role === 'easy_speeddev' ? 'easy_speeddev' : 'easy',
      workoutKey: null,
      title: role === 'easy_speeddev' ? 'Easy Run + Strides' : 'Easy Run',
      mainSetMiles: 0, warmupMiles: 0, cooldownMiles: 0,
      paceGuideline: easyPg,
      mainSetDescription: `Easy run at conversational pace.${speedDevSuffix}`,
      isRestDay: false, isEasy: true,
    });
  }

  // ── Step G: Fill easy run distances ──────────────────────────────────────────
  const usedMiles    = longRunAssigned + qualityMilesUsed;
  const remaining    = Math.max(0, targetMiles - usedMiles);
  const easyEach     = easyCount > 0 ? r25(remaining / easyCount) : 0;
  const maxEasyMi    = MAX_EASY_MILES[tier];
  const cappedEasyMi = clamp(Math.max(easyEach, 2.0), 2.0, maxEasyMi);

  const result: PlannedWorkout[] = raw.map(wo => {
    if (wo.isRestDay) {
      return { day: wo.day, dayOfWeek: wo.dayOfWeek, role: 'rest',
        workoutKey: null, title: 'Rest Day', totalDistance: 0, paceGuideline: '',
        mainSetDistance: 0, mainSetDescription: '', warmupMiles: 0, cooldownMiles: 0, isRestDay: true };
    }
    if (wo.isEasy) {
      return { day: wo.day, dayOfWeek: wo.dayOfWeek, role: wo.role,
        workoutKey: null, title: wo.title, totalDistance: cappedEasyMi,
        paceGuideline: wo.paceGuideline, mainSetDistance: cappedEasyMi,
        mainSetDescription: wo.mainSetDescription, warmupMiles: 0, cooldownMiles: 0, isRestDay: false };
    }
    if (wo.role === 'long_run') {
      return { day: wo.day, dayOfWeek: wo.dayOfWeek, role: 'long_run',
        workoutKey: null, title: wo.title, totalDistance: wo.mainSetMiles,
        paceGuideline: wo.paceGuideline, mainSetDistance: wo.mainSetMiles,
        mainSetDescription: wo.mainSetDescription, warmupMiles: 0, cooldownMiles: 0, isRestDay: false };
    }
    // Structured workout
    const total = r25(wo.warmupMiles + wo.mainSetMiles + wo.cooldownMiles);
    return { day: wo.day, dayOfWeek: wo.dayOfWeek, role: wo.role,
      workoutKey: wo.workoutKey, title: wo.title, totalDistance: total,
      paceGuideline: wo.paceGuideline, mainSetDistance: wo.mainSetMiles,
      mainSetDescription: wo.mainSetDescription, warmupMiles: wo.warmupMiles,
      cooldownMiles: wo.cooldownMiles, isRestDay: false,
      libraryDescription: (wo as any).libraryDescription };
  });

  return result;
}

// ── Step I: Accuracy adjustment ───────────────────────────────────────────────

function adjustEasyDistances(workouts: PlannedWorkout[], targetMiles: number, tier: AthleteTier): void {
  const currentTotal = workouts.reduce((s, w) => s + (w.isRestDay ? 0 : w.totalDistance), 0);
  const diff         = targetMiles - currentTotal;
  const tolerance    = targetMiles * 0.10;
  if (Math.abs(diff) <= tolerance) return;

  const easyWorkouts = workouts.filter(
    w => !w.isRestDay && (w.role === 'easy' || w.role === 'easy_speeddev'),
  );
  if (easyWorkouts.length === 0) return;

  const adjustEach = diff / easyWorkouts.length;
  const maxEasyMi  = MAX_EASY_MILES[tier];

  for (const wo of easyWorkouts) {
    const nd = r25(clamp(wo.totalDistance + adjustEach, 2.0, maxEasyMi));
    wo.totalDistance   = nd;
    wo.mainSetDistance = nd;
  }

  const newTotal = workouts.reduce((s, w) => s + (w.isRestDay ? 0 : w.totalDistance), 0);
  if (Math.abs(targetMiles - newTotal) > targetMiles * 0.10) {
    console.warn(`[planEngine] Wk mileage still off: target=${targetMiles} actual=${newTotal.toFixed(2)}`);
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate and fix a plan array (already in DB format) before saving.
 * Returns the corrected plan.
 */
export function validateAndFixPlan(weeks: any[], athlete: any): any[] {
  const tier          = classifyAthleteTier(athlete);
  const targetDays    = clamp(Number(athlete.training_days_per_week ?? DEFAULT_DAYS[tier]), 3, 7);
  const easyPgDefault = 'Easy effort — conversational pace';

  return weeks.map((week: any, wi: number) => {
    const weekNum  = wi + 1;
    let workouts   = [...(week.workouts || [])] as any[];

    // 1. training_days check
    const nonRestCount = workouts.filter((w: any) => !w.is_rest_day && (w.distance_miles ?? 0) > 0).length;
    if (nonRestCount > targetDays) {
      const lowPriority = ['easy', 'easy_speeddev'];
      let excess = nonRestCount - targetDays;
      for (const pr of lowPriority) {
        if (excess <= 0) break;
        for (const wo of workouts) {
          if (excess <= 0) break;
          if ((wo.role === pr || wo.type === pr) && !wo.is_rest_day && (wo.distance_miles ?? 0) > 0) {
            wo.is_rest_day     = true;
            wo.title           = 'Rest Day';
            wo.distance_miles  = 0;
            wo.total_distance  = 0;
            wo.description     = '';
            excess--;
          }
        }
      }
    }

    // 2. pace_present check
    for (const wo of workouts) {
      if (!wo.is_rest_day && !(wo.pace_guideline as string | null | undefined)) {
        wo.pace_guideline = easyPgDefault;
      }
    }

    return { ...week, workouts };
  });
}

// ── Main exported function ────────────────────────────────────────────────────

export function buildPlanSkeleton(
  athlete:       any,
  startDate?:    string,
  raceCalendar?: any[],
): PlanSkeleton {
  const today        = new Date().toISOString().slice(0, 10);
  const start        = startDate ?? getWeekStartDate();
  const races        = raceCalendar ?? [];

  const tier          = classifyAthleteTier(athlete);
  const phase         = getPhaseFromDates(athlete);
  const paceBandsRaw  = derivePaceBands(athlete);
  const eventPaces    = deriveEventPaces(athlete);
  const fitnessRating = Number(athlete.fitness_rating ?? 5);

  const rawMpw       = Number(athlete.current_weekly_mileage ?? athlete.weekly_volume_miles ?? 0);
  const effectiveMpw = rawMpw > 0 ? rawMpw : DEFAULT_MPW[tier];
  const trainingDays = clamp(Number(athlete.training_days_per_week ?? DEFAULT_DAYS[tier]), 3, 7);
  const mpwBand      = getMpwBand(effectiveMpw);
  const wc           = getWarmupCooldown(mpwBand);
  const paceBands    = paceBandsRaw.needs_aerobic_pr ? null : paceBandsRaw;

  const totalWeeks   = computeTotalWeeks(athlete, races, today);
  const weeksOfEaseIn = computeEaseInWeeks(athlete, tier);
  const weeksToRace   = computeWeeksToRace(athlete, races, today);

  const rotationState: Record<string, number> = {};
  const recentlyUsed:  Record<string, string[]> = {};

  const weeks: PlanWeek[] = [];

  for (let wi = 0; wi < totalWeeks; wi++) {
    const weekNum    = wi + 1;
    const isEaseIn   = wi < weeksOfEaseIn;
    const buildWeeks = wi - weeksOfEaseIn;

    // Recovery week: every 4th non-ease-in week
    const isRecoveryWeek = !isEaseIn && buildWeeks > 0 && (buildWeeks + 1) % 4 === 0;

    // Taper: last 2 weeks before race
    const weeksLeft   = totalWeeks - wi;
    const isTaperWeek = weeksToRace != null && weeksLeft <= 2;

    const weekPhase =
      isEaseIn || isRecoveryWeek ? 'ease_in' :
      isTaperWeek ? 'competition' :
      phase;

    const targetMiles = computeTargetMiles(
      effectiveMpw, wi, weeksOfEaseIn, weekPhase,
      isRecoveryWeek, isTaperWeek, weeksLeft, tier,
    );

    const roleMapPhase = (isEaseIn || isRecoveryWeek) ? 'ease_in' : phase;
    const roleMap      = getRoleMap(trainingDays, roleMapPhase);

    // For workout selection, use the actual training phase (not ease_in)
    const workoutPhase = (isEaseIn || isRecoveryWeek) ? 'base' : phase;

    const workouts = buildWeekWorkouts(
      roleMap, weekNum, workoutPhase, targetMiles,
      tier, mpwBand, wc, paceBands, eventPaces,
      rotationState, recentlyUsed, isEaseIn || isRecoveryWeek,
    );

    adjustEasyDistances(workouts, targetMiles, tier);

    // Attach dates
    const weekStart = addDays(start, wi * 7);
    for (const wo of workouts) {
      wo.date = addDays(weekStart, wo.dayOfWeek - 1);
    }

    weeks.push({
      weekNumber:  weekNum,
      phase:       isRecoveryWeek ? 'recovery' : weekPhase === 'ease_in' ? 'ease_in' : weekPhase,
      targetMiles,
      trainingDays,
      workouts,
    });
  }

  return { tier, phase, totalWeeks, weeksOfEaseIn, mpwBand, paceBands, eventPaces, warmup: wc.warmup_mi, cooldown: wc.cooldown_mi, weeks };
}
