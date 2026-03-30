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
router.get(
  '/feed',
  auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const offset = (page - 1) * PAGE_SIZE;
    const sortByRelevance = req.query.sort === 'relevance';

    let activeTeamId: string | null = null;
    let athleteId:    string | null = null;
    let coachId:      string | null = null;

    const { data: athleteProfile } = await supabase
      .from('athlete_profiles').select('id, active_team_id')
      .eq('user_id', req.user!.id).maybeSingle();

    if (athleteProfile) {
      activeTeamId = athleteProfile.active_team_id ?? null;
      athleteId    = athleteProfile.id;
      if (!activeTeamId) {
        const { data: membership } = await supabase
          .from('team_members').select('team_id')
          .eq('athlete_id', athleteProfile.id).is('left_at', null).limit(1).maybeSingle();
        activeTeamId = membership?.team_id ?? null;
      }
    } else {
      const { data: cp } = await supabase
        .from('coach_profiles').select('id')
        .eq('user_id', req.user!.id).maybeSingle();
      if (cp) {
        coachId = cp.id;
        const { data: team } = await supabase
          .from('teams').select('id').eq('coach_id', cp.id).maybeSingle();
        activeTeamId = team?.id ?? null;
      }
    }

    // When sorting by relevance, fetch a larger pool so we can rank across recent posts
    const fetchLimit = sortByRelevance ? 100 : PAGE_SIZE;

    let query = supabase
      .from('team_feed')
      .select(`
        id, feed_type, body, scope, image_url, created_at, team_id, athlete_id, coach_id,
        athlete_profiles!athlete_id (id, name),
        coach_profiles!coach_id (id, name),
        feed_kudos (id, athlete_id, coach_id),
        post_comments (id)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(fetchLimit);

    if (!sortByRelevance) {
      query = (query as any).range(offset, offset + PAGE_SIZE - 1);
    }

    if (activeTeamId) {
      query = query.or(`scope.eq.public,team_id.eq.${activeTeamId}`);
    } else {
      query = query.eq('scope', 'public');
    }

    const { data: posts, error, count } = await query;
    if (error) {
      console.error('[community/feed] query error:', error.message);
      return res.status(400).json({ error: error.message });
    }
    console.log(`[community/feed] uid=${req.user!.id} team=${activeTeamId ?? 'none'} sort=${sortByRelevance ? 'relevance' : 'recent'} returned=${posts?.length ?? 0}`);

    let enriched = (posts || []).map(post => ({
      ...post,
      kudo_count: Array.isArray(post.feed_kudos) ? post.feed_kudos.length : 0,
      comment_count: Array.isArray((post as any).post_comments) ? (post as any).post_comments.length : 0,
      i_kudoed: Array.isArray(post.feed_kudos) && (
        athleteId ? post.feed_kudos.some((k: any) => k.athlete_id === athleteId)
          : coachId ? post.feed_kudos.some((k: any) => k.coach_id === coachId)
          : false
      ),
      feed_kudos: undefined,
      post_comments: undefined,
    }));

    if (sortByRelevance) {
      enriched = enriched
        .sort((a, b) => (b.kudo_count + b.comment_count) - (a.kudo_count + a.comment_count))
        .slice(offset, offset + PAGE_SIZE);
    }

    res.json({ posts: enriched, hasMore: (count ?? 0) > offset + PAGE_SIZE, page });
  })
);

// ── POST /api/community/posts ─────────────────────────────────────────────────
router.post(
  '/posts',
  auth,
  validate(communityPostSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { body: postBody, scope, image_url } = req.body;
    console.log(`[community/posts] POST uid=${req.user!.id} scope=${scope}`);

    const { data: athleteProfile } = await supabase
      .from('athlete_profiles').select('id, active_team_id')
      .eq('user_id', req.user!.id).maybeSingle();

    if (athleteProfile) {
      let teamId: string | null = athleteProfile.active_team_id ?? null;
      if (!teamId) {
        const { data: m } = await supabase.from('team_members').select('team_id')
          .eq('athlete_id', athleteProfile.id).is('left_at', null).limit(1).maybeSingle();
        teamId = m?.team_id ?? null;
      }
      if (scope === 'team' && !teamId) return res.status(400).json({ error: 'You must be on a team to post team-only content.' });

      const { data, error } = await supabase.from('team_feed').insert({
        team_id: teamId, athlete_id: athleteProfile.id, coach_id: null,
        feed_type: 'manual', body: postBody, scope,
        ...(image_url && { image_url }),
      }).select(`
        id, feed_type, body, scope, image_url, created_at, team_id, athlete_id, coach_id,
        athlete_profiles!athlete_id (id, name), coach_profiles!coach_id (id, name)
      `).single();
      if (error) { console.error('[community/posts] athlete insert error:', error.message); return res.status(400).json({ error: error.message }); }
      console.log(`[community/posts] athlete post created id=${data?.id}`);
      return res.json({ ...data, kudo_count: 0, i_kudoed: false });
    }

    const { data: coachProfile } = await supabase
      .from('coach_profiles').select('id')
      .eq('user_id', req.user!.id).maybeSingle();
    if (!coachProfile) return res.status(403).json({ error: 'Must be an athlete or coach to post.' });

    const { data: team } = await supabase.from('teams').select('id').eq('coach_id', coachProfile.id).maybeSingle();
    const teamId = team?.id ?? null;
    if (scope === 'team' && !teamId) return res.status(400).json({ error: 'You must have a team to post team-only content.' });

    const { data, error } = await supabase.from('team_feed').insert({
      team_id: teamId, athlete_id: null, coach_id: coachProfile.id,
      feed_type: 'manual', body: postBody, scope,
      ...(image_url && { image_url }),
    }).select(`
      id, feed_type, body, scope, image_url, created_at, team_id, athlete_id, coach_id,
      athlete_profiles!athlete_id (id, name), coach_profiles!coach_id (id, name)
    `).single();
    if (error) { console.error('[community/posts] coach insert error:', error.message); return res.status(400).json({ error: error.message }); }
    console.log(`[community/posts] coach post created id=${data?.id}`);
    return res.json({ ...data, kudo_count: 0, i_kudoed: false });
  })
);

// ── POST /api/community/posts/:id/kudos — toggle like (athletes + coaches) ───
router.post(
  '/posts/:id/kudos',
  auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id: postId } = req.params;

    const { data: athleteProfile } = await supabase
      .from('athlete_profiles').select('id').eq('user_id', req.user!.id).maybeSingle();
    const { data: coachProfile } = !athleteProfile
      ? await supabase.from('coach_profiles').select('id').eq('user_id', req.user!.id).maybeSingle()
      : { data: null };

    if (!athleteProfile && !coachProfile) return res.status(403).json({ error: 'Not authorized' });

    const athleteId = athleteProfile?.id ?? null;
    const coachId   = coachProfile?.id   ?? null;

    let existingQuery = supabase.from('feed_kudos').select('id').eq('feed_post_id', postId);
    if (athleteId) existingQuery = existingQuery.eq('athlete_id', athleteId);
    else           existingQuery = existingQuery.eq('coach_id', coachId!);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      await supabase.from('feed_kudos').delete().eq('id', existing.id);
      return res.json({ kudoed: false });
    }
    await supabase.from('feed_kudos').insert({
      feed_post_id: postId,
      ...(athleteId ? { athlete_id: athleteId } : { coach_id: coachId }),
    });
    return res.json({ kudoed: true });
  })
);

// ── GET /api/community/posts/:id/comments ─────────────────────────────────────
router.get(
  '/posts/:id/comments',
  auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id: postId } = req.params;
    const { data, error } = await supabase
      .from('post_comments').select('*')
      .eq('post_id', postId).order('created_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data ?? []);
  })
);

// ── POST /api/community/posts/:id/comments ───────────────────────────────────
router.post(
  '/posts/:id/comments',
  auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id: postId } = req.params;
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

    const { data: ap } = await supabase.from('athlete_profiles').select('id, name').eq('user_id', req.user!.id).maybeSingle();
    if (ap) {
      const { data, error } = await supabase.from('post_comments').insert({
        post_id: postId, author_id: ap.id, author_type: 'athlete',
        author_name: ap.name, content: content.trim(),
      }).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    const { data: cp } = await supabase.from('coach_profiles').select('id, name').eq('user_id', req.user!.id).maybeSingle();
    if (cp) {
      const { data, error } = await supabase.from('post_comments').insert({
        post_id: postId, author_id: cp.id, author_type: 'coach',
        author_name: cp.name, content: content.trim(),
      }).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    return res.status(403).json({ error: 'Must be an athlete or coach to comment.' });
  })
);

// ── DELETE /api/community/posts/:id ──────────────────────────────────────────
router.delete(
  '/posts/:id',
  auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id: postId } = req.params;

    const { data: ap } = await supabase.from('athlete_profiles').select('id').eq('user_id', req.user!.id).maybeSingle();
    const { data: cp } = !ap
      ? await supabase.from('coach_profiles').select('id').eq('user_id', req.user!.id).maybeSingle()
      : { data: null };

    const { data: post } = await supabase.from('team_feed').select('id, athlete_id, coach_id').eq('id', postId).maybeSingle();
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const isAuthor = (ap && post.athlete_id === ap.id) || (cp && post.coach_id === cp.id);
    if (!isAuthor) return res.status(403).json({ error: 'Not your post' });

    const { error } = await supabase.from('team_feed').delete().eq('id', postId);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ deleted: true });
  })
);

// ── PATCH /api/community/posts/:id ───────────────────────────────────────────
router.patch(
  '/posts/:id',
  auth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id: postId } = req.params;
    const { body: newBody } = req.body;
    if (!newBody?.trim()) return res.status(400).json({ error: 'Content required' });

    const { data: ap } = await supabase.from('athlete_profiles').select('id').eq('user_id', req.user!.id).maybeSingle();
    const { data: cp } = !ap
      ? await supabase.from('coach_profiles').select('id').eq('user_id', req.user!.id).maybeSingle()
      : { data: null };

    const { data: post } = await supabase.from('team_feed').select('id, athlete_id, coach_id').eq('id', postId).maybeSingle();
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const isAuthor = (ap && post.athlete_id === ap.id) || (cp && post.coach_id === cp.id);
    if (!isAuthor) return res.status(403).json({ error: 'Not your post' });

    const { data, error } = await supabase.from('team_feed')
      .update({ body: newBody.trim() }).eq('id', postId).select('id, body').single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  })
);

// ── GET /api/community/top-athletes ──────────────────────────────────────────
router.get(
  '/top-athletes',
  auth,
  asyncHandler(async (_req: AuthRequest, res) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('athlete_activities')
      .select('athlete_id, distance_miles, athlete_profiles!athlete_id(id, name)')
      .gte('activity_date', since);
    if (error) return res.json([]);

    const totals: Record<string, { id: string; name: string; weekly_miles: number }> = {};
    for (const row of data ?? []) {
      const profile = Array.isArray(row.athlete_profiles) ? row.athlete_profiles[0] : row.athlete_profiles;
      if (!profile) continue;
      if (!totals[row.athlete_id]) totals[row.athlete_id] = { id: profile.id, name: profile.name, weekly_miles: 0 };
      totals[row.athlete_id].weekly_miles += row.distance_miles ?? 0;
    }
    const sorted = Object.values(totals)
      .map(a => ({ ...a, weekly_miles: Math.round(a.weekly_miles * 10) / 10 }))
      .sort((a, b) => b.weekly_miles - a.weekly_miles)
      .slice(0, 10);
    return res.json(sorted);
  })
);

export default router;
