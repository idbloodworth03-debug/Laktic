/**
 * performancePredictions.ts
 * Race time prediction engine using Riegel formula + training progression multipliers.
 * Exports: predictRaceTime, getPredictionTrend, getWorkoutImpactPrediction
 */

import { parseTimeToSeconds, secondsToMmSs, classifyAthleteTier } from './athleteTier';

// ── Distance registry (meters) ────────────────────────────────────────────────
export const RACE_DISTANCES_M: Record<string, number> = {
  '800m':     800,
  '1500m':    1500,
  'mile':     1609.344,
  '5K':       5000,
  '10K':      10000,
  'half':     21097.5,
  'marathon': 42195,
};

// Canonical display labels
export const DISTANCE_LABELS: Record<string, string> = {
  '800m':     '800m',
  '1500m':    '1500m',
  'mile':     'Mile',
  '5K':       '5K',
  '10K':      '10K',
  'half':     'Half Marathon',
  'marathon': 'Marathon',
};

// PR field on athlete profile for each distance
const DISTANCE_PR_FIELD: Record<string, string> = {
  '800m':     'pr_800m',
  '1500m':    'pr_1500m',
  'mile':     'pr_mile',
  '5K':       'pr_5k',
  '10K':      'pr_10k',
  'half':     'pr_half_marathon',
  'marathon': 'pr_marathon',
};

// ── Riegel formula ────────────────────────────────────────────────────────────
/** T2 = T1 × (D2 / D1) ^ 1.06 */
function riegelPredict(t1Secs: number, d1M: number, d2M: number): number {
  return t1Secs * Math.pow(d2M / d1M, 1.06);
}

/** Format seconds → "m:ss" or "h:mm:ss" */
function fmtTime(secs: number): string {
  const s = Math.round(secs);
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return secondsToMmSs(s);
}

// ── Best source PR for Riegel ─────────────────────────────────────────────────
interface SourcePR {
  secs: number;
  distM: number;
  label: string;
}

function getBestSourcePR(athlete: any, targetDistM: number): SourcePR | null {
  const candidates: { field: string; distM: number; label: string }[] = [
    { field: 'pr_800m',        distM: 800,     label: '800m' },
    { field: 'pr_1500m',       distM: 1500,    label: '1500m' },
    { field: 'pr_mile',        distM: 1609.34, label: 'Mile' },
    { field: 'pr_5k',          distM: 5000,    label: '5K' },
    { field: 'pr_10k',         distM: 10000,   label: '10K' },
    { field: 'pr_half_marathon', distM: 21097.5, label: 'Half' },
    { field: 'pr_marathon',    distM: 42195,   label: 'Marathon' },
  ].filter(c => athlete[c.field]);

  if (candidates.length === 0) return null;

  // Prefer the PR closest in distance to the target (smallest ratio diff)
  candidates.sort((a, b) => {
    const ra = Math.abs(Math.log(a.distM / targetDistM));
    const rb = Math.abs(Math.log(b.distM / targetDistM));
    return ra - rb;
  });

  const best = candidates[0];
  const secs = parseTimeToSeconds(athlete[best.field]);
  if (!secs) return null;
  return { secs, distM: best.distM, label: `${best.label} PR of ${athlete[best.field]}` };
}

// ── Base improvement rate (per 4 weeks) by tier ───────────────────────────────
function baseImprovementRate(tier: string): number {
  if (tier === 'beginner') return 0.015;
  if (tier === 'advanced') return 0.004;
  return 0.008; // intermediate
}

// ── Phase improvement modifier ────────────────────────────────────────────────
function phaseModifier(phase: string): number {
  if (phase === 'ease_in') return 0.0;
  if (phase === 'base') return 0.6;
  if (phase === 'pre_competition') return 1.0;
  if (phase === 'competition') return 1.2;
  return 0.6;
}

// ── Compliance modifier ───────────────────────────────────────────────────────
function complianceModifier(complianceRate: number): number {
  if (complianceRate >= 90) return 1.0;
  if (complianceRate >= 70) return 0.7;
  if (complianceRate >= 50) return 0.4;
  return 0.0;
}

// ── Derive phase from weeks to race ──────────────────────────────────────────
function phaseFromWeeksToRace(wtr: number): string {
  if (wtr > 16) return 'base';
  if (wtr >= 8) return 'pre_competition';
  if (wtr > 0) return 'competition';
  return 'competition';
}

// ── Compute total improvement multiplier ─────────────────────────────────────
/**
 * Returns the fractional improvement over weeksOfTraining weeks.
 * Applied as: predictedTime × (1 - totalImprovement)
 */
