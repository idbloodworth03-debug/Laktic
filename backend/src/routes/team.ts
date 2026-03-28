import { Router } from 'express';
import { nanoid } from 'nanoid';
import { supabase } from '../db/supabase';
import { auth, requireCoach, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { apiLimiter } from '../middleware/rateLimit';
import { teamCreateSchema, memberStatusSchema } from '../schemas';

const router = Router();

function generateInviteCode(): string {
  return nanoid(8).toUpperCase();
}

// POST /api/coach/team — Create team
router.post(
  '/',
  auth,
  requireCoach,
  validate(teamCreateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { name, default_bot_id, max_uses, invite_code_expires_at } = req.body;

    // Check coach doesn't already have a team
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'You already have a team. Only one team per coach is allowed.' });
    }

    // Validate default_bot_id if provided — only check ownership, not published status
    if (default_bot_id) {
      const { data: bot } = await supabase
        .from('coach_bots')
        .select('id')
        .eq('id', default_bot_id)
        .eq('coach_id', req.coach.id)
        .single();

      if (!bot) {
        return res.status(400).json({ error: 'Bot not found or not owned by you.' });
      }
    }

    const invite_code = generateInviteCode();

    const { data: team, error } = await supabase
      .from('teams')
      .insert({
        coach_id: req.coach.id,
        name,
        default_bot_id: default_bot_id || null,
        invite_code,
        ...(max_uses !== undefined && { max_uses }),
        ...(invite_code_expires_at !== undefined && { invite_code_expires_at })
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Log event
    await supabase.from('team_events').insert({
      team_id: team.id,
      actor_id: req.coach.id,
      action: 'created',
      details: { name }
    });

    res.json(team);
  })
);

// GET /api/coach/team — Get team with roster
router.get(
  '/',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('coach_id', req.coach.id)
      .single();

    if (!team) return res.json({ team: null });

    const { data: members } = await supabase
      .from('team_members')
      .select(`
        *,
        athlete_profiles!athlete_id (id, name, weekly_volume_miles, primary_events)
      `)
      .eq('team_id', team.id)
      .order('joined_at', { ascending: true });

    res.json({ team, members: members || [] });
  })
);

// GET /api/coach/team/athletes — List athletes with plan phase
router.get(
  '/athletes',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (!team) return res.status(404).json({ error: 'No team found' });

    const { data: members } = await supabase
      .from('team_members')
      .select(`
        *,
        athlete_profiles!athlete_id (
          id, name, weekly_volume_miles, primary_events,
          athlete_seasons (id, status, race_calendar, season_plan, bot_id)
        )
      `)
      .eq('team_id', team.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: true });

    res.json(members || []);
  })
);

// POST /api/athlete/join/:inviteCode — Join team
router.post(
  '/join/:inviteCode',
  auth,
  requireAthlete,
  apiLimiter,
  asyncHandler(async (req: AuthRequest, res) => {
    const { inviteCode } = req.params;

    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase())
      .single();

    if (!team) return res.status(404).json({ error: 'Invalid invite code.' });

    // Check expiry
    if (team.invite_code_expires_at && new Date(team.invite_code_expires_at) < new Date()) {
      return res.status(400).json({ error: 'This invite link has expired.' });
    }

    // Check max uses
    if (team.max_uses !== null && team.max_uses !== undefined && team.uses_count >= team.max_uses) {
      return res.status(400).json({ error: 'This invite link has reached its limit.' });
    }

    // Check already a member
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', team.id)
      .eq('athlete_id', req.athlete.id)
      .single();

    if (existingMember) {
      return res.status(400).json({ error: 'You are already a member of this team.' });
    }

    // Add member
    const { error: memberError } = await supabase.from('team_members').insert({
      team_id: team.id,
      athlete_id: req.athlete.id
    });

    if (memberError) return res.status(400).json({ error: memberError.message });

    // Increment uses_count
    await supabase
      .from('teams')
      .update({ uses_count: (team.uses_count ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', team.id);

    // Log event
    await supabase.from('team_events').insert({
      team_id: team.id,
      actor_id: req.athlete.id,
      action: 'joined',
      details: { athlete_name: req.athlete.name }
    });

    // If team has a default bot, return bot info for auto-subscription
    let defaultBot = null;
    if (team.default_bot_id) {
      const { data: bot } = await supabase
        .from('coach_bots')
        .select('id, name, is_published')
        .eq('id', team.default_bot_id)
        .single();

      if (bot?.is_published) {
        defaultBot = bot;
      }
    }

    res.json({
      message: 'Successfully joined the team!',
      team: { id: team.id, name: team.name },
      defaultBot
    });
  })
);

// PATCH /api/coach/team/members/:athleteId — Update member status
router.patch(
  '/members/:athleteId',
  auth,
  requireCoach,
  validate(memberStatusSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { athleteId } = req.params;
    const { status } = req.body;

    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (!team) return res.status(404).json({ error: 'No team found' });

    const { data: member, error: findError } = await supabase
      .from('team_members')
      .select('id, status')
      .eq('team_id', team.id)
      .eq('athlete_id', athleteId)
      .single();

    if (findError || !member) return res.status(404).json({ error: 'Member not found on your team.' });

    const oldStatus = member.status;

    const { data, error } = await supabase
      .from('team_members')
      .update({ status })
      .eq('id', member.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Log event
    await supabase.from('team_events').insert({
      team_id: team.id,
      actor_id: req.coach.id,
      action: 'status_changed',
      details: { athlete_id: athleteId, old_status: oldStatus, new_status: status }
    });

    res.json(data);
  })
);

// POST /api/coach/team/invite/regenerate — Generate new invite code
router.post(
  '/invite/regenerate',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (!team) return res.status(404).json({ error: 'No team found' });

    const newCode = generateInviteCode();

    const { data, error } = await supabase
      .from('teams')
      .update({
        invite_code: newCode,
        uses_count: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', team.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Log event
    await supabase.from('team_events').insert({
      team_id: team.id,
      actor_id: req.coach.id,
      action: 'invite_regenerated',
      details: { new_code: newCode }
    });

    res.json(data);
  })
);

export default router;
