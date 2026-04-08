/**
 * coachParamLibrary.ts
 * Coaching parameter library for 1500m / 800m / Mile events.
 * Source of truth for phase model, pace engine, workout library, volume caps,
 * rotation logic, and guardrails. Used by runningExpertBaseline and athleteContext.
 */

// ── A. Phase Model ─────────────────────────────────────────────────────────────

export const PHASE_MODEL = {
  ease_in: {
    label: 'Ease-In',
    intent:
      'Readiness-driven reentry. Rebuild tolerance, avoid event-specific load, earn entry into Base. ' +
      'Duration driven by athlete fitness readiness level.',
  },
  base: {
    label: 'Base',
    intent:
      'Primary development block. Build aerobic foundation, introduce controlled bridge work. ' +
      'Longest phase; aerobic systems are the priority.',
  },
  pre_competition: {
    label: 'Pre-Competition',
    intent:
      'Trim aerobic volume, add rhythm and event-specific support. ' +
      'Bridge workouts connect aerobic base to race-specific demands.',
  },
  competition: {
    label: 'Competition',
    intent:
      'Preserve aerobic support at lower total cost. Sharpen race feel. ' +
      'Total training cost must be lower than Pre-Competition.',
  },
} as const;

export type Phase = keyof typeof PHASE_MODEL;

// ── B. Readiness Ease-In ───────────────────────────────────────────────────────
// fitness_level (text from onboarding) maps to a % readiness:
//   elite → 90, competitive → 80, intermediate → 70, beginner → 50

export const READINESS_EASE_IN: Record<string, { weeks: number; permissions: string }> = {
  fitness_90: {
    weeks: 1,
    permissions:
      'Allow 1 aerobic session + 1 long run. No specific work. No race-specific workout in week 1.',
  },
  fitness_80: {
    weeks: 1,
    permissions: 'Easy running only.',
  },
  fitness_70: {
    weeks: 2,
    permissions: 'Easy running only.',
  },
  fitness_60: {
    weeks: 3,
    permissions: 'Easy running only.',
  },
  fitness_50: {
    weeks: 4,
    permissions: 'Easy running only.',
  },
};

/** Map onboarding fitness_level text to readiness bucket */
export function fitnessLevelToReadiness(fitnessLevel: string): string {
  switch (fitnessLevel) {
    case 'elite': return 'fitness_90';
    case 'competitive': return 'fitness_80';
    case 'intermediate': return 'fitness_70';
    case 'beginner':
    default: return 'fitness_50';
  }
}

// ── C. Ease-In Mileage Ramp ───────────────────────────────────────────────────

export const EASE_IN_MILEAGE_RAMP: Record<string, number> = {
  week_1: 0.85,
  week_2: 0.92,
  week_3: 0.97,
  week_4: 1.00,
};
// Apply only as many steps as the readiness bucket requires.

// ── D. Long Run Share By Phase ────────────────────────────────────────────────

export const LONG_RUN_SHARE_BY_PHASE: Record<Phase, { min_pct: number; max_pct: number; notes: string }> = {
  ease_in:          { min_pct: 12, max_pct: 17, notes: 'Easy only. Never split. No fast finish or surges.' },
  base:             { min_pct: 16, max_pct: 21, notes: 'Easy only. Never split. No fast finish or surges.' },
  pre_competition:  { min_pct: 12, max_pct: 17, notes: 'Easy only. Never split. No fast finish or surges.' },
  competition:      { min_pct: 10, max_pct: 15, notes: 'Easy only. Never split. No fast finish or surges.' },
};

// ── E. Base Entry Dampening ───────────────────────────────────────────────────

export const BASE_ENTRY_DAMPENING = {
  rep_work_300m_and_longer: {
    week_1: 'Up to 10% slower than target. Lighter volume.',
    week_2: 'Return toward target. Still conservative.',
  },
  lt2_aerobic_work: {
    guidance:
      'Use the conservative end of the LT2 band, or approximately 5-10 sec/mi slower than LT2 target.',
  },
  note: 'Do not force full event rhythm immediately after Ease-In. Earn it back.',
};

// ── F. Weekly Pattern ─────────────────────────────────────────────────────────

