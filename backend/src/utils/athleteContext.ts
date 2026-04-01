import { supabase } from '../db/supabase';
import { getFormattedKnowledge } from '../services/knowledgeService';

export interface AthleteContext {
  profile: any;
  coachBot: any | null;
  coachKnowledge: string;
  activeSeason: { id: string; season_plan: any[]; race_calendar: any[]; bot_id: string } | null;
  currentWeek: any | null;
  daysUntilRace: number | null;
  upcomingRaces: any[];
  recentActivities: any[];
  missedWorkouts: any[];
  readinessHistory: any[];
  todayReadiness: any | null;
  weeklyMileage: number;
}

export async function loadAthleteContext(
  athleteId: string,
  _teamId: string | null
): Promise<AthleteContext> {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: seasonRow },
    { data: recentActivities },
    { data: readinessHistory },
    { data: todayReadiness },
  ] = await Promise.all([
    supabase.from('athlete_profiles').select('*').eq('id', athleteId).single(),
    supabase
      .from('athlete_seasons')
      .select('id, season_plan, race_calendar, bot_id, coach_bots!bot_id(*)')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('athlete_activities')
      .select('id, start_date, activity_type, name, distance_miles, duration, pace')
      .eq('athlete_id', athleteId)
      .gte('start_date', thirtyDaysAgo)
      .order('start_date', { ascending: false })
      .limit(20),
    supabase
      .from('daily_readiness')
      .select('date, score, label, recommended_intensity, sleep_hours, soreness, energy, notes')
      .eq('athlete_id', athleteId)
      .gte('date', sevenDaysAgo)
      .order('date', { ascending: false })
      .limit(7),
    supabase
      .from('daily_readiness')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('date', today)
      .single(),
  ]);

  const activeSeason = seasonRow
    ? {
        id: seasonRow.id,
        season_plan: seasonRow.season_plan || [],
        race_calendar: seasonRow.race_calendar || [],
        bot_id: seasonRow.bot_id,
      }
    : null;

  const coachBot = seasonRow ? (seasonRow as any).coach_bots : null;
  const coachKnowledge = coachBot ? await getFormattedKnowledge(coachBot.id) : '';

  const plan: any[] = activeSeason?.season_plan || [];

  // Current week — find the week whose date range contains today
  const currentWeek =
    plan.find((w: any) => {
      if (!w.week_start_date) return false;
      const weekEnd =
        w.week_end_date ||
        new Date(new Date(w.week_start_date + 'T00:00:00Z').getTime() + 6 * 86400000)
          .toISOString()
          .slice(0, 10);
      return today >= w.week_start_date && today <= weekEnd;
    }) ?? (plan.length > 0 ? plan[0] : null);

  // Upcoming races
  const upcomingRaces = (activeSeason?.race_calendar || [])
    .filter((r: any) => r.date >= today)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  const nextRace = upcomingRaces[0];
  const daysUntilRace = nextRace
    ? Math.ceil(
        (new Date(nextRace.date + 'T00:00:00Z').getTime() -
          new Date(today + 'T00:00:00Z').getTime()) /
          86400000
      )
    : null;

  // Missed workouts — planned in the last 14 days with distance > 0 but no recorded activity
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const missedWorkouts: any[] = [];
  for (const week of plan) {
    for (const wo of week.workouts || []) {
      if (!wo.date || wo.date >= today || wo.date < twoWeeksAgo) continue;
      if (!wo.distance_miles || wo.distance_miles === 0) continue;
      const hasActivity = (recentActivities || []).some(
        (a: any) => (a.start_date || '').slice(0, 10) === wo.date
      );
      if (!hasActivity) missedWorkouts.push({ ...wo, week_number: week.week_number });
    }
  }

  // Current week mileage from recorded activities
  const weekStart = currentWeek?.week_start_date || today;
  const weeklyMileage = (recentActivities || [])
    .filter((a: any) => (a.start_date || '').slice(0, 10) >= weekStart)
    .reduce((sum: number, a: any) => sum + (a.distance_miles || 0), 0);

  return {
    profile: profile || {},
    coachBot,
    coachKnowledge,
    activeSeason,
    currentWeek,
    daysUntilRace,
    upcomingRaces,
    recentActivities: recentActivities || [],
    missedWorkouts,
    readinessHistory: readinessHistory || [],
    todayReadiness: todayReadiness || null,
    weeklyMileage,
  };
}

