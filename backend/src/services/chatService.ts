import { GoogleGenerativeAI } from '@google/generative-ai';
import { getFormattedKnowledge } from './knowledgeService';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `You are a coaching bot built on the philosophy and training knowledge of a specific coach. Respond like a real coach — warm, direct, expert, and grounded in the coach's philosophy.

Rules:
1. Always respond in the voice of the coaching philosophy. Sound like that coach, not a generic AI.
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
}): Promise<{ botReply: string; planUpdates: any[] | null }> {
  const { bot, athleteProfile, raceCalendar, seasonPlan, chatHistory, newMessage } = params;

  if (!bot) {
    console.error('[chat] respond() called with null bot');
    return { botReply: 'Sorry, there was a configuration issue with your coaching bot. Please contact support.', planUpdates: null };
  }

  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date(today + 'T00:00:00Z');
  maxDate.setUTCDate(maxDate.getUTCDate() + 14);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const historyText = chatHistory.slice(-20).map((msg: any) =>
    `${msg.role === 'athlete' ? 'ATHLETE' : 'COACH BOT'}: ${msg.content}`
  ).join('\n');

  try {
    const coachKnowledge = await getFormattedKnowledge(bot.id);

    const personalityBlock = bot.personality_prompt
      ? `COACHING PERSONALITY: ${bot.personality_prompt}\n\nYour coaching philosophy and style must reflect the above personality in every response. Never break character.\n\n`
      : '';

    const fullPrompt = `${personalityBlock}${SYSTEM_PROMPT}

COACH PHILOSOPHY:
${bot.philosophy}

COACH KNOWLEDGE:
${coachKnowledge}

ATHLETE PROFILE:
Name: ${athleteProfile.name} | Mileage: ${athleteProfile.weekly_volume_miles}/wk | Events: ${(athleteProfile.primary_events || []).join(', ')} | PR Mile: ${athleteProfile.pr_mile || 'N/A'} | PR 5K: ${athleteProfile.pr_5k || 'N/A'}

RACE CALENDAR:
${JSON.stringify(raceCalendar)}

CURRENT SEASON PLAN (relevant weeks):
${JSON.stringify(seasonPlan?.slice(0, 4))}

TODAY: ${today}

CONVERSATION HISTORY:
${historyText}

ATHLETE: ${newMessage}

Respond as the coach bot. Return ONLY valid JSON, no markdown.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(fullPrompt);
    const text = result.response.text();

    let parsed: { reply: string; plan_updates: any[] | null } | null = null;
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
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
    console.error('[chat] Gemini error:', err);
    return { botReply: 'Sorry, I ran into a technical issue. Your plan has not been changed.', planUpdates: null };
  }
}