import { GoogleGenerativeAI } from '@google/generative-ai';
import { getFormattedKnowledge } from './knowledgeService';
import { getWeekStartDate, addDays } from '../utils/dateUtils';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `You are an expert distance running coach AI. Generate a complete multi-week periodized training season for this athlete.

Rules:
1. Use the coach's philosophy and uploaded knowledge to guide every decision.
2. Use the weekly template as the base structure each week.
3. For workouts where ai_adjustable is true: scale distance and pace to the athlete's fitness. For workouts where ai_adjustable is false: copy exactly as written.
4. Periodize around the race calendar: build volume in base weeks, taper the 2 weeks before each goal race.
5. For non-goal races: reduce volume 20% that week.
6. Every workout must include change_reason (one sentence).
7. Return ONLY valid JSON, no markdown fences. Structure:
[{ week_number, week_start_date, phase, workouts: [{ day_of_week, date, title, description, distance_miles, pace_guideline, ai_adjustable, change_reason }] }]`;

function buildUserPrompt(params: any): string {
  const { bot, botWorkouts, athleteProfile, raceCalendar, coachKnowledge, startDate, numWeeks } = params;
  const todayDate = new Date().toISOString().split('T')[0];
  return `COACH PHILOSOPHY:\n${bot.philosophy}\n\nCOACH KNOWLEDGE:\n${coachKnowledge}\n\nCOACH WEEKLY TEMPLATE:\n${JSON.stringify(botWorkouts)}\n\nATHLETE PROFILE:\nName: ${athleteProfile.name} | Mileage: ${athleteProfile.weekly_volume_miles}/wk | Events: ${(athleteProfile.primary_events || []).join(', ')} | PR Mile: ${athleteProfile.pr_mile || 'N/A'} | PR 5K: ${athleteProfile.pr_5k || 'N/A'}\n\nRACE CALENDAR:\n${JSON.stringify(raceCalendar)}\n\nTODAY: ${todayDate} | GENERATE FROM: ${startDate} | TOTAL WEEKS: ${numWeeks}\n\nGenerate the full season plan now. Return ONLY valid JSON.`;
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
}): Promise<{ plan: any[]; aiUsed: boolean }> {
  const { athleteProfile, bot, botWorkouts, raceCalendar } = params;
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

  const fullPrompt = SYSTEM_PROMPT + '\n\n' + buildUserPrompt({ bot, botWorkouts, athleteProfile, raceCalendar, coachKnowledge, startDate, numWeeks });
  let aiPlan: any[] | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(fullPrompt);
      const text = result.response.text();
      aiPlan = parseAndValidate(text);
      if (aiPlan) break;
    } catch (err) { console.error(`[seasonPlan] Gemini error attempt ${attempt + 1}:`, err); }
  }

  const existingWeeks = params.existingWeeks || [];
  const today = new Date().toISOString().split('T')[0];
  const pastWeeks = existingWeeks.filter((w: any) => w.week_start_date < today);

  if (aiPlan) return { plan: [...pastWeeks, ...aiPlan], aiUsed: true };

  console.warn('[seasonPlan] Gemini failed, using fallback');
  return { plan: [...pastWeeks, ...fallbackPlan(botWorkouts, startDate, numWeeks)], aiUsed: false };
}