export const WEEKLY_PATTERN = {
  default_backbone: {
    monday: 'aerobic',
    tuesday: 'easy',
    wednesday: 'easy + speed development',
    thursday: 'specific',
    friday: 'easy',
    saturday: 'long run',
    sunday: 'off',
  },
  role_maps: {
    ease_in: {
      d3: ['mon_easy', 'thu_easy', 'sat_longrun'],
      d4: ['mon_easy', 'wed_easy', 'thu_easy', 'sat_longrun'],
      d5: ['mon_easy', 'tue_easy', 'wed_easy', 'thu_easy', 'sat_longrun'],
      d6: ['mon_easy', 'tue_easy', 'wed_easy', 'thu_easy', 'fri_easy', 'sat_longrun'],
      d7: ['mon_easy', 'tue_easy', 'wed_easy', 'thu_easy', 'fri_easy', 'sat_longrun', 'sun_off'],
    },
    training_phases: {
      // applies to base, pre_competition, competition
      d3: ['mon_aerobic', 'thu_specific', 'sat_longrun'],
      d4: ['mon_aerobic', 'wed_easy_speeddev', 'thu_specific', 'sat_longrun'],
      d5: ['mon_aerobic', 'tue_easy', 'wed_easy_speeddev', 'thu_specific', 'sat_longrun'],
      d6: ['mon_aerobic', 'tue_easy', 'wed_easy_speeddev', 'thu_specific', 'fri_easy', 'sat_longrun'],
      d7: ['mon_aerobic', 'tue_easy', 'wed_easy_speeddev', 'thu_specific', 'fri_easy', 'sat_longrun', 'sun_off'],
    },
  },
  fallbacks: {
    specific_unavailable: 'Fall back to aerobic.',
    easy_speeddev_unavailable: 'Fall back to easy.',
  },
};

// ── G. Pace Engine Rules ──────────────────────────────────────────────────────

export const PACE_ENGINE_RULES = {
  aerobic_systems: {
    derives_from: '3000m+ performances only (3000m, 3200m, 5K, 8K, 10K, half marathon, marathon)',
    includes: ['LT2', 'LT1', 'VO2', 'steady', 'easy', 'recovery'],
    rule: 'If athlete has no 3000m+ result, ask for one or estimate conservatively. NEVER use mile or 800m PR to set threshold, steady, easy, or recovery pace.',
  },
  event_specific_systems: {
    derives_from: 'Shorter PRs (1500m, mile, 800m)',
    includes: ['mile pace', '1500 rhythm work', 'REP pace', '800 pace', 'goal pace workouts'],
    rule: 'Goal pace workouts anchor to athlete\'s target 1500m performance.',
  },
  priority: 'If athlete has both shorter PR and 3000m+ result: 3000m+ result controls all aerobic systems. Shorter PR controls only event-specific work.',
};

// ── H. Pace Bands (reference example for 13:19 5K athlete) ───────────────────

export const PACE_BANDS_REFERENCE = {
  note: 'Example for a 13:19 5K athlete — for reference only. Derive per-athlete from their actual PRs.',
  LT2:       '4:42-4:55/mi',
  LT1:       '5:02-5:12/mi',
  Steady:    '5:30-5:50/mi',
  Easy:      '6:45-7:15/mi',
  Recovery:  '7:15-8:00/mi',
};

// ── I. Warm-Up / Cool-Down Scaling ────────────────────────────────────────────

export const WARMUP_COOLDOWN_SCALING: Record<string, { warmup_mi: number; cooldown_mi: number }> = {
  under_30:   { warmup_mi: 0.75, cooldown_mi: 0.75 },
  mpw_30_40:  { warmup_mi: 1.00, cooldown_mi: 1.00 },
  mpw_40_50:  { warmup_mi: 1.25, cooldown_mi: 1.25 },
  over_50:    { warmup_mi: 1.50, cooldown_mi: 1.50 },
};
// Total range 1.25-3.0mi. Round to nearest 0.25mi.
// Speed development days: easy volume first, then speed work.

export function getMpwBand(mpw: number): string {
  if (mpw < 30) return 'under_30';
  if (mpw < 40) return 'mpw_30_40';
  if (mpw < 50) return 'mpw_40_50';
  return 'over_50';
}

export function getWarmupCooldown(mpwBand: string): { warmup_mi: number; cooldown_mi: number } {
  return WARMUP_COOLDOWN_SCALING[mpwBand] ?? WARMUP_COOLDOWN_SCALING.under_30;
}

export function getRoleMap(trainingDays: number, phase: string): string[] {
  const d = `d${Math.min(Math.max(trainingDays, 3), 7)}` as keyof typeof WEEKLY_PATTERN.role_maps.ease_in;
  if (phase === 'ease_in') {
    return [...(WEEKLY_PATTERN.role_maps.ease_in[d] ?? WEEKLY_PATTERN.role_maps.ease_in.d5)];
  }
  const key = d as keyof typeof WEEKLY_PATTERN.role_maps.training_phases;
  return [...(WEEKLY_PATTERN.role_maps.training_phases[key] ?? WEEKLY_PATTERN.role_maps.training_phases.d5)];
}

// ── J. Volume Caps ────────────────────────────────────────────────────────────

