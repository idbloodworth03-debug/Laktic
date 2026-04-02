import OpenAI from 'openai';
import { env } from '../config/env';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/**
 * Extract memorable facts about an athlete from a slice of conversation history.
 * Returns an array of short fact strings (max 20 words each).
 * Non-throwing — returns [] on any error.
 */
export async function extractMemories(
  chatHistory: { role: string; content: string }[]
): Promise<string[]> {
  if (chatHistory.length === 0) return [];

  const historyText = chatHistory
    .map((m) => `${m.role === 'athlete' ? 'ATHLETE' : 'COACH'}: ${m.content}`)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a memory extraction assistant for a running coach AI. Given a conversation between an athlete and their coach, extract concrete facts worth persisting across future sessions. Focus on: injuries, race goals, PRs mentioned, training preferences, lifestyle factors, and any notable mental or motivational notes. Return a JSON object with key "memories" containing an array of short fact strings (max 20 words each). Return {"memories":[]} if nothing notable was said.',
        },
        {
          role: 'user',
          content: `Extract memorable facts from this conversation:\n\n${historyText}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const text = response.choices[0].message.content ?? '{}';
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.memories)) return parsed.memories as string[];
    if (Array.isArray(parsed.facts)) return parsed.facts as string[];
    return [];
  } catch {
    return [];
  }
}
