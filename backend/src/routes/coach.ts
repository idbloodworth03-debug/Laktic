import { Router } from 'express';
import OpenAI from 'openai';
import { supabase } from '../db/supabase';
import { auth, requireCoach, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { sendCoachWelcomeEmail } from '../services/emailService';
import {
  coachProfileSchema,
  botCreateSchema,
  botUpdateSchema,
  workoutSchema,
  knowledgeCreateSchema,
  knowledgeUpdateSchema,
  enhancePhilosophySchema
} from '../schemas';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ENHANCE_PROMPTS: Record<string, string> = {
  philosophy: `You are an expert coaching consultant who specialises in writing high-performance AI coaching system prompts for running and endurance sports coaches.

Your task is to take a coach's raw coaching philosophy and rewrite it into a richer, more structured version that will produce significantly better AI-generated training plans.

The output must:
1. Preserve every idea and value the coach expressed — never invent facts about their career or credentials
2. Make training principles explicit and specific (e.g. "80% of weekly volume at easy aerobic effort, 20% at threshold or above")
3. Specify workout structure preferences (types of sessions per week, long run approach, speed work philosophy)
4. Define periodization and progression logic (base building, sharpening, taper, recovery weeks)
5. State athlete communication style and motivational approach
6. Include guidance on how to handle injury, fatigue, and missed sessions
7. Use clear, instructional language — this text will be read by an AI system every time it builds a training plan
8. Write in first person as the coach ("I believe...", "My athletes...", "I structure...")
9. Aim for 3–5 focused paragraphs. Do not pad with generic advice.

Return ONLY the enhanced philosophy text. No preamble, no explanation, no markdown formatting.`,

  knowledge_doc: `You are an expert running coach and technical writer. Your task is to take raw coaching notes, a sample training week, training block, taper protocol, injury rules, or FAQ and rewrite them into a clear, structured, AI-readable coaching document.

The output must:
1. Preserve every specific workout, rule, distance, and instruction the coach wrote — never invent content
2. Organise content clearly with consistent structure (e.g. day-by-day format for sample weeks, numbered rules for protocols)
3. Make implicit logic explicit — if a workout serves a specific purpose, state it
4. Use precise, instructional language — this document will be read by an AI system when building training plans
5. Expand abbreviations and shorthand into full descriptions athletes and AI can understand
6. For sample weeks: include workout type, effort level, approximate distance, and purpose for each day
7. For injury rules: state the condition, the modification, and when to resume normal training
8. Keep the same document type and scope — do not add sections that weren't in the original

Return ONLY the enhanced document text. No preamble, no explanation, no markdown headers unless they were in the original.`,

  coach_bio: `You are a professional copywriter specialising in sports coaching profiles. Your task is to rewrite a coach's rough bio into a compelling, specific, and credible marketplace profile.

The output must:
1. Preserve every fact the coach stated — never invent achievements, results, or credentials
2. Lead with the most impressive or distinctive aspect of their background
3. Be specific rather than generic — replace vague claims with concrete details where the coach provided them
4. Highlight what makes this coach's approach distinctive or effective
5. Use confident, professional third-person or first-person voice (match whatever the coach used)
6. Keep a natural, human tone — not corporate or stiff
7. Aim for 3–4 punchy sentences. No padding.

Return ONLY the enhanced bio text. No preamble, no explanation.`,

  coach_credentials: `You are a professional sports career writer. Your task is to take a coach's rough list of credentials and experience and rewrite it as a clear, impressive, and credible credentials section.

The output must:
1. Preserve every certification, year, athlete, result, and institution the coach mentioned — never fabricate anything
2. Lead with the most impressive or relevant credential
3. Group related items logically (certifications, coaching history, notable athletes, personal results)
4. Use specific, concrete language — "8 years coaching D1 collegiate distance runners" not "extensive experience"
5. Keep it scannable — use short sentences or a natural list-style flow
6. Stay factual and grounded — do not hype or embellish beyond what was stated

Return ONLY the enhanced credentials text. No preamble, no explanation.`,
};

const router = Router();

// POST /api/coach/profile
router.post(
  '/profile',
  auth,
  validate(coachProfileSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { name, school_or_org } = req.body;

    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('coach_profiles')
      .insert({ user_id: req.user!.id, name, school_or_org, trial_ends_at: trialEndsAt })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Fire-and-forget welcome email (non-blocking)
    const userEmail = req.user!.email;
    if (userEmail) sendCoachWelcomeEmail(userEmail, name).catch(() => {});

    res.json(data);
  })
);