export const VOLUME_CAPS = {
  specific_work_weekly: {
    base:             { min_m: 3200, max_m: 3600 },
    pre_competition:  { min_m: 3800, max_m: 4200 },
    competition:      { min_m: 3200, max_m: 3800 },
  },
  rep_per_session: {
    base:             1000,
    pre_competition:  1200,
    competition:      1000,
  },
  rep_per_week: {
    base:             1600,
    pre_competition:  1800,
    competition:      1600,
  },
  pure_speed_per_session: {
    base:             400,
    pre_competition:  300,
    competition:      250,
  },
  pure_speed_per_week: {
    base:             800,
    pre_competition:  600,
    competition:      400,
  },
};

// ── K. Distribution By Phase ──────────────────────────────────────────────────

export const DISTRIBUTION_BY_PHASE: Record<string, Record<string, { min_pct: number; max_pct: number }>> = {
  base: {
    aerobic_support:   { min_pct: 45, max_pct: 50 },
    specific_bridge:   { min_pct: 30, max_pct: 35 },
    rep_faster_support:{ min_pct: 10, max_pct: 15 },
    speed_dev:         { min_pct: 5,  max_pct: 10 },
  },
  pre_competition: {
    aerobic_support:   { min_pct: 35, max_pct: 40 },
    specific_bridge:   { min_pct: 35, max_pct: 40 },
    rep_rhythm:        { min_pct: 15, max_pct: 20 },
    speed_dev:         { min_pct: 5,  max_pct: 10 },
  },
  competition: {
    aerobic_support:      { min_pct: 25, max_pct: 30 },
    specific_goal_pace:   { min_pct: 40, max_pct: 45 },
    rep_sharpening:       { min_pct: 20, max_pct: 25 },
    speed_dev:            { min_pct: 5,  max_pct: 10 },
  },
};

// ── L. Workout Library ────────────────────────────────────────────────────────

