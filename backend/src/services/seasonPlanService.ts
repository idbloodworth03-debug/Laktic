import OpenAI from 'openai';
import { env } from '../config/env';
import { getFormattedKnowledge } from './knowledgeService';
import { getWeekStartDate, addDays } from '../utils/dateUtils';
import { RUNNING_EXPERT_BASELINE } from '../utils/runningExpertBaseline';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are an expert distance running coach AI. Generate a complete multi-week periodized training season for this athlete.

Rules:
1. Use the coach's philosophy and uploaded knowledge to guide every decision.
2. Use the weekly template as the base structure each week.
3. For workouts where ai_adjustable is true: scale distance and pace to the athlete's fitness. For workouts where ai_adjustable is false: copy exactly as written.
4. Periodize around the race calendar: build volume in base weeks, taper the 2 weeks before each goal race.
5. For non-goal races: reduce volume 20% that week.
6. Every workout must include change_reason (one sentence).
7. Return ONLY valid JSON, no markdown fences. Structure:
[{ week_number, week_start_date, phase, workouts: [{ day_of_week, date, title, description, distance_miles, pace_guideline, ai_adjustable, change_reason }] }]

${RUNNING_EXPERT_BASELINE}`;

function buildUserPrompt(params: any): string {
  const { bot, botWorkouts, athleteProfile, raceCalendar, coachKnowledge, startDate, numWeeks, recentActivities, latestReadiness } = params;
  const todayDate = new Date().toISOString().split('T')[0];

  const ap = athleteProfile;
  const profileLines = [
    `Name: ${ap.name}`,
    `Events: ${(ap.primary_events || []).join(', ') || 'Not specified'}`,
    `Fitness Level: ${ap.fitness_level || 'Not specified'}`,
    `Primary Goal: ${ap.primary_goal || 'Not specified'}`,
    `Training Days/Week: ${ap.training_days_per_week ?? ap.weekly_volume_miles ? `${ap.training_days_per_week} days` : 'Not specified'}`,
    `Biggest Challenge: ${ap.biggest_challenge || 'Not specified'}`,
    ap.injury_notes ? `Injuries/Limitations: ${ap.injury_notes}` : null,
    ap.has_target_race && ap.target_race_name ? `Target Race: ${ap.target_race_name}${ap.target_race_date ? ` on ${ap.target_race_date}` : ''}` : null,
    ap.pr_mile ? `PR Mile: ${ap.pr_mile}` : null,
    ap.pr_5k ? `PR 5K: ${ap.pr_5k}` : null,
    ap.weekly_volume_miles ? `Current Weekly Mileage: ${ap.weekly_volume_miles} mi/wk` : null,
    ap.experience_level ? `Experience Level: ${ap.experience_level}` : null,
    ap.current_weekly_mileage ? `Current Weekly Mileage: ${ap.current_weekly_mileage} mi/wk` : null,
    ap.long_run_distance ? `Comfortable Long Run: ${ap.long_run_distance} miles` : null,
    ap.pr_10k ? `PR 10K: ${ap.pr_10k}` : null,
    ap.pr_half_marathon ? `PR Half Marathon: ${ap.pr_half_marathon}` : null,
    ap.pr_marathon ? `PR Marathon: ${ap.pr_marathon}` : null,
  ].filter(Boolean).join('\n');

  const activitiesBlock = recentActivities && recentActivities.length > 0
    ? `\nRECENT TRAINING (last 30 days):\n${recentActivities.slice(0, 20).map((a: any) =>
        `- ${(a.start_date || '').slice(0, 10)}: ${a.activity_type || 'Run'} ${a.distance_miles ? a.distance_miles + ' mi' : ''} ${a.pace ? '@ ' + a.pace + '/mi pace' : ''}`
      ).join('\n')}`
    : '';

  const readinessBlock = latestReadiness
    ? `\nCURRENT READINESS: ${latestReadiness.score}/100 — ${latestReadiness.label}. ${latestReadiness.score <= 40 ? 'Start conservatively this week.' : latestReadiness.score >= 80 ? 'Athlete is well-rested — can handle full load.' : ''}`
    : '';

  return `COACH PHILOSOPHY:\n${bot.philosophy}\n\nCOACH KNOWLEDGE:\n${coachKnowledge}\n\nCOACH WEEKLY TEMPLATE:\n${JSON.stringify(botWorkouts)}\n\nATHLETE PROFILE:\n${profileLines}\n${activitiesBlock}${readinessBlock}\n\nIMPORTANT: Tailor the plan specifically to this athlete's fitness level, available training days, goal, and any injuries. A beginner training 3 days/week with knee issues needs a fundamentally different plan than an elite athlete training 6 days/week.\n\nRACE CALENDAR:\n${JSON.stringify(raceCalendar)}\n\nTODAY: ${todayDate} | GENERATE FROM: ${startDate} | TOTAL WEEKS: ${numWeeks}\n\nGenerate the full season plan now. Return ONLY valid JSON array.`;
}

function fallbackPlan(botWorkouts: any[], startDate: string, numWeeks: number): any[] {
  const weeks = [];
  for (let w = 0; w < numWeeks; w++) {
    const weekStart = addDays(startDate, w * 7);
    const workouts = (botWorkouts || []).map((wo: any) => ({
      day_of_week: wo.day_of_week,
      date: addDays(weekStart, wo.day_of_week - 1),
      title: wo.title,
      description: wo.description || '',
      distance_miles: wo.distance_miles || 0,
      pace_guideline: wo.pace_guideline || '',
      ai_adjustable: wo.ai_adjustable,
      change_reason: 'Delivered as written by coach.'
    }));
    weeks.push({ week_number: w + 1, week_start_date: weekStart, phase: 'base', workouts });
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
}): Promise<{ plan: any[]; aiUsed: boolean }> {
  const { athleteProfile, bot, botWorkouts, raceCalendar, recentActivities, latestReadiness } = params;
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

  const systemContent = personalityBlock + SYSTEM_PROMPT;
  const userContent = buildUserPrompt({ bot, botWorkouts, athleteProfile, raceCalendar, coachKnowledge, startDate, numWeeks, recentActivities, latestReadiness });

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
      // GPT-4o with json_object wraps arrays — unwrap if needed
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