/** Format AthleteContext into a dense text block for the system prompt */
export function formatContextForPrompt(ctx: AthleteContext): string {
  const today = new Date().toISOString().slice(0, 10);
  const ap = ctx.profile;

  // Build PRs line
  const prs = [
    ap.pr_800m ? `800m ${ap.pr_800m}` : null,
    ap.pr_mile ? `Mile ${ap.pr_mile}` : null,
    ap.pr_5k ? `5K ${ap.pr_5k}` : null,
    ap.pr_10k ? `10K ${ap.pr_10k}` : null,
    ap.pr_half_marathon ? `Half ${ap.pr_half_marathon}` : null,
    ap.pr_marathon ? `Full ${ap.pr_marathon}` : null,
  ].filter(Boolean).join(' | ') || 'none recorded';

  // Build goal race line
  const goalRaceLine = ap.has_target_race && ap.target_race_name
    ? `${ap.target_race_name}${ap.target_race_date ? ` on ${ap.target_race_date}` : ''}${ap.target_race_distance ? ` (${ap.target_race_distance})` : ''}${ap.goal_time ? ` — goal time ${ap.goal_time}` : ''}`
    : 'none';

  // Build biggest challenges
  const challenges = Array.isArray(ap.biggest_challenges) && ap.biggest_challenges.length > 0
    ? ap.biggest_challenges.join(', ')
    : ap.biggest_challenge || 'not specified';

  // Build runner types
  const runnerTypes = Array.isArray(ap.runner_types) && ap.runner_types.length > 0
    ? ap.runner_types.join(', ')
    : ap.primary_goal || 'not specified';

  const athleteProfile = [
    `ATHLETE PROFILE:`,
    `- Name: ${ap.name || 'unknown'}${ap.age ? `, Age: ${ap.age}` : ''}${ap.gender ? `, Gender: ${ap.gender}` : ''}`,
    `- Running experience: ${ap.experience_level || 'not specified'}`,
    `- Runner type: ${runnerTypes}`,
    `- Distances: ${(ap.primary_events || []).join(', ') || 'not specified'}`,
    `- Season: ${ap.fitness_level || 'not specified'}`,
    `- Training days/week: ${ap.training_days_per_week ?? 'not specified'}`,
    `- Current weekly mileage: ${ap.current_weekly_mileage ?? ap.weekly_volume_miles ?? 'unknown'} miles`,
    ap.fitness_rating ? `- Self-rated fitness: ${ap.fitness_rating}/10` : null,
    `- PRs: ${prs}`,
    (ap.height_ft || ap.height_in || ap.weight_lbs) ? `- Height: ${ap.height_ft ?? '?'}ft ${ap.height_in ?? '?'}in | Weight: ${ap.weight_lbs ?? '?'} lbs` : null,
    ap.sleep_average ? `- Avg sleep: ${ap.sleep_average}` : null,
    ap.injury_notes ? `- Injuries/limitations: ${ap.injury_notes}` : null,
    `- Goal race: ${goalRaceLine}`,
    `- Biggest challenges: ${challenges}`,
  ].filter(Boolean).join('\n');

  const profileLines = [
    `Name: ${ap.name}`,
    ap.experience_level ? `Experience: ${ap.experience_level}` : null,
    `Weekly volume: ${ap.current_weekly_mileage ?? ap.weekly_volume_miles ?? 'unknown'} mi/wk`,
    ap.long_run_distance ? `Long run: ${ap.long_run_distance} mi` : null,
    `Events: ${(ap.primary_events || []).join(', ') || 'N/A'}`,
    ap.pr_mile ? `PR Mile: ${ap.pr_mile}` : null,
    ap.pr_5k ? `PR 5K: ${ap.pr_5k}` : null,
    ap.pr_10k ? `PR 10K: ${ap.pr_10k}` : null,
    ap.pr_half_marathon ? `PR Half: ${ap.pr_half_marathon}` : null,
    ap.pr_marathon ? `PR Marathon: ${ap.pr_marathon}` : null,
    ap.injury_notes ? `Injury notes: ${ap.injury_notes}` : null,
    ap.fitness_level ? `Fitness level: ${ap.fitness_level}` : null,
    ap.primary_goal ? `Goal: ${ap.primary_goal}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const nextRaceLine = ctx.upcomingRaces[0]
    ? `Next race: ${ctx.upcomingRaces[0].name || ctx.upcomingRaces[0].race_name || 'Race'} on ${ctx.upcomingRaces[0].date} (${ctx.daysUntilRace} days away)`
    : 'No upcoming races';

  const weekMilesLine = `This week so far: ${Math.round(ctx.weeklyMileage * 10) / 10} mi`;

  const currentWeekBlock = ctx.currentWeek
    ? `CURRENT WEEK (Week ${ctx.currentWeek.week_number}, starts ${ctx.currentWeek.week_start_date}, phase: ${ctx.currentWeek.phase}):\n` +
      (ctx.currentWeek.workouts || [])
        .map(
          (wo: any) =>
            `  ${wo.date} (Day ${wo.day_of_week}): ${wo.title} — ${wo.distance_miles ?? 0} mi ${wo.pace_guideline ? '@ ' + wo.pace_guideline : ''}${wo.is_rest_day ? ' [REST]' : ''}`
        )
        .join('\n')
    : 'No current week in plan';

  const activitiesBlock =
    ctx.recentActivities.length > 0
      ? 'RECENT ACTIVITIES (last 30 days):\n' +
        ctx.recentActivities
          .slice(0, 15)
          .map(
            (a: any) =>
              `  ${(a.start_date || '').slice(0, 10)}: ${a.activity_type || 'Run'} ${a.distance_miles ? a.distance_miles + ' mi' : ''} ${a.pace ? '@ ' + a.pace + '/mi' : ''}`
          )
          .join('\n')
      : 'No recent activities recorded';

  const missedBlock =
    ctx.missedWorkouts.length > 0
      ? 'MISSED WORKOUTS (last 14 days, no activity recorded):\n' +
        ctx.missedWorkouts.map((wo: any) => `  ${wo.date}: ${wo.title} (${wo.distance_miles} mi)`).join('\n')
      : '';

  const readinessBlock = ctx.todayReadiness
    ? `TODAY'S READINESS: ${ctx.todayReadiness.score}/100 — ${ctx.todayReadiness.label} (Recommended: ${ctx.todayReadiness.recommended_intensity ?? 'moderate'})`
    : 'No readiness logged today';

  const readinessHistoryBlock =
    ctx.readinessHistory.length > 1
      ? 'READINESS HISTORY (last 7 days):\n' +
        ctx.readinessHistory
          .map((r: any) => `  ${r.date}: ${r.score}/100 — ${r.label}`)
          .join('\n')
      : '';

  return [
    `TODAY: ${today}`,
    athleteProfile,
    `ATHLETE: ${profileLines}`,
    nextRaceLine,
    weekMilesLine,
    '',
    currentWeekBlock,
    '',
    activitiesBlock,
    missedBlock ? '\n' + missedBlock : '',
    '',
    readinessBlock,
    readinessHistoryBlock ? '\n' + readinessHistoryBlock : '',
  ]
    .filter((s) => s !== null && s !== undefined)
    .join('\n')
    .trim();
}
