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
  if (error) {
    const msg = error.message?.toLowerCase().includes('schema cache') || error.message?.toLowerCase().includes('does not exist')
      ? 'Follow feature requires a one-time database migration. Please contact support or run Migration 036 in your Supabase SQL editor.'
      : error.message;
    return res.status(400).json({ error: msg });
  }

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

// ── GET /api/social/friends-feed — recent runs from mutual friends only ────────
router.get('/friends-feed', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const callerId = await getAthleteId(req.user!.id);
  if (!callerId) return res.json([]);

  // People I follow
  const { data: iFollow } = await supabase
    .from('athlete_follows')
    .select('following_id')
    .eq('follower_id', callerId);

  const iFollowSet = new Set((iFollow ?? []).map((f: any) => f.following_id));
  if (iFollowSet.size === 0) return res.json([]);

  // People who follow me back — mutual friends only
  const { data: followMe } = await supabase
    .from('athlete_follows')
    .select('follower_id')
    .eq('following_id', callerId)
    .in('follower_id', [...iFollowSet]);

  const friendIds = (followMe ?? []).map((f: any) => f.follower_id);
  if (friendIds.length === 0) return res.json([]);

  const { data, error } = await supabase
    .from('athlete_activities')
    .select(`
      id, name, start_date, distance_meters, moving_time_seconds,
      elapsed_time_seconds, average_speed, average_heartrate, max_heartrate,
      total_elevation_gain, activity_type, source, athlete_id, raw_data,
      athlete_profiles!athlete_id(id, name, username, avatar_url)
    `)
    .in('athlete_id', friendIds)
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

// ── GET /api/social/follow-notifications — recent followers with timestamps ────
router.get('/follow-notifications', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const callerId = await getAthleteId(req.user!.id);
  if (!callerId) return res.json([]);

  const { data, error } = await supabase
    .from('athlete_follows')
    .select('id, created_at, follower_id, athlete_profiles!follower_id(id, name, username, avatar_url)')
    .eq('following_id', callerId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) return res.json([]); // table may not exist yet — degrade gracefully

  const notifs = (data ?? []).map((row: any) => {
    const p = Array.isArray(row.athlete_profiles) ? row.athlete_profiles[0] : row.athlete_profiles;
    return p ? { ...p, followed_at: row.created_at } : null;
  }).filter(Boolean);

  return res.json(notifs);
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

// ── POST /api/social/contacts-match — find Laktic users from contact list ─────
router.post('/contacts-match', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const { contacts } = req.body;
  if (!Array.isArray(contacts) || contacts.length === 0) return res.json({ matches: [], nonMatches: [] });

  const callerId = await getAthleteId(req.user!.id);

  // Extract unique emails from contacts (limit to 50 contacts)
  interface ContactInfo { name: string; email: string; phone?: string }
  const contactMap = new Map<string, ContactInfo>();
  for (const c of contacts.slice(0, 50)) {
    const rawEmail = Array.isArray(c.email) ? c.email[0] : c.email;
    const email = (rawEmail ?? '').toLowerCase().trim();
    if (email && email.includes('@') && !contactMap.has(email)) {
      const rawName = Array.isArray(c.name) ? c.name[0] : c.name;
      const rawPhone = Array.isArray(c.tel) ? c.tel[0] : (c.phone ?? c.tel);
      contactMap.set(email, { name: rawName ?? email, email, phone: rawPhone });
    }
  }

  const emails = Array.from(contactMap.keys());
  if (emails.length === 0) return res.json({ matches: [], nonMatches: [] });

  // Look up auth users by email — fetch all users and filter locally
  // (Supabase v2 admin API does not expose a getUserByEmail method)
  const emailSet = new Set(emails);
  const matchedUserIds: string[] = [];
  const matchedEmails = new Set<string>();

  try {
    const { data: listData } = await (supabase.auth as any).admin.listUsers({ page: 1, perPage: 1000 });
    for (const user of listData?.users ?? []) {
      const e = user.email?.toLowerCase();
      if (e && emailSet.has(e)) {
        matchedUserIds.push(user.id);
        matchedEmails.add(e);
      }
    }
  } catch {
    // admin API unavailable — return no matches, invite-only mode
  }

  // Fetch profiles for matched users, excluding caller
  let profiles: any[] = [];
  if (matchedUserIds.length > 0) {
    let q = supabase
      .from('athlete_profiles')
      .select('id, name, username, avatar_url, user_id')
      .in('user_id', matchedUserIds);
    if (callerId) q = q.neq('id', callerId);
    const { data } = await q;
    profiles = data ?? [];
  }

  // Attach is_following flag
  let followingSet = new Set<string>();
  if (callerId) {
    const { data: follows } = await supabase
      .from('athlete_follows').select('following_id').eq('follower_id', callerId);
    followingSet = new Set((follows ?? []).map((f: any) => f.following_id));
  }

  const matches = profiles.map(p => ({ ...p, is_following: followingSet.has(p.id) }));
  const nonMatches = emails
    .filter(e => !matchedEmails.has(e))
    .map(e => contactMap.get(e)!);

  return res.json({ matches, nonMatches });
}));

// ── GET /api/social/suggestions — active athletes not yet followed ─────────────
router.get('/suggestions', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const callerId = await getAthleteId(req.user!.id);

  const { data: follows } = callerId
    ? await supabase.from('athlete_follows').select('following_id').eq('follower_id', callerId)
    : { data: [] };

  const excludeIds = [
    ...(follows ?? []).map((f: any) => f.following_id),
    ...(callerId ? [callerId] : []),
  ];

  let query = supabase
    .from('athlete_profiles')
    .select('id, name, username, avatar_url')
    .not('username', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (excludeIds.length > 0) {
    // PostgREST NOT IN: comma-separated UUIDs, no quotes
    query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  }

  const { data } = await query;
  return res.json(data ?? []);
}));

export default router;