export const WORKOUT_LIBRARY = {

  // ── BASE — AEROBIC ──────────────────────────────────────────────────────────

  tempo_run: {
    phase: 'base',
    category: 'aerobic',
    description: 'Continuous run at halfway between LT1 and LT2. 15% less volume than progressive tempo.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: Continuous tempo run at the midpoint between LT1 and LT2 — comfortably hard, where you can speak a word or two but not hold a conversation. Target: {lt1_pace} building toward {lt2_pace}.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: Lock in the midpoint effort from the first half-mile and hold it. This is not a progressive run — even effort from start to finish. If pace drifts faster on its own, back off.',
    pace_source: '3000m+ only',
    volume_by_mpw: {
      under_30:  { min_mi: 3.75, max_mi: 4.75 },
      mpw_30_40: { min_mi: 4.25, max_mi: 5.25 },
      mpw_40_50: { min_mi: 5.00, max_mi: 6.00 },
      mpw_50_60: { min_mi: 5.50, max_mi: 6.25 },
      over_60:   { min_mi: 5.50, max_mi: 6.25 },
    },
    rest: 'continuous (no rest)',
    tags: ['aerobic', 'tempo'],
  },

  progressive_tempo_run: {
    phase: 'base',
    category: 'aerobic',
    description: 'Start at LT1 effort, build to LT2 by the end.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: Begin at LT1 effort ({lt1_pace}) for the first third. Build steadily through the middle. Finish the final mile at LT2 pace ({lt2_pace}). Every mile should feel slightly harder than the last.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: Don\'t rush the build. The value is in the progression, not grinding the final miles. If you hit LT2 too early, back off and rebuild. The last mile at LT2 should feel earned, not desperate.',
    pace_source: '3000m+ only',
    volume_by_mpw: {
      under_30:  { min_mi: 3.75, max_mi: 4.75 },
      mpw_30_40: { min_mi: 4.25, max_mi: 5.25 },
      mpw_40_50: { min_mi: 5.00, max_mi: 6.00 },
      mpw_50_60: { min_mi: 5.50, max_mi: 6.25 },
      over_60:   { min_mi: 5.50, max_mi: 6.25 },
    },
    rest: 'continuous (no rest)',
    tags: ['aerobic', 'progressive_tempo'],
  },

  threshold_1000s: {
    phase: 'base',
    category: 'aerobic',
    description: '1000m repetitions at LT2 pace.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: 1000m repetitions at LT2 pace ({lt2_pace}). 60–90 seconds easy jog recovery between each rep. Maintain the same split across every rep — consistency matters more than any individual rep.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: LT2 is not a sprint. It\'s a controlled, sustained effort you could hold for 30–40 minutes. If your splits drift faster as the session goes on, you started too hard. Aim for a perfectly even set.',
    pace_source: '3000m+ only',
    reps_by_mpw: {
      under_30:  { min: 3, max: 5 },
      mpw_30_40: { min: 4, max: 6 },
      mpw_40_50: { min: 5, max: 7 },
      mpw_50_60: { min: 6, max: 8 },
      over_60:   { min: 6, max: 8 },
    },
    rest: '60-90 sec jog recovery',
    tags: ['aerobic', 'threshold', 'intervals'],
  },

  threshold_1600s: {
    phase: 'base',
    category: 'aerobic',
    description: '1600m repetitions at LT2 pace.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: 1600m repetitions at LT2 pace ({lt2_pace}). 60–90 seconds easy jog recovery between reps. Each mile should feel controlled and repeatable — not race-pace effort.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: Longer threshold reps build your ability to sustain threshold pace for extended periods — essential for any 1500m or mile race. Consistency across every rep is the marker of a good session.',
    pace_source: '3000m+ only',
    reps_by_mpw: {
      under_30:  { min: 2, max: 3 },
      mpw_30_40: { min: 3, max: 4 },
      mpw_40_50: { min: 3, max: 5 },
      mpw_50_60: { min: 4, max: 5 },
      over_60:   { min: 4, max: 5 },
    },
    rest: '60-90 sec jog recovery',
    tags: ['aerobic', 'threshold', 'intervals'],
  },

  // ── BASE — SPECIFIC / BRIDGE ────────────────────────────────────────────────

  base_400s_5k_to_3k: {
    phase: 'base',
    category: 'specific_bridge',
    description: '400m repetitions starting at 5K pace, progressing toward 3K pace over the session.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: 400m repetitions starting at 5K pace and progressing toward 3K pace across the session. Early reps should feel controlled and fast — not all-out. Equal-time rest between reps.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: This workout bridges aerobic and event-specific work. Don\'t start at 3K pace — start comfortably at 5K effort and let the session build organically. The final 2–3 reps should feel genuinely fast but controlled.',
    pace_source: '3000m+ only',
    reps_by_mpw: {
      under_30:  { min: 6, max: 6 },
      mpw_30_40: { min: 7, max: 7 },
      mpw_40_50: { min: 8, max: 8 },
      mpw_50_60: { min: 8, max: 9 },
      over_60:   { min: 9, max: 9 },
    },
    rest: 'equal rest (same duration as rep)',
    tags: ['specific_base', 'vo2_support'],
  },

  half_threshold_plus_cutdown: {
    phase: 'base',
    category: 'specific_bridge',
    description:
      'Half normal 1000m threshold volume at LT2, followed by 800-600-400-200-200 cutdown ' +
      'from 3K pace down toward 800 pace. Threshold portion = 50% of normal session volume. Cutdown fixed at 2200m total.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: First block: 1000m reps at LT2 ({lt2_pace}), 60–90s jog recovery. Then 3–4 minutes easy jog transition. Second block: 800–600–400–200–200 cutdown from 3K pace down to 800 pace ({pace_800}). 90s or 200m jog between cutdown reps.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: This is a bridge session — aerobic work first to prime your system, then event-specific rhythm. Don\'t attack the cutdown fresh. The goal is controlled race-rhythm work on already-working legs.',
    pace_source: '3000m+ for threshold portion; mile/800 PR for cutdown',
    rest: 'Threshold: 60-90s jog. Transition: 3-4min easy. Cutdown: 200m jog or 90s hybrid.',
    tags: ['bridge', 'aerobic_to_specific'],
  },

  half_tempo_plus_600s_at_3k: {
    phase: 'base',
    category: 'specific_bridge',
    description: 'Half normal tempo volume, then 600m repetitions at 3K pace.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: Half your normal tempo volume at LT1-to-LT2 effort ({lt1_pace}–{lt2_pace}), then 600m repetitions at 3K pace. Equal-time rest between 600s.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: The tempo portion is a primer — aerobic stress without depleting you for the 600s. Treat the 600s as quality bridge work: controlled and rhythmic, not sprint efforts. If the 600s feel labored, back off 2–3 seconds per mile.',
    pace_source: '3000m+ for tempo; 3000m+ PR for 600s at 3K pace',
    reps_600_by_mpw: {
      under_30:  2,
      mpw_30_40: 3,
      mpw_40_50: 3,
      mpw_50_60: 4,
      over_60:   4,
    },
    rest: 'Equal rest on 600s.',
    tags: ['bridge', 'aerobic_to_specific'],
  },

  sixty_second_hills: {
    phase: 'base',
    category: 'specific_bridge',
    description:
      '60-second hill repetitions at strong aerobic power effort. ' +
      'If no hill available, substitute 400s at 5K-3K pace.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: 60-second hill repetitions at strong aerobic power effort. Drive your arms, stay tall, maintain quick turnover. Jog back down for full recovery between reps. No hill available? Substitute 400m reps at 5K-to-3K effort.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: Hills are strength work disguised as running. Don\'t sprint to the top — run at a sustained, powerful aerobic effort. The grade does the work. Full jog recovery down is non-negotiable.',
    pace_source: 'Effort-based (no specific pace target)',
    reps_by_mpw: {
      under_30:  { min: 4, max: 5 },
      mpw_30_40: { min: 5, max: 6 },
      mpw_40_50: { min: 6, max: 7 },
      mpw_50_60: { min: 7, max: 8 },
      over_60:   { min: 8, max: 8 },
    },
    rest: 'Jog down recovery.',
    tags: ['specific_base', 'hill_strength', 'vo2_support'],
  },

  // ── PRE-COMPETITION — AEROBIC SUPPORT ───────────────────────────────────────

  tempo_plus_400s_3k: {
    phase: 'pre_competition',
    category: 'aerobic_support',
    description:
      'Tempo at LT1/LT2 midpoint (80% of base volume), then 400m repetitions at 3K pace.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: 80% of your base tempo volume at LT1-to-LT2 midpoint ({lt1_pace}–{lt2_pace}), then 400m repetitions at 3K pace. 200m jog recovery between 400s.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: This is a pre-competition aerobic bridge — shorter tempo to preserve legs for the 400s, which simulate race-intensity rhythm. Nail the tempo first, then let the 400s flow naturally from controlled aerobic fatigue.',
    pace_source: '3000m+ for tempo; 3000m+ for 400s at 3K pace',
    tempo_volume_by_mpw: {
      under_30:  { min_mi: 2.5, max_mi: 3.1 },
      mpw_30_40: { min_mi: 2.6, max_mi: 3.6 },
      mpw_40_50: { min_mi: 3.4, max_mi: 4.0 },
      mpw_50_60: { min_mi: 3.9, max_mi: 4.2 },
      over_60:   { min_mi: 3.9, max_mi: 4.2 },
    },
    reps_400_by_mpw: {
      under_30:  4,
      mpw_30_40: 5,
      mpw_40_50: 6,
      mpw_50_60: 6,
      over_60:   7,
    },
    rest: '200m jog or equal standing rest on 400s.',
    tags: ['bridge', 'aerobic_to_specific'],
  },

  progressive_tempo_plus_150s: {
    phase: 'pre_competition',
    category: 'aerobic_support',
    description:
      'Progressive tempo (80% of base volume) then 150m repetitions at mile-to-800 rhythm.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: 80% of base progressive tempo volume — start at LT1 ({lt1_pace}), build to LT2 ({lt2_pace}) — then 150m repetitions at mile-to-800 rhythm ({mile_pace}). Full walk or jog recovery between 150s.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: The 150s are rhythm pieces, not sprints. Run them at a controlled, fast-but-smooth effort. The goal is neuromuscular freshness after aerobic fatigue — teaching your legs to turn over quickly even when tired.',
    pace_source: '3000m+ for tempo; mile/800 PR for 150s',
    reps_150_by_mpw: {
      under_30:  4,
      mpw_30_40: 5,
      mpw_40_50: 6,
      mpw_50_60: 6,
      over_60:   8,
    },
    rest: 'Full walk/jog recovery on 150s.',
    tags: ['bridge', 'aerobic_to_specific'],
  },

  threshold_1000s_fast_first_plus_400s: {
    phase: 'pre_competition',
    category: 'aerobic_support',
    description:
      '1000m reps where first 200m is at 3K pace then settles to threshold. ' +
      '90% of base 1000 volume rounded down. Add 4x400 at mile pace (trim to 3x400 for low-readiness athletes).',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: 1000m reps — first 200m at 3K effort, then settle to LT2 ({lt2_pace}) for the remaining 800m. 5 minutes full recovery between 1000s. Then 4 x 400m at mile pace ({mile_pace}), 90 seconds–2 minutes between 400s.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: The fast-first 200m teaches your body to handle surges before settling. It\'s harder than it sounds — genuinely commit to 3K effort on that first 200m, not mile effort. The settle to threshold should feel like a relief, not a struggle.',
    pace_source: '3000m+ for threshold; mile PR for 400s',
    rest: '5min between 1000s. 90s-2min on 400s.',
    tags: ['bridge', 'special_aerobic'],
  },

  threshold_1600s_plus_alt_200s: {
    phase: 'pre_competition',
    category: 'aerobic_support',
    description:
      '1600m threshold reps (90% of base volume, rounded down), then alternating 200s at mile and 800 pace.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: 1600m threshold reps at LT2 ({lt2_pace}), 60–90s jog between reps. Then alternating 200m reps — odd reps at mile pace ({mile_pace}), even reps at 800 pace ({pace_800}). 75 seconds standing rest between 200s.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: The alternating 200s calibrate your pace feel — training your body to shift between mile and 800 rhythm. Keep the 800-pace reps smooth and controlled, not maximal. If they feel labored, the threshold portion was too hard.',
    pace_source: '3000m+ for threshold; mile/800 PR for 200s',
    reps_200_by_mpw: {
      under_30:  4,
      mpw_30_40: 4,
      mpw_40_50: 6,
      mpw_50_60: 6,
      over_60:   6,
    },
    rest: '60-90s jog on 1600s. 75s standing on 200s.',
    tags: ['bridge', 'aerobic_to_specific'],
  },

  // ── PRE-COMPETITION — SPECIFIC ───────────────────────────────────────────────

  mile_300s: {
    phase: 'pre_competition',
    category: 'specific',
    description: '300m repetitions at mile pace.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: 300m repetitions at mile pace ({mile_pace}). 50m walk + 50m jog recovery between reps. Each rep should feel controlled and fast — not a sprint.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: Mile-pace 300s are your event rhythm builder. Run relaxed and tall — tight mechanics slow you down. If the reps feel labored by rep 5, you started too fast. These should feel fast but never desperate.',
    pace_source: 'Mile/1500 PR',
    reps_by_mpw: {
      under_30:  8,
      mpw_30_40: 9,
      mpw_40_50: 10,
      mpw_50_60: 11,
      over_60:   12,
    },
    rest: '50m walk + 50m jog between reps.',
    tags: ['specific', 'mile_rhythm'],
  },

  quarter_threshold_plus_800s_plus_400s: {
    phase: 'pre_competition',
    category: 'specific',
    description:
      '25% of normal 1000m threshold volume, then 800s at 3200 pace, then 400s at mile pace.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: 25% of normal threshold 1000m volume at LT2 ({lt2_pace}), 60–90s recovery. Then 800m reps at 3200 pace, ~2 minutes recovery. Then 2–3 x 400m at mile pace ({mile_pace}), 90 seconds–2 minutes recovery.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: Three energy systems in one session. The threshold portion is a primer — controlled aerobic work. The 800s are the core. The 400s are event rhythm finish. Resist the urge to run the threshold portion hard. You need the legs for the 800s.',
    pace_source: '3000m+ for threshold; 3000m+ for 800s; mile PR for 400s',
    threshold_reps_by_mpw: {
      under_30:  1,
      mpw_30_40: 2,
      mpw_40_50: 2,
      mpw_50_60: 2,
      over_60:   2,
    },
    reps_800_by_mpw: {
      under_30:  1,
      mpw_30_40: 2,
      mpw_40_50: 2,
      mpw_50_60: 2,
      over_60:   3,
    },
    reps_400: '2-3 by band',
    rest: '60-90s on threshold. ~2min on 800s. 90s-2min on 400s.',
    tags: ['bridge', 'aerobic_to_specific'],
  },

  sets_400_300_200: {
    phase: 'pre_competition',
    category: 'specific',
    description:
      'Sets of 400-300-200. 400 at mile pace cutting down toward 800 pace on the 200.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: Sets of 400-300-200. 400m at mile pace ({mile_pace}), 90s rest, 300m cutting down toward 800 pace, 90s rest, 200m at 800 pace ({pace_800}). 3 minutes between sets.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: Each set is a mini-race model — start at mile effort, accelerate through the 300, finish fast at 800 effort. The 3-minute recovery between sets is full recovery. Don\'t approach the next set still breathing hard.',
    pace_source: 'Mile/800 PR',
    sets_by_mpw: {
      under_30:  2,
      mpw_30_40: 3,
      mpw_40_50: 3,
      mpw_50_60: 4,
      over_60:   4,
    },
    rest: '90s between reps within set. 3min between sets.',
    tags: ['specific', 'cutdown'],
  },

  sets_4x250_mile: {
    phase: 'pre_competition',
    category: 'specific',
    description: 'Sets of 4x250m at mile pace.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: Sets of 4 x 250m at mile pace ({mile_pace}). 60 seconds between reps within each set. 3 minutes full recovery between sets.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: 250m is the sweet spot for mile rhythm — long enough to lock in the effort, short enough to stay relaxed. Focus on running smooth and tall rather than straining for speed. The pace should feel fast but controlled, not forced.',
    pace_source: 'Mile/1500 PR',
    sets_by_mpw: {
      under_30:  2,
      mpw_30_40: 2,
      mpw_40_50: 3,
      mpw_50_60: 3,
      over_60:   5,
    },
    rest: '60s between reps. 3min between sets.',
    tags: ['specific', 'mile_rhythm'],
  },

  // ── COMPETITION — SPECIFIC SHARPENING ───────────────────────────────────────

  sets_800_600_plus_150s: {
    phase: 'competition',
    category: 'specific',
    description:
      'Sets of (800m at threshold + 600m at 3200 pace) then 150s at mile-800 rhythm.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: Sets of (800m at threshold, 90s rest, 600m at 3200 pace, 2 min rest), then 150m reps at mile-800 rhythm ({mile_pace}). 200m jog + 50m walk between 150s.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: This session bridges threshold and race rhythm. The 600m after each 800m teaches you to push when tired — critical for mid-race surges. The 150s are sharpeners: run them smooth and fast, not desperate.',
    pace_source: '3000m+ for threshold; 3000m+ for 3200 pace; mile/800 PR for 150s',
    sets_and_150s_by_mpw: {
      under_30:  { sets: 2, reps_150: 2 },
      mpw_30_40: { sets: 2, reps_150: 3 },
      mpw_40_50: { sets: 3, reps_150: 3 },
      mpw_50_60: { sets: 3, reps_150: 4 },
      over_60:   { sets: 3, reps_150: 4 },
    },
    rest: '90s after 800. 2min after 600. 200m jog + 50m walk on 150s.',
    tags: ['bridge', 'special_comp_support'],
  },

  goal_pace_tune_up: {
    phase: 'competition',
    category: 'specific',
    description:
      'Race-model session: 1x1000m threshold, 2x150m at mile pace, 1x800m at goal 1500 pace, ' +
      '1-3x400m at goal pace (by band), finish 1x300m cutdown.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: 1 x 1000m at LT2 ({lt2_pace}). 2 x 150m at mile pace ({mile_pace}). 1 x 800m at goal 1500 pace. 6 minutes easy jog. Goal-pace 400s. 90 seconds between 400s. 1 x 300m cutdown to 800 pace ({pace_800}).\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: This session is a dress rehearsal for race day. Every element simulates something you\'ll face in competition — threshold control, rhythm shifts, goal-pace execution, and a closing surge. The 800m is the centerpiece. Treat it like a race effort.',
    pace_source: 'Goal 1500m performance for race-pace elements; 3000m+ for threshold',
    reps_400_by_mpw: {
      under_30:  1,
      mpw_30_40: 2,
      mpw_40_50: 2,
      mpw_50_60: 3,
      over_60:   3,
    },
    rest: '200m jog + 50m walk on 150s. 3min before 800. 6min easy after 800. 90s on 400s.',
    tags: ['specific', 'race_model'],
  },

  mile_300s_plus_two_800pace: {
    phase: 'competition',
    category: 'specific',
    description:
      'Pre-comp 300s minus 3 reps at mile pace, then add 2x300m at 800 pace.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: Mile-pace 300s (fewer than pre-competition count), standard 50m walk + 50m jog recovery. Then 2 x 300m at 800 pace ({pace_800}) — 3 minutes full recovery between the fast 300s.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: The 800-pace 300s at the end are the sharpening element. Don\'t blow yourself up on the mile-pace reps — they\'re a warm-up for the real work. Save something real for those final two.',
    pace_source: 'Mile/800 PR',
    total_volume_by_mpw: {
      under_30:  { mile_reps: 5, pace_800_reps: 2, total_m: 2100 },
      mpw_30_40: { mile_reps: 6, pace_800_reps: 2, total_m: 2400 },
      mpw_40_50: { mile_reps: 7, pace_800_reps: 2, total_m: 2700 },
      mpw_50_60: { mile_reps: 9, pace_800_reps: 2, total_m: 3300 },
      over_60:   { mile_reps: 9, pace_800_reps: 2, total_m: 3300 },
    },
    rest: 'Standard 300s: 50m walk + 50m jog. 3min before and between 800-pace reps.',
    tags: ['specific', 'sharpening'],
  },

  competition_sets_400_300_200: {
    phase: 'competition',
    category: 'specific',
    description:
      'Competition version of sets_400_300_200. Reduce total sets by one vs Pre-Competition band.',
    full_description:
      'Warmup: {warmup_distance} miles easy at {easy_pace}.\n\n' +
      'Main Set: Sets of 400-300-200, competition version (one fewer set than pre-competition). 400m at mile pace ({mile_pace}), 90s rest, 300m cutting down, 90s rest, 200m at 800 pace ({pace_800}). 3 minutes between sets.\n\n' +
      'Cooldown: {cooldown_distance} miles easy.\n\n' +
      'Coaching Cue: Fewer sets, same quality. In competition phase you\'re sharpening — not building. Each set should feel crisp and controlled. If the 200s feel labored, you started the set too hard.',
    pace_source: 'Mile/800 PR',
    rest: '90s between reps. 3min between sets.',
    tags: ['specific', 'comp_sharpening', 'cutdown'],
  },

} as const;

