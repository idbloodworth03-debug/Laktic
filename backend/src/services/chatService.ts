import OpenAI from 'openai';
import { env } from '../config/env';
import { getFormattedKnowledge } from './knowledgeService';
import { RUNNING_EXPERT_BASELINE } from '../utils/runningExpertBaseline';
import { PACE_PERSONA } from '../utils/pacePersona';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `${PACE_PERSONA}

Rules:
1. Always respond in the voice of Pace. Stay in character as a veteran running coach.
2. You can only update workouts within the next 14 days from today. For anything beyond that, tell the athlete to use the Regenerate Plan button.
3. Be conservative. Only change what is directly affected.
4. For injuries: reduce load conservatively. Always recommend consulting a medical professional for significant symptoms.
5. Do not give medical advice. Do not diagnose injuries.
6. If the athlete asks for a major season rewrite: explain that large changes require the Regenerate Plan button.
7. Return ONLY valid JSON, no markdown fences:
{ reply: string, plan_updates: [{ week_number, day_of_week, date, title, description, distance_miles, pace_guideline, change_reason }] | null }`;

export async function respond(params: {
  bot: any; athleteProfile: any; raceCalendar: any[];
  seasonPlan: any[]; chatHistory: any[]; newMessage: string;
  recentActivities?: any[]; latestReadiness?: { score: number; label: string; recommended_intensity?: string } | null;
}): Promise<{ botReply: string; planUpdates: any[] | null }> {
  const { bot, athleteProfile, raceCalendar, seasonPlan, chatHistory, newMessage, recentActivities, latestReadiness } = params;

  if (!bot) {
    console.error('[chat] respond() called with null bot');
    return { botReply: 'Sorry, there was a configuration issue with your coaching bot. Please contact support.', planUpdates: null };
  }

  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date(today + 'T00:00:00Z');
  maxDate.setUTCDate(maxDate.getUTCDate() + 14);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const historyText = chatHistory.slice(-20).map((msg: any) =>
    `${msg.role === 'athlete' ? 'ATHLETE' : 'PACE'}: ${msg.content}`
  ).join('\n');

  try {
    const coachKnowledge = await getFormattedKnowledge(bot.id);

    const personalityBlock = bot.personality_prompt
      ? `COACHING PERSONALITY: ${bot.personality_prompt}\n\nYour coaching philosophy and style must reflect the above personality in every response. Never break character.\n\n`
      : '';

    const systemContent = `${personalityBlock}${SYSTEM_PROMPT}\n\n${RUNNING_EXPERT_BASELINE}`;

    const activitiesBlock = recentActivities && recentActivities.length > 0
      ? `\nRECENT ACTIVITIES (last 30 days):\n${recentActivities.slice(0, 15).map((a: any) =>
          `- ${(a.start_date || '').slice(0, 10)}: ${a.activity_type || 'Run'} ${a.distance_miles ? a.distance_miles + ' mi' : ''} ${a.pace ? '@ ' + a.pace + '/mi' : ''}`
        ).join('\n')}`
      : '';

    const readinessBlock = latestReadiness
      ? `\nTODAY'S READINESS: ${latestReadiness.score}/100 — ${latestReadiness.label}${latestReadiness.recommended_intensity ? ` (Recommended: ${latestReadiness.recommended_intensity})` : ''}`
      : '';

    const userContent = `COACH PHILOSOPHY:
${bot.philosophy}

COACH KNOWLEDGE:
${coachKnowledge}

ATHLETE PROFILE:
Name: ${athleteProfile.name} | Mileage: ${athleteProfile.weekly_volume_miles}/wk | Events: ${(athleteProfile.primary_events || []).join(', ')} | PR Mile: ${athleteProfile.pr_mile || 'N/A'} | PR 5K: ${athleteProfile.pr_5k || 'N/A'}

ATHLETE CONTEXT:
${activitiesBlock}${readinessBlock}

RACE CALENDAR:
${JSON.stringify(raceCalendar)}

CURRENT SEASON PLAN (relevant weeks):
${JSON.stringify(seasonPlan?.slice(0, 4))}

TODAY: ${today}

CONVERSATION HISTORY:
${historyText}

ATHLETE: ${newMessage}

Respond as the coach bot. Return ONLY valid JSON, no markdown.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const text = completion.choices[0].message.content ?? '';

    let parsed: { reply: string; plan_updates: any[] | null } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { botReply: text, planUpdates: null };
    }

    if (!parsed) return { botReply: 'Sorry, I had trouble understanding that. Please try again.', planUpdates: null };

    let planUpdates = parsed.plan_updates || null;
    let replyNote = '';

    if (planUpdates && planUpdates.length > 0) {
      const valid = planUpdates.filter((u: any) => u.date && u.date <= maxDateStr);
      if (planUpdates.length - valid.length > 0) {
        replyNote = ' (Note: changes beyond the next 14 days require using the Regenerate Plan button.)';
      }
      planUpdates = valid.length > 0 ? valid : null;
    }

    return { botReply: parsed.reply + replyNote, planUpdates };
  } catch (err) {
    console.error('[chat] OpenAI error:', err);
    return { botReply: 'Sorry, I ran into a technical issue. Your plan has not been changed.', planUpdates: null };
  }
}
