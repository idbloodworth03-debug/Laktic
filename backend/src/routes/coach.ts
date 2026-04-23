import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireCoach, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { sendCoachWelcomeEmail } from '../services/emailService';
import { notifyCoachReplied } from '../services/notificationService';
import {
  coachProfileSchema,
  botCreateSchema,
  botUpdateSchema,
  workoutSchema,
  knowledgeCreateSchema,
  knowledgeUpdateSchema,
} from '../schemas';

const router = Router();

// POST /api/coach/profile
router.post(
  '/profile',
  auth,
  validate(coachProfileSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { name, school_or_org } = req.body;

    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    console.log('[POST /coach/profile] user_id:', req.user!.id, 'name:', name);
    const { data, error } = await supabase
      .from('coach_profiles')
      .insert({ user_id: req.user!.id, name, school_or_org, trial_ends_at: trialEndsAt })
      .select()
      .single();

    if (error) {
      console.error('[POST /coach/profile] insert error:', error.message, '| code:', error.code);
      return res.status(400).json({ error: error.message });
    }

    // Fire-and-forget welcome email (non-blocking)
    const userEmail = req.user!.email;
    if (userEmail) sendCoachWelcomeEmail(userEmail, name).catch(() => {});

    res.json(data);
  })
);

// PATCH /api/coach/profile
router.patch(
  '/profile',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const allowedFields = ['name', 'school_or_org', 'username', 'license_type', 'avatar_url'];
    const update: Record<string, unknown> = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    }
    if (Object.keys(update).length === 0) return res.json(req.coach);

    if (update.username) {
      update.username = (update.username as string).toLowerCase();
      const taken = update.username as string;
      const [{ data: c }, { data: a }] = await Promise.all([
        supabase.from('coach_profiles').select('id').eq('username', taken).neq('id', req.coach.id).maybeSingle(),
        supabase.from('athlete_profiles').select('id').eq('username', taken).maybeSingle(),
      ]);
      if (c || a) return res.status(409).json({ error: 'That username is already taken.' });
    }

    const { data, error } = await supabase
      .from('coach_profiles')
      .update(update)
      .eq('id', req.coach.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'That username is already taken.' });
      return res.status(400).json({ error: error.message });
    }
    return res.json(data);
  })
);

// GET /api/coach/bot
router.get(
  '/bot',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    // maybeSingle() returns null (no error) when 0 rows found, unlike single() which throws PGRST116
    const { data: bot, error: botErr } = await supabase
      .from('coach_bots')
      .select('*')
      .eq('coach_id', req.coach.id)
      .maybeSingle();

    if (botErr) { console.error('[GET /bot] Supabase error:', botErr.message, 'coach_id:', req.coach.id); return res.status(500).json({ error: botErr.message }); }
    console.log('[GET /bot] coach_id:', req.coach.id, '→ bot:', bot ? bot.id : 'null');
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
    console.log('[POST /bot] coach_id:', req.coach.id, 'body:', JSON.stringify(req.body));
    const { name, philosophy, event_focus, level_focus, personality, personality_prompt } = req.body;
    const { data: existingBot, error: existingErr } = await supabase.from('coach_bots').select('id').eq('coach_id', req.coach.id).single();
    if (existingErr && existingErr.code !== 'PGRST116') return res.status(500).json({ error: existingErr.message });
    if (existingBot) { console.log('[POST /bot] Bot already exists for coach:', req.coach.id); return res.status(400).json({ error: 'Bot already exists' }); }

    const { data, error } = await supabase
      .from('coach_bots')
      .insert({ coach_id: req.coach.id, name, philosophy, event_focus, level_focus, personality: personality ?? 'custom', personality_prompt: personality_prompt ?? null })
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

// ── Direct message inbox ───────────────────────────────────────────────────────

// GET /api/coach/messages — all conversations grouped by athlete, sorted by most recent
router.get(
  '/messages',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    // Two-step: fetch messages first, then batch-fetch athlete profiles.
    // This avoids PostgREST FK-join cache issues that can occur after migrations.
    const { data: messages, error } = await supabase
      .from('direct_messages')
      .select('id, athlete_id, sender_role, content, read_at, created_at')
      .eq('coach_id', req.coach.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[coach/messages] direct_messages query failed:', error.code, error.message);
      return res.status(500).json({ error: error.message });
    }

    if (!messages || messages.length === 0) return res.json([]);

    // Batch-fetch athlete names for all unique athlete IDs in one query
    const athleteIds = [...new Set(messages.map(m => m.athlete_id))];
    const { data: athletes } = await supabase
      .from('athlete_profiles')
      .select('id, name')
      .in('id', athleteIds);

    const athleteMap = new Map<string, { id: string; name: string }>(
      (athletes || []).map(a => [a.id, a])
    );

    // Group by athlete in application code
    const byAthlete = new Map<string, { athlete: any; msgs: any[]; unreadCount: number }>();
    for (const msg of messages) {
      const athlete = athleteMap.get(msg.athlete_id) ?? { id: msg.athlete_id, name: 'Unknown Athlete' };
      if (!byAthlete.has(msg.athlete_id)) {
        byAthlete.set(msg.athlete_id, { athlete, msgs: [], unreadCount: 0 });
      }
      const conv = byAthlete.get(msg.athlete_id)!;
      conv.msgs.push(msg);
      if (msg.sender_role === 'athlete' && !msg.read_at) conv.unreadCount++;
    }

    const conversations = Array.from(byAthlete.values())
      .map(conv => ({
        athlete: conv.athlete,
        lastMessage: conv.msgs[conv.msgs.length - 1],
        unreadCount: conv.unreadCount,
      }))
      .sort((a, b) =>
        new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
      );

    res.json(conversations);
  })
);

// GET /api/coach/messages/:athleteId — full thread, marks athlete messages as read
router.get(
  '/messages/:athleteId',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { athleteId } = req.params;

    const { data: messages, error } = await supabase
      .from('direct_messages')
      .select('id, sender_role, content, read_at, created_at')
      .eq('coach_id', req.coach.id)
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    // Mark unread athlete messages as read
    const unreadIds = (messages || [])
      .filter(m => m.sender_role === 'athlete' && !m.read_at)
      .map(m => m.id);

    if (unreadIds.length > 0) {
      await supabase
        .from('direct_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
    }

    res.json(messages || []);
  })
);

// POST /api/coach/messages/:athleteId/reply — coach sends a reply
router.post(
  '/messages/:athleteId/reply',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { athleteId } = req.params;
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

    // Verify athlete is on this coach's team
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (!team) return res.status(404).json({ error: 'No team found' });

    const { data: member } = await supabase
      .from('team_members')
      .select('athlete_id')
      .eq('team_id', team.id)
      .eq('athlete_id', athleteId)
      .single();

    if (!member) return res.status(403).json({ error: 'Athlete is not on your team' });

    const { data: dm, error } = await supabase
      .from('direct_messages')
      .insert({
        athlete_id: athleteId,
        coach_id: req.coach.id,
        sender_role: 'coach',
        content: message.trim(),
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Push notification to athlete (fire-and-forget)
    const { data: athlete } = await supabase
      .from('athlete_profiles')
      .select('user_id')
      .eq('id', athleteId)
      .single();

    if (athlete?.user_id) {
      notifyCoachReplied(athlete.user_id, req.coach.name).catch(() => {});
    }

    res.json(dm);
  })
);

export default router;
