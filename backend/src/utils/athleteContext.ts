import { supabase } from '../db/supabase';
import { getFormattedKnowledge } from '../services/knowledgeService';

/** Derive current training phase from race calendar */
export function derivePhase(upcomingRaces: any[]): string {
  if (!upcomingRaces || upcomingRaces.length === 0) return 'base';
  const today = new Date().toISOString().slice(0, 10);
  const next = upcomingRaces.find((r: any) => r.date >= today);
  if (!next) return 'base';
  const daysAway = Math.ceil(
    (new Date(next.date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000
  );
  if (daysAway < 42) return 'competition';       // < 6 weeks
  if (daysAway < 84) return 'pre_competition';   // 6–12 weeks
  return 'base';                                  // > 12 weeks
}

/** True if the athlete competes primarily in track/middle-distance events */
export function isTrackEventAthlete(profile: any): boolean {
  const events: string[] = Array.isArray(profile?.primary_events) ? profile.primary_events : [];
  return events.some((e: string) =>
    /800m?|1[,.]?500m?|1500|mile/i.test(e)
  );
}

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
  persistentMemories: string[];
  conversationSummaries: string[];
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
    { data: persistentMemoriesRaw },
    { data: conversationSummariesRaw },
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
    supabase
      .from('bot_memory')
      .select('memory_text')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('conversation_summaries')
      .select('summary_text')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(3),
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

  const persistentMemories = (persistentMemoriesRaw || []).map((r: any) => r.memory_text as string);
  const conversationSummaries = (conversationSummariesRaw || []).map((r: any) => r.summary_text as string);

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[athleteContext] athlete=${athleteId} memories=${persistentMemories.length} summaries=${conversationSummaries.length}`
    );
  }

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
    persistentMemories,
    conversationSummaries,
  };
}

/** Format AthleteContext into a dense text block for the system prompt */
export function formatContextForPrompt(ctx: AthleteContext): string {
  const today = new Date().toISOString().slice(0, 10);
  const ap = ctx.profile;

  // Build PRs line
  const prs = [
    ap.pr_800m ? `800m ${ap.pr_800m}` : null,
    ap.pr_1500m ? `1500m ${ap.pr_1500m}` : null,
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

  const memoryLines: string[] = [];
  if (ctx.persistentMemories.length > 0 || ctx.conversationSummaries.length > 0) {
    memoryLines.push('What Pace remembers about this athlete:');
    for (const m of ctx.persistentMemories) {
      memoryLines.push(`- ${m}`);
    }
    if (ctx.conversationSummaries.length > 0) {
      memoryLines.push('');
      memoryLines.push('Recent session summaries:');
      for (const s of ctx.conversationSummaries) {
        memoryLines.push(`- ${s}`);
      }
    }
  }
  const memoryBlock = memoryLines.join('\n');

  // Training phase context — always injected for every athlete
  const phase = derivePhase(ctx.upcomingRaces);
  const phaseLabels: Record<string, string> = {
    ease_in: 'Ease-In',
    base: 'Base',
    pre_competition: 'Pre-Competition',
    competition: 'Competition',
  };
  const phaseLabel = phaseLabels[phase] || phase;
  const fitnessLevel = ap.fitness_level || ap.experience_level || 'intermediate';
  const mpw = ap.current_weekly_mileage ?? ap.weekly_volume_miles ?? 0;
  const hasTrackEvents = isTrackEventAthlete(ap);
  const hasAerobicPRs = !!(ap.pr_5k || ap.pr_10k || ap.pr_half_marathon || ap.pr_marathon);

  const phaseLines: (string | null)[] = [
    'TRAINING PHASE CONTEXT:',
    `- Current phase: ${phaseLabel} (${phase})`,
    `- Fitness level: ${fitnessLevel}`,
    `- Weekly volume: ${mpw} mpw`,
    `- Training days/week: ${ap.training_days_per_week ?? 'not specified'}`,
    ctx.daysUntilRace != null ? `- Weeks to race: ${Math.ceil(ctx.daysUntilRace / 7)}` : null,
  ];

  if (hasTrackEvents) {
    // Track / middle-distance athlete — include both aerobic and event-specific anchors
    phaseLines.push(`- Pace sources: aerobic systems from 3000m+ PRs only; event-specific from mile/1500/800 PRs`);
    if (ap.pr_5k)   phaseLines.push(`- Aerobic anchor: 5K ${ap.pr_5k}`);
    if (ap.pr_mile) phaseLines.push(`- Event anchor: Mile ${ap.pr_mile}`);
    if (ap.pr_1500m) phaseLines.push(`- Event anchor: 1500m ${ap.pr_1500m}`);
    if (ap.pr_800m) phaseLines.push(`- Event anchor: 800m ${ap.pr_800m}`);
  } else if (hasAerobicPRs) {
    // Road / 5K athlete — aerobic paces only
    phaseLines.push(`- Pace sources: all paces derived from aerobic PRs (3000m+ performances)`);
    if (ap.pr_5k)           phaseLines.push(`- Aerobic anchor: 5K ${ap.pr_5k}`);
    if (ap.pr_10k)          phaseLines.push(`- Aerobic anchor: 10K ${ap.pr_10k}`);
    if (ap.pr_half_marathon) phaseLines.push(`- Aerobic anchor: Half Marathon ${ap.pr_half_marathon}`);
    if (ap.pr_marathon)     phaseLines.push(`- Aerobic anchor: Marathon ${ap.pr_marathon}`);
  } else {
    // Beginner / no PRs — effort-based guidance
    phaseLines.push(`- No race PRs on file — use effort-based guidance (easy = conversational pace)`);
    phaseLines.push(`- Aerobic paces will be established as PRs are added to the profile`);
  }

  const trainingPhaseBlock = phaseLines.filter(Boolean).join('\n');

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
    trainingPhaseBlock ? '\n' + trainingPhaseBlock : '',
    memoryBlock ? '\n' + memoryBlock : '',
  ]
    .filter((s) => s !== null && s !== undefined)
    .join('\n')
    .trim();
}
