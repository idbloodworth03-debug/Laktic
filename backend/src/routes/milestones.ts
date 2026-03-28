import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Detect milestones from recent activity data for an athlete
async function detectMilestones(athleteId: string): Promise<Array<{ label: string; milestone_type: string; value: number }>> {
  const detected: Array<{ label: string; milestone_type: string; value: number }> = [];

  // --- Streak: consecutive days with at least one activity ---
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: recentActivities } = await supabase
    .from('athlete_activities')
    .select('start_date, distance_miles')
    .eq('athlete_id', athleteId)
    .gte('start_date', thirtyDaysAgo.toISOString())
    .order('start_date', { ascending: false });

  if (recentActivities && recentActivities.length > 0) {
    const activityDays = new Set(recentActivities.map((a: any) => a.start_date.slice(0, 10)));
    let streak = 0;
    const check = new Date();
    check.setUTCHours(0, 0, 0, 0);
    while (activityDays.has(check.toISOString().slice(0, 10))) {
      streak++;
      check.setDate(check.getDate() - 1);
    }
    // Milestone thresholds for streaks
    for (const threshold of [7, 14, 21, 30]) {
      if (streak === threshold) {
        detected.push({ label: `${threshold}-day training streak`, milestone_type: 'streak', value: threshold });
      }
    }

    // --- Weekly distance milestone ---
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - daysToMonday);
    weekStart.setUTCHours(0, 0, 0, 0);

    const weeklyMiles = (recentActivities || [])
      .filter((a: any) => new Date(a.start_date) >= weekStart && a.distance_miles)
      .reduce((sum: number, a: any) => sum + (a.distance_miles || 0), 0);

    for (const threshold of [20, 30, 40, 50, 60, 70, 80]) {
      const prev = threshold - 10;
      if (weeklyMiles >= threshold && weeklyMiles < threshold + 10) {
        // Check if this is a first time hitting this threshold
        const { data: existing } = await supabase
          .from('milestones')
          .select('id')
          .eq('athlete_id', athleteId)
          .eq('milestone_type', 'distance')
          .eq('value', threshold)
          .single();
        if (!existing) {
          detected.push({ label: `First ${threshold}-mile week`, milestone_type: 'distance', value: threshold });
        }
        break;
      }
      void prev; // suppress unused warning
    }
  }

  // --- Race count milestone ---
  const { count: raceCount } = await supabase
    .from('race_results')
    .select('id', { count: 'exact', head: true })
    .eq('athlete_id', athleteId);

  for (const threshold of [1, 5, 10, 25, 50]) {
    if (raceCount === threshold) {
      const { data: existing } = await supabase
        .from('milestones')
        .select('id')
        .eq('athlete_id', athleteId)
        .eq('milestone_type', 'race_count')
        .eq('value', threshold)
        .single();
      if (!existing) {
        const label = threshold === 1 ? 'First race logged' : `${threshold} races completed`;
        detected.push({ label, milestone_type: 'race_count', value: threshold });
      }
    }
  }

  return detected;
}

// POST /api/milestones/check — detect and persist new milestones
router.post(
  '/check',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const newMilestones = await detectMilestones(req.athlete.id);

    if (newMilestones.length > 0) {
      const inserts = newMilestones.map(m => ({
        athlete_id: req.athlete.id,
        label: m.label,
        milestone_type: m.milestone_type,
        value: m.value
      }));

      // Upsert by athlete_id + milestone_type + value to avoid duplicates
      await supabase
        .from('milestones')
        .upsert(inserts, { onConflict: 'athlete_id,milestone_type,value', ignoreDuplicates: true });
    }

    // Return all unshared milestones for the athlete
    const { data: unshared } = await supabase
      .from('milestones')
      .select('id, label, milestone_type, value, created_at')
      .eq('athlete_id', req.athlete.id)
      .is('shared_at', null)
      .order('created_at', { ascending: false });

    res.json({ milestones: unshared || [] });
  })
);

// GET /api/milestones — list athlete's milestones
router.get(
  '/',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data, error } = await supabase
      .from('milestones')
      .select('id, label, milestone_type, value, shared_at, created_at')
      .eq('athlete_id', req.athlete.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  })
);

// POST /api/milestones/:id/share — share a milestone to the community feed
router.post(
  '/:id/share',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const { data: milestone, error: fetchError } = await supabase
      .from('milestones')
      .select('id, label, shared_at')
      .eq('id', id)
      .eq('athlete_id', req.athlete.id)
      .single();

    if (fetchError || !milestone) return res.status(404).json({ error: 'Milestone not found.' });
    if (milestone.shared_at) return res.status(400).json({ error: 'Already shared.' });

    // Resolve team for the feed post
    const activeTeamId = req.athlete.active_team_id ?? null;
    let teamId = activeTeamId;
    if (!teamId) {
      const { data: membership } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('athlete_id', req.athlete.id)
        .is('left_at', null)
        .limit(1)
        .single();
      teamId = membership?.team_id ?? null;
    }

    if (!teamId) return res.status(400).json({ error: 'You must be on a team to share milestones.' });

    // Create feed post
    await supabase.from('team_feed').insert({
      team_id: teamId,
      athlete_id: req.athlete.id,
      feed_type: 'milestone',
      body: `⭐ Milestone unlocked: ${milestone.label}`,
      scope: 'public'
    });

    // Mark as shared
    await supabase
      .from('milestones')
      .update({ shared_at: new Date().toISOString() })
      .eq('id', id);

    res.json({ shared: true });
  })
);

export default router;
