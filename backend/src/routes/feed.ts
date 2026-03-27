import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { feedPostSchema } from '../schemas';

const router = Router();

// GET /api/athlete/feed — paginated team feed (last 50 posts)
router.get(
  '/feed',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    // Find athlete's team
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

    if (!membership) return res.json([]);

    const { data: posts, error } = await supabase
      .from('team_feed')
      .select(`
        id, feed_type, body, created_at, activity_id, race_result_id,
        athlete_profiles!athlete_id (id, name),
        feed_kudos (id, athlete_id)
      `)
      .eq('team_id', membership.team_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(400).json({ error: error.message });

    // Annotate each post with kudo count + whether current athlete gave kudos
    const enriched = (posts || []).map(post => ({
      ...post,
      kudo_count: Array.isArray(post.feed_kudos) ? post.feed_kudos.length : 0,
      i_kudoed: Array.isArray(post.feed_kudos)
        ? post.feed_kudos.some((k: any) => k.athlete_id === req.athlete.id)
        : false,
      feed_kudos: undefined
    }));

    res.json(enriched);
  })
);

// POST /api/athlete/feed — manual post to team feed
router.post(
  '/feed',
  auth,
  requireAthlete,
  validate(feedPostSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { body: postBody } = req.body;

    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

    if (!membership) return res.status(400).json({ error: 'You are not on an active team.' });

    const { data, error } = await supabase
      .from('team_feed')
      .insert({
        team_id: membership.team_id,
        athlete_id: req.athlete.id,
        feed_type: 'manual',
        body: postBody
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// POST /api/athlete/feed/:postId/kudos — toggle kudos on a post
router.post(
  '/feed/:postId/kudos',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { postId } = req.params;

    // Verify post is visible to this athlete (same team)
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

    if (!membership) return res.status(403).json({ error: 'Not on a team' });

    const { data: post } = await supabase
      .from('team_feed')
      .select('id, team_id')
      .eq('id', postId)
      .eq('team_id', membership.team_id)
      .single();

    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check existing kudo
    const { data: existing } = await supabase
      .from('feed_kudos')
      .select('id')
      .eq('feed_post_id', postId)
      .eq('athlete_id', req.athlete.id)
      .single();

    if (existing) {
      // Remove kudo
      await supabase.from('feed_kudos').delete().eq('id', existing.id);
      return res.json({ kudoed: false });
    } else {
      // Add kudo
      await supabase.from('feed_kudos').insert({ feed_post_id: postId, athlete_id: req.athlete.id });
      return res.json({ kudoed: true });
    }
  })
);

// GET /api/athlete/team/leaderboard — weekly miles + streak per team member
router.get(
  '/team/leaderboard',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

    if (!membership) return res.json([]);

    // Get all active members on the team
    const { data: members } = await supabase
      .from('team_members')
      .select('athlete_id, athlete_profiles!athlete_id (id, name)')
      .eq('team_id', membership.team_id)
      .eq('status', 'active');

    if (!members || members.length === 0) return res.json([]);

    const athleteIds = members.map((m: any) => m.athlete_id);

    // Current week window (Monday 00:00 UTC to now)
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - daysToMonday);
    weekStart.setUTCHours(0, 0, 0, 0);

    // Weekly miles per athlete
    const { data: weeklyActivities } = await supabase
      .from('athlete_activities')
      .select('athlete_id, distance_miles')
      .in('athlete_id', athleteIds)
      .gte('start_date', weekStart.toISOString())
      .not('distance_miles', 'is', null);

    // Build miles map
    const milesMap: Record<string, number> = {};
    for (const a of weeklyActivities || []) {
      milesMap[a.athlete_id] = (milesMap[a.athlete_id] || 0) + (a.distance_miles || 0);
    }

    // Streak: consecutive days with at least one activity ending today
    const streakStart = new Date(now);
    streakStart.setUTCDate(now.getUTCDate() - 30); // look back 30 days max

    const { data: recentActivities } = await supabase
      .from('athlete_activities')
      .select('athlete_id, start_date')
      .in('athlete_id', athleteIds)
      .gte('start_date', streakStart.toISOString())
      .order('start_date', { ascending: false });

    // Compute streak per athlete
    const streakMap: Record<string, number> = {};
    for (const athleteId of athleteIds) {
      const days = new Set(
        (recentActivities || [])
          .filter((a: any) => a.athlete_id === athleteId)
          .map((a: any) => a.start_date.slice(0, 10))
      );
      let streak = 0;
      const check = new Date(now);
      check.setUTCHours(0, 0, 0, 0);
      while (days.has(check.toISOString().slice(0, 10))) {
        streak++;
        check.setUTCDate(check.getUTCDate() - 1);
      }
      streakMap[athleteId] = streak;
    }

    // Assemble leaderboard sorted by miles desc
    const leaderboard = members
      .map((m: any) => ({
        athlete_id: m.athlete_id,
        name: m.athlete_profiles?.name ?? 'Unknown',
        weekly_miles: Math.round((milesMap[m.athlete_id] || 0) * 10) / 10,
        streak_days: streakMap[m.athlete_id] || 0
      }))
      .sort((a: any, b: any) => b.weekly_miles - a.weekly_miles)
      .map((entry: any, i: number) => ({ ...entry, rank: i + 1 }));

    res.json(leaderboard);
  })
);

export default router;