// ── M. Rotation Logic ─────────────────────────────────────────────────────────

export const ROTATION_LOGIC = {
  non_repeat_window_weeks: 2,
  base_aerobic_rotation: ['tempo_run', 'progressive_tempo_run', 'threshold_1000s', 'threshold_1600s'],
  base_specific_rotation: ['base_400s_5k_to_3k', 'half_threshold_plus_cutdown', 'half_tempo_plus_600s_at_3k', 'sixty_second_hills'],
  base_speed_dev_rotation: ['strides_100', 'hill_sprints_10s', 'form_strides_100'],
  pre_comp_aerobic_rotation: ['tempo_plus_400s_3k', 'progressive_tempo_plus_150s', 'threshold_1000s_fast_first_plus_400s', 'threshold_1600s_plus_alt_200s'],
  pre_comp_specific_rotation: ['mile_300s', 'quarter_threshold_plus_800s_plus_400s', 'sets_400_300_200', 'sets_4x250_mile'],
  competition_specific_rotation: ['sets_800_600_plus_150s', 'goal_pace_tune_up', 'mile_300s_plus_two_800pace', 'competition_sets_400_300_200'],
};

// ── N. Speed Development Menus ────────────────────────────────────────────────

export const SPEED_DEVELOPMENT_MENUS: Record<string, string[]> = {
  ease_in: [
    '(fitness_90 only, optional) 4-6x100m relaxed strides at 3K-1500 rhythm',
    '(fitness_90 only, optional) 4x8-10sec hill sprints, effort-based',
  ],
  base: [
    '4-6x100m strides at 3K-1500 pace — rest: 50m walk + 50m jog',
    '4-6x10sec hill sprints, effort-based — rest: walk down',
    '4-6x100m form strides with cues (2 reps push into ground, 2 reps knee lift, 2 reps combine)',
  ],
  pre_competition: [
    '4-6x100m strides at 1500 rhythm',
    '4-6x120m relaxed fast — full recovery',
    '4x150m at mile-800 rhythm — full recovery',
    '4x10sec hills',
  ],
  competition: [
    '4x100m smooth fast — rest: 50m walk + 50m jog',
    '3-4x120m smooth fast — full recovery',
    '2-4x150m at mile rhythm — full recovery',
    '2-3x80m build strides — walk back recovery',
  ],
};

