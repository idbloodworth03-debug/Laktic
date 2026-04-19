import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireCoach, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const challengeCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  target_value: z.number().positive(),
  target_unit: z.string().min(1).max(50),
  metric: z.enum(['miles', 'workouts', 'hours', 'elevation_ft']).default('miles'),
  sport_emoji: z.string().max(10).optional(),
  ends_at: z.string().min(1)
});

// GET /api/challenges — list active challenges visible to the athlete
router.get(
  '/',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const now = new Date().toISOString();

    const { data: challenges, error } = await supabase
      .from('challenges')
      .select(`
        id, title, description, target_value, target_unit, metric, sport_emoji,
        starts_at, ends_at, is_active,
        challenge_participants (athlete_id)
      `)
      .eq('is_active', true)
      .gte('ends_at', now)
      .order('ends_at', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });

    // Fetch athlete's own activities for progress calculation (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: activities } = await supabase
      .from('athlete_activities')
      .select('start_date, distance_miles, elapsed_time_seconds')
      .eq('athlete_id', req.athlete.id)
      .gte('start_date', ninetyDaysAgo.toISOString());

    const enriched = (challenges || []).map((ch: any) => {
      const participants = Array.isArray(ch.challenge_participants) ? ch.challenge_participants : [];
      const joined = participants.some((p: any) => p.athlete_id === req.athlete.id);

      // Calculate progress for joined challenges
      let myProgress = 0;
      if (joined && activities) {
        const challengeStart = new Date(ch.starts_at);
        const relevantActivities = activities.filter((a: any) => new Date(a.start_date) >= challengeStart);
        if (ch.metric === 'miles') {
          myProgress = relevantActivities.reduce((sum: number, a: any) => sum + (a.distance_miles || 0), 0);
        } else if (ch.metric === 'workouts') {
          myProgress = relevantActivities.length;
        } else if (ch.metric === 'hours') {
          myProgress = relevantActivities.reduce((sum: number, a: any) => sum + (a.elapsed_time_seconds || 0) / 3600, 0);
        }
      }

      const daysRemaining = Math.max(0, Math.ceil((new Date(ch.ends_at).getTime() - Date.now()) / 86400000));
      const pctComplete = ch.target_value > 0 ? Math.min(100, Math.round((myProgress / ch.target_value) * 100)) : 0;

      return {
        id: ch.id,
        title: ch.title,
        description: ch.description,
        target_value: ch.target_value,
        target_unit: ch.target_unit,
        metric: ch.metric,
        sport_emoji: ch.sport_emoji ?? '',
        starts_at: ch.starts_at,
        ends_at: ch.ends_at,
        participant_count: participants.length,
        days_remaining: daysRemaining,
        joined,
        my_progress: Math.round(myProgress * 10) / 10,
        pct_complete: pctComplete
      };
    });

    res.json(enriched);
  })
);

// POST /api/challenges — create a challenge (coach only)
router.post(
  '/',
  auth,
  requireCoach,
  validate(challengeCreateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { title, description, target_value, target_unit, metric, sport_emoji, ends_at } = req.body;

    const { data, error } = await supabase
      .from('challenges')
      .insert({
        coach_id: req.coach.id,
        title,
        description: description || null,
        target_value,
        target_unit,
        metric: metric || 'miles',
        sport_emoji: sport_emoji || '',
        ends_at
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  })
);

// POST /api/challenges/:id/join — athlete joins a challenge
router.post(
  '/:id/join',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    // Verify challenge exists and is active
    const { data: challenge } = await supabase
      .from('challenges')
      .select('id, is_active, ends_at')
      .eq('id', id)
      .single();

    if (!challenge) return res.status(404).json({ error: 'Challenge not found.' });
    if (!challenge.is_active || new Date(challenge.ends_at) < new Date()) {
      return res.status(400).json({ error: 'This challenge is no longer active.' });
    }

    const { error } = await supabase
      .from('challenge_participants')
      .insert({ challenge_id: id, athlete_id: req.athlete.id });

    if (error && error.code === '23505') {
      return res.status(400).json({ error: 'You have already joined this challenge.' });
    }
    if (error) return res.status(400).json({ error: error.message });

    res.json({ joined: true });
  })
);

// GET /api/challenges/:id/leaderboard
router.get(
  '/:id/leaderboard',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const { data: challenge } = await supabase
      .from('challenges')
      .select('id, title, target_value, target_unit, metric, starts_at, ends_at')
      .eq('id', id)
      .single();

    if (!challenge) return res.status(404).json({ error: 'Challenge not found.' });

    const { data: participants } = await supabase
      .from('challenge_participants')
      .select('athlete_id, athlete_profiles!athlete_id (id, name)')
      .eq('challenge_id', id);

    if (!participants || participants.length === 0) {
      return res.json({ challenge, leaderboard: [] });
    }

    const athleteIds = participants.map((p: any) => p.athlete_id);

    // Fetch activities since challenge start
    const { data: activities } = await supabase
      .from('athlete_activities')
      .select('athlete_id, distance_miles, elapsed_time_seconds, start_date')
      .in('athlete_id', athleteIds)
      .gte('start_date', challenge.starts_at);

    const progressMap: Record<string, number> = {};
    for (const a of activities || []) {
      if (!progressMap[a.athlete_id]) progressMap[a.athlete_id] = 0;
      if (challenge.metric === 'miles') {
        progressMap[a.athlete_id] += a.distance_miles || 0;
      } else if (challenge.metric === 'workouts') {
        progressMap[a.athlete_id] += 1;
      } else if (challenge.metric === 'hours') {
        progressMap[a.athlete_id] += (a.elapsed_time_seconds || 0) / 3600;
      }
    }

    const leaderboard = participants
      .map((p: any) => {
        const progress = progressMap[p.athlete_id] || 0;
        const pctComplete = challenge.target_value > 0
          ? Math.min(100, Math.round((progress / challenge.target_value) * 100))
          : 0;
        return {
          athlete_id: p.athlete_id,
          name: (p.athlete_profiles as any)?.name ?? 'Unknown',
          progress: Math.round(progress * 10) / 10,
          pct_complete: pctComplete
        };
      })
      .sort((a: any, b: any) => b.progress - a.progress)
      .map((entry: any, i: number) => ({ ...entry, rank: i + 1 }));

    res.json({ challenge, leaderboard });
  })
);

export default router;
