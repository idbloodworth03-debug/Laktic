/**
 * readinessEngine.ts
 * Computes a real readiness score from ATL / CTL / TSB + contextual signals.
 * No external dependencies — pure math on existing DB data.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReadinessSignals {
  atl:                    number;
  ctl:                    number;
  tsb:                    number;
  consecutiveTrainingDays: number;
  daysSinceLastRun:       number;
  recentPaceDeviation:    number | null;
  sleepHours:             number | null;
  complianceRate:         number;
}

export interface ReadinessResult {
  score:          number;
  label:          string;
  color:          string;
  recommendation: string;
  signals:        ReadinessSignals;
  needsMoreData?: boolean;
}

// ── Intensity factors ─────────────────────────────────────────────────────────

function intensityFactor(activityType: string | null, paceStr: string | null): number {
  const t = (activityType ?? '').toLowerCase();

  if (t.includes('easy') || t.includes('recovery') || t === 'run') return 1.0;
  if (t.includes('long'))                                              return 1.2;
  if (t.includes('aerobic') || t.includes('tempo') || t.includes('threshold')) return 1.5;
  if (t.includes('interval') || t.includes('specific') || t.includes('repeat') || t.includes('track')) return 2.0;

  // Classify by pace if type is unknown
  if (paceStr) {
    const secs = parsePaceToSeconds(paceStr);
    if (secs !== null) {
      if (secs > 510)      return 1.0;   // > 8:30/mi → easy
      if (secs >= 420)     return 1.5;   // 7:00-8:30/mi → aerobic
      return 2.0;                        // < 7:00/mi → specific
    }
  }

  return 1.0; // default: easy
}

function parsePaceToSeconds(pace: string): number | null {
  // Handles "7:30", "7:30/mi", "7:30 /mi"
  const match = pace.match(/(\d+):(\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function parseSleepHours(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

// ── Training load ─────────────────────────────────────────────────────────────

interface Activity {
  date:          string;   // YYYY-MM-DD
  distanceMiles: number;
  type:          string | null;
  pace:          string | null;
}

function trainingLoad(a: Activity): number {
  return a.distanceMiles * intensityFactor(a.type, a.pace);
}

function computeATL(activities: Activity[], today: Date): number {
  // 7-day exponential weighted sum, decay = 0.85 per day
  let atl = 0;
  for (const a of activities) {
    const daysAgo = Math.floor((today.getTime() - new Date(a.date + 'T00:00:00Z').getTime()) / 86400000);
    if (daysAgo < 0 || daysAgo > 6) continue;
    atl += trainingLoad(a) * Math.pow(0.85, daysAgo);
  }
  return Math.round(atl * 10) / 10;
}

function computeCTL(activities: Activity[], today: Date): number {
  // 42-day exponential weighted sum, decay = 0.97 per day
  let ctl = 0;
  for (const a of activities) {
    const daysAgo = Math.floor((today.getTime() - new Date(a.date + 'T00:00:00Z').getTime()) / 86400000);
    if (daysAgo < 0 || daysAgo > 41) continue;
    ctl += trainingLoad(a) * Math.pow(0.97, daysAgo);
  }
  return Math.round(ctl * 10) / 10;
}

function computeConsecutiveTrainingDays(activities: Activity[], today: Date): number {
  const activeDates = new Set(activities.map(a => a.date));
  let count = 0;
  for (let d = 0; d < 30; d++) {
    const check = new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);
    if (activeDates.has(check)) count++;
    else if (d > 0) break;
  }
  return count;
}

function computeDaysSinceLastRun(activities: Activity[], today: Date): number {
  if (activities.length === 0) return 999;
  const sorted = [...activities].sort((a, b) => b.date.localeCompare(a.date));
  const last = sorted[0];
  return Math.floor((today.getTime() - new Date(last.date + 'T00:00:00Z').getTime()) / 86400000);
}

function computePaceDeviation(activities: Activity[]): number | null {
  if (activities.length < 3) return null;
  const withPace = activities.filter(a => a.pace && parsePaceToSeconds(a.pace) !== null);
  if (withPace.length < 3) return null;

  // 30-day average pace
  const paces30 = withPace.map(a => parsePaceToSeconds(a.pace!)!);
  const avg30 = paces30.reduce((s, p) => s + p, 0) / paces30.length;

  // Last activity's pace
  const sorted = [...withPace].sort((a, b) => b.date.localeCompare(a.date));
  const lastPace = parsePaceToSeconds(sorted[0].pace!);
  if (!lastPace) return null;

  // % slower (positive = slower = more fatigue)
  return Math.round(((lastPace - avg30) / avg30) * 1000) / 10;
}

// ── Score computation ─────────────────────────────────────────────────────────

function tsbContribution(tsb: number): number {
  if (tsb > 15)         return 30;
  if (tsb > 5)          return 20;
  if (tsb > 0)          return 10;
  if (tsb >= -5)        return 0;
  if (tsb >= -10)       return -10;
  if (tsb >= -20)       return -20;
  return -30;
}

function consecutiveDaysContribution(days: number): number {
  if (days <= 2) return 5;
  if (days <= 4) return 0;
  if (days <= 6) return -10;
  return -15;
}

function paceDeviationContribution(deviation: number | null): number {
  if (deviation === null) return 0;
  if (deviation > 10)   return -10;
  if (deviation >= -5)  return 0;
  return 5;  // faster than average — fresh
}

function sleepContribution(hours: number | null): number {
  if (hours === null) return 0;
  if (hours >= 8)    return 10;
  if (hours >= 7)    return 5;
  if (hours >= 6)    return 0;
  if (hours >= 5)    return -5;
  return -10;
}

function complianceContribution(rate: number): number {
  if (rate > 80)   return 5;
  if (rate >= 60)  return 0;
  return -5;
}

function labelAndRecommendation(score: number, tsb: number): { label: string; color: string; recommendation: string } {
  if (score >= 80) {
    return {
      label: 'High',
      color: 'green',
      recommendation:
        tsb > 10
          ? "You're fresh and well rested. Good day to push the quality session — don't leave anything in the tank."
          : "Readiness is high. Execute today's workout at the top end of your prescribed paces.",
    };
  }
  if (score >= 60) {
    return {
      label: 'Moderate',
      color: 'yellow',
      recommendation: "Your body is absorbing last week's load. Stick to the plan — don't add extra effort today.",
    };
  }
  if (score >= 40) {
    return {
      label: 'Low',
      color: 'red',
      recommendation: "Signs of accumulated fatigue. Complete today's workout at the easy end of your prescribed paces.",
    };
  }
  return {
    label: 'Rest',
    color: 'gray',
    recommendation: "Your body needs recovery. Take a rest day or easy jog only. Pushing through heavy fatigue slows long-term progress.",
  };
}

// ── Compliance calculation ────────────────────────────────────────────────────

async function computeCompliance(athleteId: string, supabase: SupabaseClient): Promise<number> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

    const [{ data: completions }, { data: seasonRow }] = await Promise.all([
      supabase
        .from('workout_completions')
        .select('workout_date')
        .eq('athlete_id', athleteId)
        .gte('workout_date', fourteenDaysAgo)
        .lt('workout_date', today),
      supabase
        .from('athlete_seasons')
        .select('season_plan')
        .eq('athlete_id', athleteId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    const plan: any[] = (seasonRow as any)?.season_plan ?? [];
    let planned = 0;
    let completed = 0;

    const completedDates = new Set((completions ?? []).map((c: any) => c.workout_date as string));

    for (const week of plan) {
      for (const wo of week.workouts ?? []) {
        if (!wo.date || wo.date >= today || wo.date < fourteenDaysAgo) continue;
        if (!wo.distance_miles || wo.distance_miles === 0) continue;
        planned++;
        if (completedDates.has(wo.date)) completed++;
      }
    }

    if (planned === 0) return 70; // no data — assume reasonable
    return Math.round((completed / planned) * 100);
  } catch {
    return 70;
  }
}

// ── Injury detection ──────────────────────────────────────────────────────────

function hasRecentInjuryNote(injuryNotes: string | null | undefined, withinDays = 60): boolean {
  if (!injuryNotes) return false;
  const today = new Date();
  // Notes are stamped like "[2026-04-19] broken ankle..."
  const dateMatches = injuryNotes.matchAll(/\[(\d{4}-\d{2}-\d{2})\]/g);
  for (const m of dateMatches) {
    const noteDate = new Date(m[1] + 'T00:00:00Z');
    const daysAgo = (today.getTime() - noteDate.getTime()) / 86400000;
    if (daysAgo <= withinDays) return true;
  }
  // Fallback: if notes exist but have no date stamps, treat as recent
  return injuryNotes.trim().length > 0;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function computeReadiness(
  athleteId: string,
  supabase:  SupabaseClient,
): Promise<ReadinessResult> {
  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const fortyTwoDaysAgo = new Date(Date.now() - 42 * 86400000).toISOString().slice(0, 10);

  // Fetch activities + athlete profile + today's readiness log in parallel
  const [
    { data: rawActivities },
    { data: athleteProfile },
    { data: todayLog },
    complianceRate,
  ] = await Promise.all([
    supabase
      .from('athlete_activities')
      .select('start_date, activity_type, distance_miles, pace')
      .eq('athlete_id', athleteId)
      .gte('start_date', fortyTwoDaysAgo)
      .order('start_date', { ascending: false }),
    supabase
      .from('athlete_profiles')
      .select('sleep_average, fitness_rating, injury_notes')
      .eq('id', athleteId)
      .single(),
    supabase
      .from('daily_readiness')
      .select('sleep_hours, score')
      .eq('athlete_id', athleteId)
      .eq('date', todayStr)
      .single(),
    computeCompliance(athleteId, supabase),
  ]);

  const activities: Activity[] = (rawActivities ?? []).map((a: any) => ({
    date:          (a.start_date as string).slice(0, 10),
    distanceMiles: Number(a.distance_miles ?? 0),
    type:          (a.activity_type as string | null) ?? null,
    pace:          (a.pace as string | null) ?? null,
  })).filter(a => a.distanceMiles > 0);

  // Not enough data check — fewer than 3 activities in last 14 days
  const recentCount = activities.filter(a => {
    const daysAgo = Math.floor((today.getTime() - new Date(a.date + 'T00:00:00Z').getTime()) / 86400000);
    return daysAgo <= 14;
  }).length;

  const injuryNotes: string | null = (athleteProfile as any)?.injury_notes ?? null;
  const activeInjury = hasRecentInjuryNote(injuryNotes);

  if (recentCount < 3) {
    // Injury overrides everything — score bottoms out regardless of activity data
    if (activeInjury) {
      return {
        score: 10,
        label: 'Injured',
        color: 'red',
        recommendation: 'Active injury on record. No training until medically cleared. Follow your healthcare provider\'s guidance.',
        signals: {
          atl: 0, ctl: 0, tsb: 0,
          consecutiveTrainingDays: 0, daysSinceLastRun: 999,
          recentPaceDeviation: null, sleepHours: null, complianceRate,
        },
      };
    }

    // Fall back to today's subjective log score if available, otherwise 50 (not 70 — no data is unknown, not moderate)
    const logScore: number | null = (todayLog as any)?.score ?? null;
    const fallback = logScore !== null ? logScore : 50;
    const { label, color, recommendation } = labelAndRecommendation(fallback, 0);
    return {
      score: fallback,
      label,
      color,
      recommendation: logScore !== null
        ? recommendation
        : 'Connect Strava or log some activities to get an accurate readiness score.',
      signals: {
        atl: 0, ctl: 0, tsb: 0,
        consecutiveTrainingDays: 0, daysSinceLastRun: 999,
        recentPaceDeviation: null, sleepHours: null, complianceRate,
      },
      needsMoreData: logScore === null,
    };
  }

  // Compute load signals
  const atl = computeATL(activities, today);
  const ctl = computeCTL(activities, today);
  const tsb = Math.round((ctl - atl) * 10) / 10;

  const consecutiveTrainingDays = computeConsecutiveTrainingDays(activities, today);
  const daysSinceLastRun        = computeDaysSinceLastRun(activities, today);
  const recentPaceDeviation     = computePaceDeviation(activities);

  // Sleep: prefer today's log, fall back to profile average
  const sleepFromLog     = (todayLog as any)?.sleep_hours ?? null;
  const sleepFromProfile = parseSleepHours((athleteProfile as any)?.sleep_average ?? null);
  const sleepHours       = sleepFromLog ?? sleepFromProfile;

  // Score
  let score = 70;
  score += tsbContribution(tsb);
  score += consecutiveDaysContribution(consecutiveTrainingDays);
  score += paceDeviationContribution(recentPaceDeviation);
  score += sleepContribution(sleepHours);
  score += complianceContribution(complianceRate);

  // Apply subjective override from today's log if present (±5 points)
  if (todayLog && typeof (todayLog as any).score === 'number') {
    const subjectiveScore = (todayLog as any).score as number;
    const subjectiveAdj = Math.round(((subjectiveScore - 50) / 50) * 5);
    score += subjectiveAdj;
  }

  score = Math.min(100, Math.max(0, score));

  // Injury override — cap score at 15 and force injured label regardless of math
  if (activeInjury) {
    return {
      score: Math.min(score, 15),
      label: 'Injured',
      color: 'red',
      recommendation: 'Active injury on record. No training until medically cleared. Talk to Pace for plan adjustments.',
      signals: {
        atl, ctl, tsb,
        consecutiveTrainingDays,
        daysSinceLastRun,
        recentPaceDeviation,
        sleepHours,
        complianceRate,
      },
    };
  }

  const { label, color, recommendation } = labelAndRecommendation(score, tsb);

  return {
    score,
    label,
    color,
    recommendation,
    signals: {
      atl,
      ctl,
      tsb,
      consecutiveTrainingDays,
      daysSinceLastRun,
      recentPaceDeviation,
      sleepHours,
      complianceRate,
    },
  };
}