// ── O. Guardrails ─────────────────────────────────────────────────────────────

export const GUARDRAILS = [
  'Do not stack dense rhythm work on top of already dense weeks.',
  'Competition phase total training cost must be lower than Pre-Competition.',
  'Speed development stays low-cost and high-quality.',
  'Long run is never split.',
  'Workout families respect the 2-week non-repeat window.',
  'Use stop rules if pace drifts more than ~2-3% or mechanics tighten noticeably.',
  'Aerobic systems (LT2, LT1, steady, easy, recovery) NEVER use mile or 800m PR as pace source.',
  'If no 3000m+ result exists, ask the athlete for one or estimate conservatively.',
  'Competition phase: aerobic support is preserved, just reduced in volume.',
  'Ease-In duration is driven entirely by athlete readiness/fitness level, not a fixed number of weeks.',
];

// ── P. App Labeling Rules ─────────────────────────────────────────────────────

export const APP_LABELING_RULES = {
  workout_roles: ['easy', 'aerobic', 'specific', 'bridge', 'speed_dev', 'long_run', 'off'],
  mixed_session_label: 'Mixed sessions (half-threshold + cutdown, fast-first 1000s + 400s, etc.) → label as bridge.',
  pace_display: 'Always show resolved athlete-specific paces in mm:ss/mi for continuous work.',
  interval_display: 'Show split targets for interval work.',
  warmup_cooldown_display: 'Warm-up and cool-down round to nearest 0.25mi.',
  easy_pace_visibility: 'Easy pace always visible on easy or speed development days.',
};

// ── Root export ───────────────────────────────────────────────────────────────

export const COACH_PARAM_LIBRARY_1500M = {
  PHASE_MODEL,
  READINESS_EASE_IN,
  EASE_IN_MILEAGE_RAMP,
  LONG_RUN_SHARE_BY_PHASE,
  BASE_ENTRY_DAMPENING,
  WEEKLY_PATTERN,
  PACE_ENGINE_RULES,
  PACE_BANDS_REFERENCE,
  WARMUP_COOLDOWN_SCALING,
  VOLUME_CAPS,
  DISTRIBUTION_BY_PHASE,
  WORKOUT_LIBRARY,
  ROTATION_LOGIC,
  SPEED_DEVELOPMENT_MENUS,
  GUARDRAILS,
  APP_LABELING_RULES,
} as const;
