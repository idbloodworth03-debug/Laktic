import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const PAGE_SIZE = 20;

const communityPostSchema = z.object({
  body: z.string().min(1).max(500),
  scope: z.enum(['public', 'team']).default('public'),
  sport_channel: z.enum(['track', 'xc', 'triathlon', 'road', 'swimming', 'general']).optional(),
  image_url: z.string().url().max(2000).optional()
});

// GET /api/community/feed?page=1&channel=all
// Returns public posts + the user's own team posts, paginated (coaches and athletes)
router.get(
  '/feed',
  auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const channel = (req.query.channel as string) || 'all';
    const offset = (page - 1) * PAGE_SIZE;

    // Resolve active team and athlete id for the current user (either role)
    let activeTeamId: string | null = null;
    let athleteId: string | null = null;

    const { data: athleteProfile } = await supabase
      .from('athlete_profiles')
      .select('id, active_team_id')
      .eq('user_id', req.user!.id)
      .maybeSingle();

    if (athleteProfile) {
      activeTeamId = athleteProfile.active_team_id ?? null;
      athleteId = athleteProfile.id;
    } else {
      // Coach: look up their team
      const { data: coachProfile } = await supabase
        .from('coach_profiles')
        .select('id')
        .eq('user_id', req.user!.id)
        .maybeSingle();
      if (coachProfile) {
        const { data: team } = await supabase
          .from('teams')
          .select('id')
          .eq('coach_id', coachProfile.id)
          .maybeSingle();
        activeTeamId = team?.id ?? null;
      }
    }

    let query = supabase
      .from('team_feed')
      .select(`
        id, feed_type, body, scope, sport_channel, image_url, created_at, team_id,
        athlete_profiles!athlete_id (id, name),
        feed_kudos (id, athlete_id)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    // Visibility: public posts OR posts from the user's own team
    if (activeTeamId) {
      query = query.or(`scope.eq.public,team_id.eq.${activeTeamId}`);
    } else {
      query = query.eq('scope', 'public');
    }

    // Channel filter
    if (channel && channel !== 'all') {
      query = query.eq('sport_channel', channel);
    }

    const { data: posts, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    const enriched = (posts || []).map(post => ({
      ...post,
      kudo_count: Array.isArray(post.feed_kudos) ? post.feed_kudos.length : 0,
      i_kudoed: athleteId && Array.isArray(post.feed_kudos)
        ? post.feed_kudos.some((k: any) => k.athlete_id === athleteId)
        : false,
      feed_kudos: undefined
    }));

    res.json({
      posts: enriched,
      hasMore: (count ?? 0) > offset + PAGE_SIZE,
      page
    });
  })
);

// POST /api/community/posts
router.post(
  '/posts',
  auth,
  requireAthlete,
  validate(communityPostSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { body: postBody, scope, sport_channel, image_url } = req.body;

    // Resolve team_id from active team (required for team posts, optional for public)
    const activeTeamId = req.athlete.active_team_id ?? null;
    if (scope === 'team' && !activeTeamId) {
      return res.status(400).json({ error: 'You must be on a team to post team-only content.' });
    }

    let teamId = activeTeamId;
    if (!teamId) {
      // For public posts without a team, look up any active membership
      const { data: membership } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('athlete_id', req.athlete.id)
        .is('left_at', null)
        .limit(1)
        .single();
      teamId = membership?.team_id ?? null;
    }

    if (!teamId) {
      return res.status(400).json({ error: 'You must be on a team to post.' });
    }

    const { data, error } = await supabase
      .from('team_feed')
      .insert({
        team_id: teamId,
        athlete_id: req.athlete.id,
        feed_type: 'manual',
        body: postBody,
        scope,
        ...(sport_channel && { sport_channel }),
        ...(image_url && { image_url })
      })
      .select(`
        id, feed_type, body, scope, sport_channel, image_url, created_at, team_id,
        athlete_profiles!athlete_id (id, name)
      `)
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ ...data, kudo_count: 0, i_kudoed: false });
  })
);

export default router;
