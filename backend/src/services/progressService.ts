import { supabase } from '../db/supabase';

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

/** Convert distance in meters and time in seconds to a "M:SS" pace-per-mile string */
export function calculatePacePerMile(distanceMeters: number, timeSeconds: number): string {
  if (!distanceMeters || distanceMeters === 0) return '--';
  const miles = distanceMeters / METERS_PER_MILE;
  const secondsPerMile = timeSeconds / miles;
  const mins = Math.floor(secondsPerMile / 60);
  const secs = Math.round(secondsPerMile % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Get the Monday (week start) for a given date */
function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().split('T')[0];
}

/** Compute weekly summary for a single week from athlete_activities */
export async function computeWeeklySummary(
  athleteId: string,
  weekStart: string
): Promise<any> {
  const weekEnd = new Date(weekStart + 'T00:00:00Z');
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekEndStr = weekEnd.toISOString();

  // Fetch running activities for the week
  const { data: activities } = await supabase
    .from('athlete_activities')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('start_date', weekStart + 'T00:00:00Z')
    .lt('start_date', weekEndStr)
    .in('activity_type', ['Run', 'TrailRun', 'VirtualRun', 'Treadmill']);

  const runs = activities || [];

  if (runs.length === 0) {
    return {
      athlete_id: athleteId,
      week_start: weekStart,
      total_distance_miles: 0,
      total_duration_minutes: 0,
      total_elevation_feet: 0,
      run_count: 0,
      avg_pace_per_mile: '--',
      avg_heartrate: null,
      longest_run_miles: 0,
      intensity_score: null,
      compliance_pct: null
    };
  }

  const totalDistanceMeters = runs.reduce((s: number, r: any) => s + (r.distance_meters || 0), 0);
  const totalTimeSeconds = runs.reduce((s: number, r: any) => s + (r.moving_time_seconds || 0), 0);
  const totalElevationMeters = runs.reduce((s: number, r: any) => s + (r.total_elevation_gain || 0), 0);

  const hrRuns = runs.filter((r: any) => r.average_heartrate);
  const avgHr = hrRuns.length > 0
    ? hrRuns.reduce((s: number, r: any) => s + r.average_heartrate, 0) / hrRuns.length
    : null;

  const longestMeters = Math.max(...runs.map((r: any) => r.distance_meters || 0));

  // Simple intensity: average perceived exertion weighted by distance, fallback to HR zone proxy
  const exertionRuns = runs.filter((r: any) => r.perceived_exertion);
  let intensityScore: number | null = null;
  if (exertionRuns.length > 0) {
    intensityScore = exertionRuns.reduce((s: number, r: any) => s + r.perceived_exertion, 0) / exertionRuns.length;
  } else if (avgHr) {
    // rough proxy: HR / 20 gives ~7-10 range for typical running HR 140-200
    intensityScore = Math.round((avgHr / 20) * 10) / 10;
  }

  const summary = {
    athlete_id: athleteId,
    week_start: weekStart,
    total_distance_miles: Math.round((totalDistanceMeters / METERS_PER_MILE) * 100) / 100,
    total_duration_minutes: Math.round((totalTimeSeconds / 60) * 100) / 100,
    total_elevation_feet: Math.round(totalElevationMeters * FEET_PER_METER),
    run_count: runs.length,
    avg_pace_per_mile: calculatePacePerMile(totalDistanceMeters, totalTimeSeconds),
    avg_heartrate: avgHr ? Math.round(avgHr) : null,
    longest_run_miles: Math.round((longestMeters / METERS_PER_MILE) * 100) / 100,
    intensity_score: intensityScore,
    compliance_pct: null // computed separately if season plan exists
  };

  return summary;
}

/** Compute weekly summaries for the last N weeks, upsert to DB */
export async function computeAllWeeks(
  athleteId: string,
  weeks = 12
): Promise<any[]> {
  const now = new Date();
  const currentMonday = getMonday(now);
  const summaries: any[] = [];

  for (let i = 0; i < weeks; i++) {
    const weekDate = new Date(currentMonday + 'T00:00:00Z');
    weekDate.setUTCDate(weekDate.getUTCDate() - i * 7);
    const weekStart = weekDate.toISOString().split('T')[0];

    const summary = await computeWeeklySummary(athleteId, weekStart);

    // Compute compliance if there's a season plan
    const compliance = await getComplianceRate(athleteId, weekStart);
    summary.compliance_pct = compliance;

    // Upsert
    const { data, error } = await supabase
      .from('weekly_summaries')
      .upsert(summary, { onConflict: 'athlete_id,week_start' })
      .select()
      .single();

    summaries.push(data || summary);
    if (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to upsert weekly summary for ${weekStart}:`, error.message);
    }
  }

  return summaries.reverse(); // oldest first
}

/** Compare planned vs actual workouts for a given week */
export async function getComplianceRate(
  athleteId: string,
  weekStart: string
): Promise<number | null> {
  // Get active season plan
  const { data: season } = await supabase
    .from('athlete_seasons')
    .select('season_plan')
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .single();

  if (!season?.season_plan) return null;

  // Find the week in the season plan that matches weekStart
  const plan = season.season_plan as any[];
  const planWeek = plan.find((w: any) => w.week_start === weekStart);
  if (!planWeek?.workouts) return null;

  const plannedRuns = planWeek.workouts.filter(
    (w: any) => w.title && w.title.toLowerCase() !== 'rest' && w.title.toLowerCase() !== 'off'
  ).length;

  if (plannedRuns === 0) return 100;

  // Count actual runs in the week
  const weekEnd = new Date(weekStart + 'T00:00:00Z');
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const { count } = await supabase
    .from('athlete_activities')
    .select('id', { count: 'exact', head: true })
    .eq('athlete_id', athleteId)
    .gte('start_date', weekStart + 'T00:00:00Z')
    .lt('start_date', weekEnd.toISOString())
    .in('activity_type', ['Run', 'TrailRun', 'VirtualRun', 'Treadmill']);

  const actualRuns = count || 0;
  return Math.min(100, Math.round((actualRuns / plannedRuns) * 100));
}