function totalImprovementFraction(
  tier: string,
  phase: string,
  weeksOfTraining: number,
  complianceRate: number
): number {
  const periods = weeksOfTraining / 4; // number of 4-week cycles
  const perCycle = baseImprovementRate(tier)
    * phaseModifier(phase)
    * complianceModifier(complianceRate);
  return Math.min(perCycle * periods, 0.12); // cap at 12% improvement
}

// ── Confidence level ──────────────────────────────────────────────────────────
function confidenceLevel(
  athlete: any,
  targetDistance: string,
  loggedWeeks: number
): 'low' | 'medium' | 'high' {
  const hasExactPR = !!athlete[DISTANCE_PR_FIELD[targetDistance] ?? ''];
  const hasAerobicPR = !!(athlete.pr_5k || athlete.pr_10k || athlete.pr_half_marathon || athlete.pr_marathon);
  const hasEventPR = !!(athlete.pr_800m || athlete.pr_1500m || athlete.pr_mile);
  const enoughData = loggedWeeks >= 4;

  if (hasExactPR && hasAerobicPR && enoughData) return 'high';
  if ((hasAerobicPR || hasEventPR) && enoughData) return 'medium';
  if (hasAerobicPR || hasEventPR) return 'medium';
  return 'low';
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface RacePrediction {
  targetDistance: string;
  currentPrediction: string;
  raceWeekPrediction: string;
  potentialPR: string;
  confidenceLevel: 'low' | 'medium' | 'high';
  basedOn: string;
  weeksToImprovement: number;
  needsMoreData: boolean;
  complianceWarning: boolean;
}

export interface PredictionTrendPoint {
  week: number;
  prediction: string;
  predictionSecs: number;
  phase: string;
}

export interface WorkoutImpact {
  workoutName: string;
  primaryBenefit: string;
  estimatedContribution: string;
  weeklyImpact: string;
}

/**
 * Predict race time for a target distance.
 * @param athlete         Athlete profile object (from athlete_profiles)
 * @param targetDistance  One of: '800m' | '1500m' | 'mile' | '5K' | '10K' | 'half' | 'marathon'
 * @param weeksOfTraining Weeks of training completed so far in the current plan
 * @param complianceRate  Percentage 0-100 of planned workouts completed
 * @param weeksToRace     Weeks remaining until goal race (null = no race set)
 * @param loggedWeeks     Weeks of activity data available (for confidence)
 */
export function predictRaceTime(
  athlete: any,
  targetDistance: string,
  weeksOfTraining: number,
  complianceRate: number,
  weeksToRace: number | null = null,
  loggedWeeks: number = 0
): RacePrediction {
  const targetDistM = RACE_DISTANCES_M[targetDistance];
  if (!targetDistM) {
    return {
      targetDistance,
      currentPrediction: '--',
      raceWeekPrediction: '--',
      potentialPR: '--',
      confidenceLevel: 'low',
      basedOn: 'unknown distance',
      weeksToImprovement: 0,
      needsMoreData: true,
      complianceWarning: false,
    };
  }

  const source = getBestSourcePR(athlete, targetDistM);
  if (!source) {
    return {
      targetDistance,
      currentPrediction: '--',
      raceWeekPrediction: '--',
      potentialPR: '--',
      confidenceLevel: 'low',
      basedOn: 'no PR data',
      weeksToImprovement: 0,
      needsMoreData: true,
      complianceWarning: false,
    };
  }

  const tier = classifyAthleteTier(athlete);
  const today = new Date().toISOString().slice(0, 10);
  const raceDate: string | null = athlete.target_race_date ?? null;
  const wtr = weeksToRace ??
    (raceDate && raceDate > today
      ? Math.ceil((new Date(raceDate + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / (7 * 24 * 60 * 60 * 1000))
      : null);

  // Phase based on weeks to race (or athlete's current phase)
  const currentPhase = wtr != null ? phaseFromWeeksToRace(wtr) : 'base';

  // Base prediction from Riegel
  const basePredSecs = riegelPredict(source.secs, source.distM, targetDistM);

  // Current prediction (accounting for completed training)
  const currentImprovement = totalImprovementFraction(tier, currentPhase, weeksOfTraining, complianceRate);
  const currentSecs = basePredSecs * (1 - currentImprovement);

  // Race-week prediction (full training block completed)
  const totalWeeks = wtr ?? 12;
  const racePhase = wtr != null ? phaseFromWeeksToRace(Math.min(wtr, 2)) : 'competition';
  const raceWeekImprovement = totalImprovementFraction(tier, racePhase, totalWeeks, complianceRate);
  const raceWeekSecs = basePredSecs * (1 - raceWeekImprovement);

  // Potential PR (if compliance stays 90%+)
  const potentialImprovement = totalImprovementFraction(tier, 'competition', totalWeeks, 95);
  const potentialSecs = basePredSecs * (1 - potentialImprovement);

  const conf = confidenceLevel(athlete, targetDistance, loggedWeeks);
  const weeksToImprovement = wtr ?? Math.ceil(totalWeeks * 0.75);

  return {
    targetDistance,
    currentPrediction: fmtTime(currentSecs),
    raceWeekPrediction: fmtTime(raceWeekSecs),
    potentialPR: fmtTime(potentialSecs),
    confidenceLevel: conf,
    basedOn: source.label,
    weeksToImprovement,
    needsMoreData: conf === 'low',
    complianceWarning: complianceRate < 70 && complianceRate > 0,
  };
}

/**
 * Returns a sparse trend array from now to race day showing predicted improvement.
 */
export function getPredictionTrend(
  athlete: any,
  targetDistance: string,
  weeksOfTraining: number,
  complianceRate: number,
  weeksToRace: number
): PredictionTrendPoint[] {
  const targetDistM = RACE_DISTANCES_M[targetDistance];
  if (!targetDistM) return [];

  const source = getBestSourcePR(athlete, targetDistM);
  if (!source) return [];

  const tier = classifyAthleteTier(athlete);
  const basePredSecs = riegelPredict(source.secs, source.distM, targetDistM);

  // Generate 5 checkpoints
  const totalWeeks = Math.max(weeksToRace, 4);
  const checkpoints = [0, Math.floor(totalWeeks * 0.25), Math.floor(totalWeeks * 0.5), Math.floor(totalWeeks * 0.75), totalWeeks];
  const uniqueCheckpoints = [...new Set(checkpoints)];

  return uniqueCheckpoints.map(week => {
    const weeksRemaining = Math.max(totalWeeks - week, 0);
    const phase = phaseFromWeeksToRace(weeksRemaining);
    const completedWeeks = weeksOfTraining + week;
    const improvement = totalImprovementFraction(tier, phase, completedWeeks, complianceRate);
    const predSecs = basePredSecs * (1 - improvement);
    return { week, prediction: fmtTime(predSecs), predictionSecs: Math.round(predSecs), phase };
  });
}

/**
 * Describe what completing a specific workout type contributes to race performance.
 */
export function getWorkoutImpactPrediction(
  workout: { title?: string; type?: string; pace_guideline?: string },
  athlete: any,
  raceWeekPrediction: string
): WorkoutImpact {
  const title = workout.title || 'Workout';
  const type = (workout.type || '').toLowerCase();
  const raceTarget = athlete.target_race_distance || '1500m';

  if (type === 'aerobic' || /tempo|threshold|progressive/i.test(title)) {
    return {
      workoutName: title,
      primaryBenefit: 'LT2/LT1 development',
      estimatedContribution: `Builds the aerobic base that supports ${raceWeekPrediction} at race week`,
      weeklyImpact: 'Each threshold session at this fitness adds ~0.3% to aerobic capacity',
    };
  }
  if (type === 'specific' || type === 'bridge' || /interval|repeat|track|speed|300|400|800/i.test(title)) {
    return {
      workoutName: title,
      primaryBenefit: 'Race-pace neuromuscular adaptation',
      estimatedContribution: `Sharpens ${raceTarget} race feel — projected ${raceWeekPrediction} requires this pace fluency`,
      weeklyImpact: 'Race-pace exposures reduce perceived effort at goal pace by ~2-3% over 4 weeks',
    };
  }
  if (type === 'long_run' || /long run/i.test(title)) {
    return {
      workoutName: title,
      primaryBenefit: 'Aerobic endurance foundation',
      estimatedContribution: `Long aerobic runs underpin all pacing — essential for holding ${raceWeekPrediction} under pressure`,
      weeklyImpact: 'Consistent long runs improve mitochondrial density and fat utilization over time',
    };
  }
  if (type === 'speed_dev' || /stride|hill sprint|form/i.test(title)) {
    return {
      workoutName: title,
      primaryBenefit: 'Neuromuscular speed and economy',
      estimatedContribution: `Speed development improves running economy — each stride adds ~0.2% efficiency toward ${raceWeekPrediction}`,
      weeklyImpact: 'Strides and hill sprints maintain fast-twitch recruitment without adding training stress',
    };
  }
  // easy / recovery / default
  return {
    workoutName: title,
    primaryBenefit: 'Recovery and aerobic base',
    estimatedContribution: `Consistent easy running is the foundation — without it, ${raceWeekPrediction} is unreachable`,
    weeklyImpact: 'Easy miles build the aerobic base that allows harder sessions to adapt',
  };
}
