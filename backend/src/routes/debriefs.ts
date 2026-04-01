import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireCoach, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import OpenAI from 'openai';
import { env } from '../config/env';
import { PACE_PERSONA } from '../utils/pacePersona';

const router = Router();
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ── Schemas ───────────────────────────────────────────────────────────────────

const startSchema = z.object({
  race_result_id: z.string().uuid()
});

const messageSchema = z.object({
  message: z.string().min(1).max(2000)
});

// ── System prompt ─────────────────────────────────────────────────────────────

const DEBRIEF_SYSTEM_PROMPT = `${PACE_PERSONA}

You are conducting a post-race debrief. Ask 4-5 focused questions ONE AT A TIME about: what went well, what to improve, any pain or discomfort, pacing execution, mental state. Sound like Pace — direct and caring, not clinical. Keep responses concise (2-3 sentences max).

After the athlete has answered all questions, output ONLY a JSON block (no other text) in this format:
{"went_well":"...","improve_next_time":"...","physical_notes":"...","mental_notes":"...","pacing_execution":"...","coach_flag":false}

Set coach_flag to true ONLY if athlete mentions pain, injury, cramping, or extreme fatigue.`;

// ── Helper to fetch bot personality for an athlete ────────────────────────────

async function getBotPersonalityPrompt(athleteId: string): Promise<string> {
  try {
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id, teams!team_id(coach_id, coach_bots!coach_id(personality_prompt))')
      .eq('athlete_id', athleteId)
      .is('left_at', null)
      .limit(1)
      .single();
    return (teamMember as any)?.teams?.coach_bots?.personality_prompt ?? '';
  } catch {
    return '';
  }
}

// ── Helper to build OpenAI message array ──────────────────────────────────────

function buildMessages(debrief: any, personalityPrompt?: string): OpenAI.Chat.ChatCompletionMessageParam[] {
  const personalityBlock = personalityPrompt
    ? `COACHING PERSONALITY: ${personalityPrompt}\n\nYour coaching philosophy and style must reflect the above personality in every response. Never break character.\n\n`
    : '';
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: personalityBlock + DEBRIEF_SYSTEM_PROMPT }
  ];
  for (const msg of (debrief.messages ?? [])) {
    if (msg.role === 'system') continue; // skip stored system copies
    messages.push({ role: msg.role, content: msg.content });
  }
  return messages;
}

// ── Try to detect and parse final JSON summary from GPT reply ─────────────────

function extractInsights(content: string): Record<string, unknown> | null {
  const jsonStart = content.indexOf('{');
  const jsonEnd = content.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) return null;
  try {
    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    if ('went_well' in parsed || 'coach_flag' in parsed) return parsed;
  } catch {
    // Not valid JSON
  }
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/debriefs/start
router.post(
  '/start',
  auth,
  requireAthlete,
  validate(startSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { race_result_id } = req.body;
    const athleteId = req.athlete.id;

    // Fetch race result
    const { data: raceResult } = await supabase
      .from('race_results')
      .select('race_name, distance, finish_time, is_pr')
      .eq('id', race_result_id)
      .eq('athlete_id', athleteId)
      .single();

    if (!raceResult) return res.status(404).json({ error: 'Race result not found' });

    const raceName = raceResult.race_name ?? 'your race';
    const finishTime = raceResult.finish_time ?? 'your finish time';
    const isPr = raceResult.is_pr ? ' That looks like a new PR!' : '';

    const openingMessage = `Great race at ${raceName}! Finishing in ${finishTime} is worth reflecting on.${isPr} Let's do a quick debrief — I'll ask a few questions one at a time. First: what felt like it went best for you today?`;

    const initialMessages = [
      { role: 'assistant', content: openingMessage }
    ];

    const { data: debrief, error } = await supabase
      .from('race_debriefs')
      .insert({
        athlete_id: athleteId,
        race_result_id,
        messages: initialMessages,
        coach_flagged: false
      })
      .select()
      .single();

    if (error || !debrief) return res.status(400).json({ error: 'Failed to start debrief' });

    return res.status(201).json(debrief);
  })
);

