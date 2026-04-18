import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Resolve the caller's athlete profile id
async function getAthleteId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('athlete_profiles').select('id').eq('user_id', userId).maybeSingle();
  return data?.id ?? null;
}

// ── GET /api/social/search?q=:term ───────────────────────────────────────────
router.get('/search', auth, asyncHandler(async (req: AuthRequest, res) => {
  const q = (req.query.q as string ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!q || q.length < 1) return res.json([]);

  const callerId = await getAthleteId(req.user!.id);

  const { data, error } = await supabase
    .from('athlete_profiles')
    .select('id, name, username, avatar_url')
    .not('username', 'is', null)
    .ilike('username', `%${q}%`)
    .limit(20);

  if (error) return res.status(400).json({ error: error.message });

  // Attach whether caller already follows each result
  let followingSet = new Set<string>();
  if (callerId) {
    const { data: follows } = await supabase
      .from('athlete_follows')
      .select('following_id')
      .eq('follower_id', callerId);
    followingSet = new Set((follows ?? []).map((f: any) => f.following_id));
  }

  const results = (data ?? [])
    .filter(a => a.id !== callerId)
    .map(a => ({ ...a, is_following: followingSet.has(a.id) }));

  return res.json(results);
}));

// ── POST /api/social/follow/:athleteId — toggle follow ────────────────────────
router.post('/follow/:athleteId', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const followerId = await getAthleteId(req.user!.id);
  if (!followerId) return res.status(403).json({ error: 'Athlete profile not found' });

  const { athleteId: followingId } = req.params;
  if (followerId === followingId) return res.status(400).json({ error: 'Cannot follow yourself' });

  const { data: existing } = await supabase
    .from('athlete_follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();

  if (existing) {
    await supabase.from('athlete_follows').delete().eq('id', existing.id);
    return res.json({ following: false });
  }

  const { error } = await supabase
    .from('athlete_follows')
    .insert({ follower_id: followerId, following_id: followingId });
  if (error) return res.status(400).json({ error: error.message });

  return res.json({ following: true });
}));

// ── GET /api/social/following — list who caller follows ───────────────────────
router.get('/following', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const callerId = await getAthleteId(req.user!.id);
  if (!callerId) return res.json([]);

  const { data, error } = await supabase
    .from('athlete_follows')
    .select('following_id, athlete_profiles!following_id(id, name, username, avatar_url)')
    .eq('follower_id', callerId)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  const list = (data ?? []).map((row: any) => {
    const p = Array.isArray(row.athlete_profiles) ? row.athlete_profiles[0] : row.athlete_profiles;
    return p ?? null;
  }).filter(Boolean);

  return res.json(list);
}));

// ── GET /api/social/friends-feed — recent runs from people I follow ───────────
router.get('/friends-feed', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const callerId = await getAthleteId(req.user!.id);
  if (!callerId) return res.json([]);

  // Who do I follow?
  const { data: follows } = await supabase
    .from('athlete_follows')
    .select('following_id')
    .eq('follower_id', callerId);

  const ids = (follows ?? []).map((f: any) => f.following_id);
  if (ids.length === 0) return res.json([]);

  const { data, error } = await supabase
    .from('athlete_activities')
    .select(`
      id, name, start_date, distance_meters, moving_time_seconds,
      average_speed, activity_type, athlete_id,
      athlete_profiles!athlete_id(id, name, username, avatar_url)
    `)
    .in('athlete_id', ids)
    .ilike('activity_type', '%run%')
    .order('start_date', { ascending: false })
    .limit(40);

  if (error) return res.status(400).json({ error: error.message });

  const activities = (data ?? []).map((row: any) => {
    const p = Array.isArray(row.athlete_profiles) ? row.athlete_profiles[0] : row.athlete_profiles;
    return { ...row, athlete: p, athlete_profiles: undefined };
  });

  return res.json(activities);
}));

// ── GET /api/social/followers — who follows me ────────────────────────────────
router.get('/followers', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const callerId = await getAthleteId(req.user!.id);
  if (!callerId) return res.json([]);

  const { data, error } = await supabase
    .from('athlete_follows')
    .select('follower_id, athlete_profiles!follower_id(id, name, username, avatar_url)')
    .eq('following_id', callerId)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  const list = (data ?? []).map((row: any) => {
    const p = Array.isArray(row.athlete_profiles) ? row.athlete_profiles[0] : row.athlete_profiles;
    return p ?? null;
  }).filter(Boolean);

  return res.json(list);
}));

// ── GET /api/social/is-following/:athleteId ───────────────────────────────────
router.get('/is-following/:athleteId', auth, asyncHandler(async (req: AuthRequest, res) => {
  const callerId = await getAthleteId(req.user!.id);
  if (!callerId) return res.json({ following: false });

  const { data } = await supabase
    .from('athlete_follows')
    .select('id')
    .eq('follower_id', callerId)
    .eq('following_id', req.params.athleteId)
    .maybeSingle();

  return res.json({ following: !!data });
}));

export default router;
