import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const PAGE_SIZE = 20;

const communityPostSchema = z.object({
  body: z.string().min(1).max(500),
  scope: z.enum(['public', 'team']).default('public'),
  image_url: z.string().url().max(2000).optional()
});

// ── GET /api/community/feed ───────────────────────────────────────────────────
// Public posts + the user's own team posts. Works for coaches and athletes.
router.get(
  '/feed',
  auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    // Resolve active team and current user's athlete_id (if any)
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
      // Fallback: resolve team from membership if active_team_id not set
      if (!activeTeamId) {
        const { data: membership } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('athlete_id', athleteProfile.id)
          .is('left_at', null)
          .limit(1)
          .maybeSingle();
        activeTeamId = membership?.team_id ?? null;
      }
    } else {
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
        id, feed_type, body, scope, image_url, created_at, team_id,
        athlete_profiles!athlete_id (id, name),
        coach_profiles!coach_id (id, name),
        feed_kudos (id, athlete_id)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (activeTeamId) {
      query = query.or(`scope.eq.public,team_id.eq.${activeTeamId}`);
    } else {
      query = query.eq('scope', 'public');
    }

    const { data: posts, error, count } = await query;
    if (error) {
      console.error('[community/feed] query error:', error.message, error);
      return res.status(400).json({ error: error.message });
    }
    console.log(`[community/feed] uid=${req.user!.id} activeTeam=${activeTeamId ?? 'none'} returned=${posts?.length ?? 0} total=${count}`);

    const enriched = (posts || []).map(post => ({
      ...post,
      kudo_count: Array.isArray(post.feed_kudos) ? post.feed_kudos.length : 0,
      i_kudoed: athleteId && Array.isArray(post.feed_kudos)
        ? post.feed_kudos.some((k: any) => k.athlete_id === athleteId)
        : false,
      feed_kudos: undefined,
    }));

    res.json({ posts: enriched, hasMore: (count ?? 0) > offset + PAGE_SIZE, page });
  })
);

// ── POST /api/community/posts ─────────────────────────────────────────────────
// Any authenticated user (coach or athlete) can post.
router.post(
  '/posts',
  auth,
  validate(communityPostSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { body: postBody, scope, image_url } = req.body;
    console.log(`[community/posts] POST uid=${req.user!.id} scope=${scope}`);

    // Determine if the poster is an athlete or coach
    const { data: athleteProfile, error: apErr } = await supabase
      .from('athlete_profiles')
      .select('id, active_team_id')
      .eq('user_id', req.user!.id)
      .maybeSingle();

    if (apErr) console.error('[community/posts] athlete_profiles lookup error:', apErr.message);

    if (athleteProfile) {
      // ── Athlete post ───────────────────────────────────────────────────────
      console.log(`[community/posts] poster=athlete id=${athleteProfile.id} active_team=${athleteProfile.active_team_id}`);

      let teamId: string | null = athleteProfile.active_team_id ?? null;

      // Try to resolve team from membership if active_team_id not set
      if (!teamId) {
        const { data: membership } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('athlete_id', athleteProfile.id)
          .is('left_at', null)
          .limit(1)
          .maybeSingle();
        teamId = membership?.team_id ?? null;
      }

      // Team-scoped posts require a team; public posts are allowed without one
      if (scope === 'team' && !teamId) {
        return res.status(400).json({ error: 'You must be on a team to post team-only content.' });
      }

      console.log(`[community/posts] athlete insert team_id=${teamId ?? 'null (public post)'}`);

      const { data, error } = await supabase
        .from('team_feed')
        .insert({
          team_id: teamId,
          athlete_id: athleteProfile.id,
          coach_id: null,
          feed_type: 'manual',
          body: postBody,
          scope,

          ...(image_url && { image_url }),
        })
        .select(`
          id, feed_type, body, scope, image_url, created_at, team_id,
          athlete_profiles!athlete_id (id, name),
          coach_profiles!coach_id (id, name)
        `)
        .single();

      if (error) {
        console.error('[community/posts] athlete insert error:', error.message, error);
        return res.status(400).json({ error: error.message });
      }
      console.log(`[community/posts] athlete post created id=${data?.id}`);
      return res.json({ ...data, kudo_count: 0, i_kudoed: false });
    }

    // ── Coach post ─────────────────────────────────────────────────────────
    const { data: coachProfile, error: cpErr } = await supabase
      .from('coach_profiles')
      .select('id')
      .eq('user_id', req.user!.id)
      .maybeSingle();

    if (cpErr) console.error('[community/posts] coach_profiles lookup error:', cpErr.message);

    if (!coachProfile) {
      return res.status(403).json({ error: 'Must be an athlete or coach to post.' });
    }

    console.log(`[community/posts] poster=coach id=${coachProfile.id}`);

    // Resolve team — optional for public posts
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', coachProfile.id)
      .maybeSingle();

    const teamId = team?.id ?? null;

    if (scope === 'team' && !teamId) {
      return res.status(400).json({ error: 'You must have a team to post team-only content.' });
    }

    console.log(`[community/posts] coach insert team_id=${teamId ?? 'null (public post)'}`);

    const { data, error } = await supabase
      .from('team_feed')
      .insert({
        team_id: teamId,
        athlete_id: null,
        coach_id: coachProfile.id,
        feed_type: 'manual',
        body: postBody,
        scope,

        ...(image_url && { image_url }),
      })
      .select(`
        id, feed_type, body, scope, sport_channel, image_url, created_at, team_id,
        athlete_profiles!athlete_id (id, name),
        coach_profiles!coach_id (id, name)
      `)
      .single();

    if (error) {
      console.error('[community/posts] coach insert error:', error.message, error);
      return res.status(400).json({ error: error.message });
    }
    console.log(`[community/posts] coach post created id=${data?.id}`);
    return res.json({ ...data, kudo_count: 0, i_kudoed: false });
  })
);

export default router;
