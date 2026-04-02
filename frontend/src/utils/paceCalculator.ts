/**
 * paceCalculator.ts
 * Pure-TypeScript copy of backend/src/utils/athleteTier.ts.
 * No Node.js dependencies — safe to import anywhere in the frontend.
 */

export type AthleteTier = 'beginner' | 'intermediate' | 'advanced';
export type TrainingPhase = 'ease_in' | 'base' | 'pre_competition' | 'competition';

// ── Time helpers ──────────────────────────────────────────────────────────────

/** Parse "mm:ss" or "h:mm:ss" to total seconds. Returns null if unparseable. */
export function parseTimeToSeconds(t: string): number | null {
  if (!t || typeof t !== 'string') return null;
  const parts = t.trim().split(':').map(s => parseInt(s, 10));
  if (parts.some(n => isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/** Total seconds → "m:ss" string. */
export function secondsToMmSs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Race time string + race distance in miles → per-mile pace in seconds. */
export function raceTimeToPacePerMile(raceTime: string, distanceMiles: number): number | null {
  const total = parseTimeToSeconds(raceTime);
  if (total === null || distanceMiles <= 0) return null;
  return total / distanceMiles;
}

const FIVE_K_MILES  = 3.10686;
const TEN_K_MILES   = 6.21371;
const HALF_MILES    = 13.1094;
const FULL_MILES    = 26.2188;

// ── Aerobic pace source ───────────────────────────────────────────────────────

function bestAerobicPace(athlete: Record<string, unknown>): { pacePerMile: number; sourcePR: string } | null {
  if (athlete.pr_5k) {
    const p = raceTimeToPacePerMile(athlete.pr_5k as string, FIVE_K_MILES);
    if (p) return { pacePerMile: p, sourcePR: `5K ${athlete.pr_5k}` };
  }
  if (athlete.pr_10k) {
    const p = raceTimeToPacePerMile(athlete.pr_10k as string, TEN_K_MILES);
    if (p) return { pacePerMile: p, sourcePR: `10K ${athlete.pr_10k}` };
  }
  if (athlete.pr_half_marathon) {
    const p = raceTimeToPacePerMile(athlete.pr_half_marathon as string, HALF_MILES);
    if (p) return { pacePerMile: p, sourcePR: `Half ${athlete.pr_half_marathon}` };
  }
  if (athlete.pr_marathon) {
    const p = raceTimeToPacePerMile(athlete.pr_marathon as string, FULL_MILES);
    if (p) return { pacePerMile: p, sourcePR: `Marathon ${athlete.pr_marathon}` };
  }
  return null;
}

// ── Pace bands ────────────────────────────────────────────────────────────────

export interface PaceBands {
  LT2: string;
  LT1: string;
  steady: string;
  easy: string;
  recovery: string;
  needs_aerobic_pr: boolean;
  source_pr: string | null;
}

/** Derive aerobic pace bands from athlete's best 3000m+ PR. */
export function derivePaceBands(athlete: Record<string, unknown>): PaceBands {
  const base = bestAerobicPace(athlete);
  if (!base) {
    return { LT2: '', LT1: '', steady: '', easy: '', recovery: '', needs_aerobic_pr: true, source_pr: null };
  }
  const p = base.pacePerMile;
  const fmt = (lo: number, hi: number) =>
    `${secondsToMmSs(Math.round(p * lo))}-${secondsToMmSs(Math.round(p * hi))}/mi`;
  return {
    LT2:      fmt(0.97, 1.02),
    LT1:      fmt(1.04, 1.08),
    steady:   fmt(1.13, 1.20),
    easy:     fmt(1.30, 1.42),
    recovery: fmt(1.42, 1.55),
    needs_aerobic_pr: false,
    source_pr: base.sourcePR,
  };
}

// ── Event paces ───────────────────────────────────────────────────────────────

export interface EventPaces {
  mile_pace: string | null;
  rep_pace:  string | null;
  pace_800:  string | null;
  pace_1500: string | null;
  pace_5k:   string | null;
}

/** Derive event-specific paces from shorter PRs. */
export function deriveEventPaces(athlete: Record<string, unknown>): EventPaces {
  let mile_pace: string | null = null;
  let pace_1500: string | null = null;
  let pace_800:  string | null = null;
  let pace_5k:   string | null = null;

  // Mile pace
  if (athlete.pr_mile) {
    const secs = parseTimeToSeconds(athlete.pr_mile as string);
    if (secs) mile_pace = secondsToMmSs(Math.round(secs)) + '/mi';
  } else if (athlete.pr_1500m) {
    const secs = parseTimeToSeconds(athlete.pr_1500m as string);
    if (secs) mile_pace = secondsToMmSs(Math.round(secs * 1.074)) + '/mi';
  }

  // 1500m pace per 400m (1500 = 3.75 × 400)
  if (athlete.pr_1500m) {
    const secs = parseTimeToSeconds(athlete.pr_1500m as string);
    if (secs) pace_1500 = secondsToMmSs(Math.round(secs / 3.75)) + '/400m';
  }

  // 800m pace per 400m (800 = 2 × 400)
  if (athlete.pr_800m) {
    const secs = parseTimeToSeconds(athlete.pr_800m as string);
    if (secs) pace_800 = secondsToMmSs(Math.round(secs / 2)) + '/400m';
  }

  // 5K per-mile race pace
  if (athlete.pr_5k) {
    const p = raceTimeToPacePerMile(athlete.pr_5k as string, FIVE_K_MILES);
    if (p) pace_5k = secondsToMmSs(Math.round(p)) + '/mi';
  }

  return { mile_pace, rep_pace: mile_pace, pace_800, pace_1500, pace_5k };
}

// ── Phase derivation ──────────────────────────────────────────────────────────

/** Derive current training phase from athlete's race date and fitness context. */
export function getPhaseFromDates(athlete: Record<string, unknown>): TrainingPhase {
  const today = new Date().toISOString().slice(0, 10);
  const raceDate: string | null = (athlete.target_race_date as string) ?? null;

  if (!raceDate || raceDate <= today) return 'base';

  const weeksToRace =
    (new Date(raceDate + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) /
    (7 * 24 * 60 * 60 * 1000);

  if (weeksToRace > 16) return 'base';
  if (weeksToRace >= 8)  return 'pre_competition';

  const fitnessRating: number = (athlete.fitness_rating as number) ?? 5;
  const hasPriorContext = !!(athlete.pr_5k || athlete.pr_mile || athlete.pr_1500m || athlete.pr_800m);
  if (fitnessRating <= 5 && !hasPriorContext) return 'ease_in';
  return 'competition';
}

// ── Tier classification ───────────────────────────────────────────────────────

/** Classify athlete into beginner | intermediate | advanced. */
export function classifyAthleteTier(athlete: Record<string, unknown>): AthleteTier {
  const mpw: number           = ((athlete.current_weekly_mileage ?? athlete.weekly_volume_miles ?? 0) as number);
  const fitnessRating: number = ((athlete.fitness_rating ?? 5) as number);
  const exp: string           = ((athlete.experience_level ?? '') as string);
  const hasPRs                = !!(athlete.pr_5k || athlete.pr_mile || athlete.pr_1500m || athlete.pr_800m || athlete.pr_10k);
  const hasAerobicPR          = !!(athlete.pr_5k || athlete.pr_10k || athlete.pr_half_marathon || athlete.pr_marathon);
  const hasEventPR            = !!(athlete.pr_mile || athlete.pr_1500m || athlete.pr_800m);

  // BEGINNER: any of these
  if (
    mpw < 15 ||
    fitnessRating <= 3 ||
    exp === 'beginner' || exp === 'less_than_1_year' ||
    !hasPRs ||
    (!hasAerobicPR && !hasEventPR)
  ) return 'beginner';

  // ADVANCED: all must be true
  if (
    mpw >= 35 &&
    fitnessRating >= 8 &&
    exp === '3_plus_years' &&
    hasPRs
  ) return 'advanced';

  return 'intermediate';
}