// POST /api/debriefs/:id/message
router.post(
  '/:id/message',
  auth,
  requireAthlete,
  validate(messageSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { message } = req.body;
    const athleteId = req.athlete.id;

    const { data: debrief } = await supabase
      .from('race_debriefs')
      .select('*')
      .eq('id', req.params.id)
      .eq('athlete_id', athleteId)
      .single();

    if (!debrief) return res.status(404).json({ error: 'Debrief not found' });
    if (debrief.completed_at) return res.status(400).json({ error: 'Debrief already completed' });

    // Append athlete message
    const updatedMessages = [
      ...(debrief.messages ?? []),
      { role: 'user', content: message }
    ];

    // Build OpenAI messages with personality
    const personalityPrompt = await getBotPersonalityPrompt(athleteId);
    const openaiMessages = buildMessages({ ...debrief, messages: updatedMessages }, personalityPrompt);

    let botReply = '';
    let insights: Record<string, unknown> | null = null;
    let isComplete = false;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: openaiMessages
      });
      botReply = completion.choices[0].message.content ?? '';

      // Check if this is the final summary
      insights = extractInsights(botReply);
      if (insights) isComplete = true;
    } catch {
      return res.status(400).json({ error: 'AI service unavailable, please try again' });
    }

    // Append bot reply
    updatedMessages.push({ role: 'assistant', content: botReply });

    const updatePayload: Record<string, unknown> = { messages: updatedMessages };
    if (isComplete) {
      updatePayload.completed_at = new Date().toISOString();
      updatePayload.insights = insights;
      updatePayload.summary = [
        insights?.went_well ? `Went well: ${insights.went_well}` : '',
        insights?.improve_next_time ? `Improve: ${insights.improve_next_time}` : '',
        insights?.physical_notes ? `Physical: ${insights.physical_notes}` : ''
      ].filter(Boolean).join(' | ');

      if (insights?.coach_flag) {
        updatePayload.coach_flagged = true;

        // Notify coach
        try {
          const { data: teamMember } = await supabase
            .from('team_members')
            .select('team_id, teams!team_id(coach_id, coach_profiles!coach_id(user_id))')
            .eq('athlete_id', athleteId)
            .is('left_at', null)
            .limit(1)
            .single();

          const coachUserId = (teamMember as any)?.teams?.coach_profiles?.user_id;
          if (coachUserId) {
            const { notifyPlanReady } = await import('../services/notificationService');
            await notifyPlanReady(coachUserId, `${req.athlete.name ?? 'Athlete'} Post-Race Debrief`);
          }
        } catch {
          // Notification failure should not fail the request
        }
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('race_debriefs')
      .update(updatePayload)
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError) return res.status(400).json({ error: updateError.message });
    return res.json(updated);
  })
);

// POST /api/debriefs/:id/complete
router.post(
  '/:id/complete',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const athleteId = req.athlete.id;

    const { data: debrief } = await supabase
      .from('race_debriefs')
      .select('*')
      .eq('id', req.params.id)
      .eq('athlete_id', athleteId)
      .single();

    if (!debrief) return res.status(404).json({ error: 'Debrief not found' });
    if (debrief.completed_at) return res.status(400).json({ error: 'Debrief already completed' });

    const personalityPrompt = await getBotPersonalityPrompt(athleteId);
    const personalityBlock = personalityPrompt
      ? `COACHING PERSONALITY: ${personalityPrompt}\n\nYour coaching philosophy and style must reflect the above personality in every response. Never break character.\n\n`
      : '';
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: personalityBlock + DEBRIEF_SYSTEM_PROMPT },
      ...buildMessages(debrief, personalityPrompt).slice(1),
      {
        role: 'user',
        content: 'Please summarize our conversation so far in the required JSON format even if we have not covered all topics.'
      }
    ];

    let insights: Record<string, unknown> = {};
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: openaiMessages,
        response_format: { type: 'json_object' }
      });
      insights = JSON.parse(completion.choices[0].message.content ?? '{}');
    } catch {
      // Store without insights
    }

    const { data: updated, error } = await supabase
      .from('race_debriefs')
      .update({
        completed_at: new Date().toISOString(),
        insights,
        coach_flagged: !!insights?.coach_flag,
        summary: [
          insights?.went_well ? `Went well: ${insights.went_well}` : '',
          insights?.improve_next_time ? `Improve: ${insights.improve_next_time}` : ''
        ].filter(Boolean).join(' | ')
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(updated);
  })
);

// GET /api/debriefs/my
router.get('/my', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('race_debriefs')
    .select('id, race_result_id, summary, completed_at, coach_flagged, created_at')
    .eq('athlete_id', req.athlete.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data ?? []);
}));

// GET /api/debriefs/team
router.get('/team', auth, requireCoach, asyncHandler(async (req: AuthRequest, res) => {
  const { data: teamData } = await supabase
    .from('teams')
    .select('id')
    .eq('coach_id', req.coach.id)
    .single();

  if (!teamData) return res.status(404).json({ error: 'No team found' });

  const { data: members } = await supabase
    .from('team_members')
    .select('athlete_id')
    .eq('team_id', teamData.id)
    .is('left_at', null);

  const athleteIds = (members ?? []).map((m: any) => m.athlete_id);
  if (athleteIds.length === 0) return res.json([]);

  const { data, error } = await supabase
    .from('race_debriefs')
    .select('id, athlete_id, race_result_id, summary, completed_at, coach_flagged, created_at, athlete_profiles!athlete_id(name)')
    .in('athlete_id', athleteIds)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  return res.json(data ?? []);
}));

// GET /api/debriefs/:id
router.get('/:id', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('race_debriefs')
    .select('*')
    .eq('id', req.params.id)
    .eq('athlete_id', req.athlete.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Debrief not found' });
  return res.json(data);
}));

export default router;
