import { Router } from 'express';
import { nanoid } from 'nanoid';
import { supabase } from '../db/supabase';
import { auth, requireCoach, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const teamChallengeInviteSchema = z.object({
  title: z.string().min(1).max(200),
  target_value: z.number().positive(),
  target_unit: z.string().min(1).max(50),
  metric: z.enum(['miles', 'workouts', 'hours', 'elevation_ft']).default('miles'),
  ends_at: z.string().min(1)
});

// POST /api/team-challenges/invite — coach creates a team challenge invite
router.post(
  '/invite',
  auth,
  requireCoach,
  validate(teamChallengeInviteSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { title, target_value, target_unit, metric, ends_at } = req.body;

    // Resolve coach's team
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (!team) return res.status(404).json({ error: 'You do not have a team.' });

    const invite_code = nanoid(8).toUpperCase();

    const { data, error } = await supabase
      .from('team_challenges')
      .insert({
        challenger_team_id: team.id,
        invite_code,
        title,
        target_value,
        target_unit,
        metric: metric || 'miles',
        ends_at,
        status: 'pending'
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ ...data, invite_code });
  })
);

// POST /api/team-challenges/:id/accept — coach accepts a team challenge by invite code
router.post(
  '/accept',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { invite_code } = req.body;
    if (!invite_code) return res.status(400).json({ error: 'invite_code is required.' });

    // Resolve accepting coach's team
    const { data: myTeam } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (!myTeam) return res.status(404).json({ error: 'You do not have a team.' });

    const { data: challenge } = await supabase
      .from('team_challenges')
      .select('*')
      .eq('invite_code', invite_code.toUpperCase())
      .single();

    if (!challenge) return res.status(404).json({ error: 'Invalid invite code.' });
    if (challenge.status !== 'pending') return res.status(400).json({ error: 'This challenge has already been accepted.' });
    if (challenge.challenger_team_id === myTeam.id) {
      return res.status(400).json({ error: 'You cannot accept your own challenge.' });
    }

    const { data, error } = await supabase
      .from('team_challenges')
      .update({ challenged_team_id: myTeam.id, status: 'active' })
      .eq('id', challenge.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// GET /api/team-challenges/active — get active team challenges for coach's team
router.get(
  '/active',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (!team) return res.json([]);

    const now = new Date().toISOString();

    const { data: challenges, error } = await supabase
      .from('team_challenges')
      .select(`
        id, title, target_value, target_unit, metric, ends_at, status, invite_code,
        challenger_team_id, challenged_team_id
      `)
      .or(`challenger_team_id.eq.${team.id},challenged_team_id.eq.${team.id}`)
      .in('status', ['pending', 'active'])
      .gte('ends_at', now)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    // Enrich with team names
    const teamIds = new Set<string>();
    for (const ch of challenges || []) {
      if (ch.challenger_team_id) teamIds.add(ch.challenger_team_id);
      if (ch.challenged_team_id) teamIds.add(ch.challenged_team_id);
    }

    const { data: teams } = await supabase
      .from('teams')
      .select('id, name')
      .in('id', [...teamIds]);

    const teamMap = new Map((teams || []).map((t: any) => [t.id, t.name]));

    const enriched = (challenges || []).map(ch => ({
      ...ch,
      challenger_team_name: teamMap.get(ch.challenger_team_id) ?? 'Unknown',
      challenged_team_name: ch.challenged_team_id ? (teamMap.get(ch.challenged_team_id) ?? 'Pending') : 'Pending',
      is_challenger: ch.challenger_team_id === team.id,
      days_remaining: Math.max(0, Math.ceil((new Date(ch.ends_at).getTime() - Date.now()) / 86400000))
    }));

    res.json(enriched);
  })
);

// GET /api/team-challenges/:id/progress — get detailed progress for a team challenge
router.get(
  '/:id/progress',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const { data: challenge } = await supabase
      .from('team_challenges')
      .select('*')
      .eq('id', id)
      .single();

    if (!challenge) return res.status(404).json({ error: 'Challenge not found.' });

    // Verify coach has access (their team is involved)
    const { data: myTeam } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (!myTeam) return res.status(403).json({ error: 'Unauthorized.' });
    if (challenge.challenger_team_id !== myTeam.id && challenge.challenged_team_id !== myTeam.id) {
      return res.status(403).json({ error: 'You are not part of this challenge.' });
    }

    // Get athletes for both teams
    async function getTeamProgress(teamId: string) {
      const { data: members } = await supabase
        .from('team_members')
        .select('athlete_id')
        .eq('team_id', teamId)
        .is('left_at', null);

      const athleteIds = (members || []).map((m: any) => m.athlete_id);
      if (athleteIds.length === 0) return { total: 0, athlete_count: 0 };

      const { data: activities } = await supabase
        .from('athlete_activities')
        .select('athlete_id, distance_miles, elapsed_time_seconds')
        .in('athlete_id', athleteIds)
        .gte('start_date', challenge.starts_at);

      let total = 0;
      for (const a of activities || []) {
        if (challenge.metric === 'miles') total += a.distance_miles || 0;
        else if (challenge.metric === 'workouts') total += 1;
        else if (challenge.metric === 'hours') total += (a.elapsed_time_seconds || 0) / 3600;
      }

      return { total: Math.round(total * 10) / 10, athlete_count: athleteIds.length };
    }

    const [challengerProgress, challengedProgress] = await Promise.all([
      getTeamProgress(challenge.challenger_team_id),
      challenge.challenged_team_id ? getTeamProgress(challenge.challenged_team_id) : Promise.resolve({ total: 0, athlete_count: 0 })
    ]);

    res.json({
      challenge,
      progress: {
        challenger: challengerProgress,
        challenged: challengedProgress
      }
    });
  })
);

export default router;