// GET /api/coach/bot
router.get(
  '/bot',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('*').eq('coach_id', req.coach.id).single();

    if (!bot) return res.json({ bot: null });

    const { data: workouts } = await supabase
      .from('bot_workouts')
      .select('*')
      .eq('bot_id', bot.id)
      .order('day_of_week');

    const { data: knowledge } = await supabase
      .from('coach_knowledge_documents')
      .select('*')
      .eq('coach_bot_id', bot.id)
      .order('document_type')
      .order('created_at');

    res.json({ bot, workouts: workouts || [], knowledge: knowledge || [] });
  })
);

// POST /api/coach/bot
router.post(
  '/bot',
  auth,
  requireCoach,
  validate(botCreateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { name, philosophy, event_focus, level_focus } = req.body;
    const existing = await supabase.from('coach_bots').select('id').eq('coach_id', req.coach.id).single();
    if (existing.data) return res.status(400).json({ error: 'Bot already exists' });

    const { data, error } = await supabase
      .from('coach_bots')
      .insert({ coach_id: req.coach.id, name, philosophy, event_focus, level_focus })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// PATCH /api/coach/bot
router.patch(
  '/bot',
  auth,
  requireCoach,
  validate(botUpdateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase
      .from('coach_bots')
      .select('id, is_published')
      .eq('coach_id', req.coach.id)
      .single();
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    if (req.body.is_published === false && bot.is_published) {
      const { data: seasons } = await supabase
        .from('athlete_seasons')
        .select('id')
        .eq('bot_id', bot.id)
        .eq('status', 'active');
      if (seasons && seasons.length > 0) {
        return res.status(400).json({ error: 'Cannot unpublish a bot with active subscribers.' });
      }
    }

    const { data, error } = await supabase
      .from('coach_bots')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', bot.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// POST /api/coach/bot/workouts
router.post(
  '/bot/workouts',
  auth,
  requireCoach,
  validate(workoutSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('id').eq('coach_id', req.coach.id).single();
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const { day_of_week, title, description, distance_miles, pace_guideline, ai_adjustable } = req.body;

    const { data, error } = await supabase
      .from('bot_workouts')
      .upsert(
        { bot_id: bot.id, day_of_week, title, description, distance_miles, pace_guideline, ai_adjustable },
        { onConflict: 'bot_id,day_of_week' }
      )
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// DELETE /api/coach/bot/workouts/:day
router.delete(
  '/bot/workouts/:day',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('id').eq('coach_id', req.coach.id).single();
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const day = parseInt(req.params.day);
    await supabase.from('bot_workouts').delete().eq('bot_id', bot.id).eq('day_of_week', day);
    res.json({ ok: true });
  })
);

// POST /api/coach/bot/publish
router.post(
  '/bot/publish',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('*').eq('coach_id', req.coach.id).single();
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    if (!bot.name) return res.status(400).json({ error: 'Bot name is required.' });
    if (!bot.philosophy) return res.status(400).json({ error: 'Philosophy is required.' });
    if (!bot.event_focus && !bot.level_focus)
      return res.status(400).json({ error: 'Set at least one focus (event or level).' });

    const { data: workouts } = await supabase.from('bot_workouts').select('id').eq('bot_id', bot.id);
    const { data: knowledge } = await supabase
      .from('coach_knowledge_documents')
      .select('id')
      .eq('coach_bot_id', bot.id);

    if (!workouts || workouts.length < 5 || !knowledge || knowledge.length < 1) {
      return res
        .status(400)
        .json({ error: 'Add at least 5 workouts and one knowledge document before publishing.' });
    }

    const { data, error } = await supabase
      .from('coach_bots')
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq('id', bot.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// Knowledge Documents
router.get(
  '/bot/knowledge',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('id').eq('coach_id', req.coach.id).single();
    if (!bot) return res.json([]);

    const { data } = await supabase
      .from('coach_knowledge_documents')
      .select('*')
      .eq('coach_bot_id', bot.id)
      .order('document_type')
      .order('created_at');

    res.json(data || []);
  })
);

router.post(
  '/bot/knowledge',
  auth,
  requireCoach,
  validate(knowledgeCreateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: bot } = await supabase.from('coach_bots').select('id').eq('coach_id', req.coach.id).single();
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const { title, document_type, content_text, source_file_name } = req.body;

    const { data, error } = await supabase
      .from('coach_knowledge_documents')
      .insert({ coach_bot_id: bot.id, title, document_type, content_text, source_file_name })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

router.patch(
  '/bot/knowledge/:id',
  auth,
  requireCoach,
  validate(knowledgeUpdateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    // Fetch current doc to snapshot it as a version
    const { data: current } = await supabase
      .from('coach_knowledge_documents')
      .select('id, title, content_text, coach_bot_id')
      .eq('id', req.params.id)
      .single();

    if (!current) return res.status(404).json({ error: 'Document not found' });

    // Verify ownership via bot
    const { data: bot } = await supabase
      .from('coach_bots')
      .select('id')
      .eq('id', current.coach_bot_id)
      .eq('coach_id', req.coach.id)
      .single();

    if (!bot) return res.status(403).json({ error: 'Forbidden' });

    // Snapshot current version before overwriting
    const { data: latestVersion } = await supabase
      .from('knowledge_doc_versions')
      .select('version_number')
      .eq('doc_id', req.params.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (latestVersion?.version_number ?? 0) + 1;

    await supabase.from('knowledge_doc_versions').insert({
      doc_id: current.id,
      version_number: nextVersion,
      title: current.title,
      content_text: current.content_text
    });

    const { data, error } = await supabase
      .from('coach_knowledge_documents')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // If this coach is a marketplace coach, update last_content_refresh_at
    await supabase
      .from('marketplace_coaches')
      .update({ last_content_refresh_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('coach_id', req.coach.id);

    res.json(data);
  })
);

// GET /api/coach/bot/knowledge/:id/versions — list version history
router.get(
  '/bot/knowledge/:id/versions',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    // Verify ownership
    const { data: doc } = await supabase
      .from('coach_knowledge_documents')
      .select('id, coach_bot_id')
      .eq('id', req.params.id)
      .single();

    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const { data: bot } = await supabase
      .from('coach_bots')
      .select('id')
      .eq('id', doc.coach_bot_id)
      .eq('coach_id', req.coach.id)
      .single();

    if (!bot) return res.status(403).json({ error: 'Forbidden' });

    const { data, error } = await supabase
      .from('knowledge_doc_versions')
      .select('id, version_number, title, created_at')
      .eq('doc_id', req.params.id)
      .order('version_number', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  })
);

// GET /api/coach/bot/knowledge/:id/versions/:versionNum — get a specific version (full content)
router.get(
  '/bot/knowledge/:id/versions/:versionNum',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: doc } = await supabase
      .from('coach_knowledge_documents')
      .select('id, coach_bot_id')
      .eq('id', req.params.id)
      .single();

    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const { data: bot } = await supabase
      .from('coach_bots')
      .select('id')
      .eq('id', doc.coach_bot_id)
      .eq('coach_id', req.coach.id)
      .single();

    if (!bot) return res.status(403).json({ error: 'Forbidden' });

    const vNum = parseInt(req.params.versionNum);
    const { data, error } = await supabase
      .from('knowledge_doc_versions')
      .select('*')
      .eq('doc_id', req.params.id)
      .eq('version_number', vNum)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Version not found' });
    res.json(data);
  })
);

router.delete(
  '/bot/knowledge/:id',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    await supabase.from('coach_knowledge_documents').delete().eq('id', req.params.id);
    res.json({ ok: true });
  })
);

// POST /api/coach/enhance-philosophy — AI-enhance a coaching philosophy draft
router.post(
  '/enhance-philosophy',
  auth,
  requireCoach,
  validate(enhancePhilosophySchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { philosophy, context = 'philosophy' } = req.body;
    const systemPrompt = ENHANCE_PROMPTS[context] ?? ENHANCE_PROMPTS.philosophy;

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the content to enhance:\n\n${philosophy}\n\nPlease enhance it.` },
      ],
    });

    const enhanced = (result.choices[0].message.content ?? '').trim();
    if (!enhanced) return res.status(500).json({ error: 'Enhancement returned empty response' });

    res.json({ enhanced });
  })
);

export default router;
