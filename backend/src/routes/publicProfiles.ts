import { Router } from 'express';
import { supabase } from '../db/supabase';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// ── GET /api/public/athlete/:username ─────────────────────────────────────────
router.get('/athlete/:username', asyncHandler(async (req, res) => {
  const { username } = req.params;

  const { data: athlete } = await supabase
    .from('athlete_profiles')
    .select('id, name, username, primary_events, weekly_volume_miles, pr_mile, pr_5k, public_sections, avatar_url')
    .eq('username', username)
    .single();

  if (!athlete) return res.status(404).json({ error: 'Athlete not found' });

  const sections = (athlete.public_sections as any) ?? { races: true, stats: true, milestones: true };

  // Team / coach info
  const { data: teamMember } = await supabase
    .from('team_members')
    .select('team_id, teams!team_id(name, coach_id, coach_profiles!coach_id(id, name, username))')
    .eq('athlete_id', athlete.id)
    .is('left_at', null)
    .order('joined_at', { ascending: false })
    .limit(1)
    .single();

  const teamName = (teamMember as any)?.teams?.name ?? null;
  const coachName = (teamMember as any)?.teams?.coach_profiles?.name ?? null;
  const coachUsername = (teamMember as any)?.teams?.coach_profiles?.username ?? null;

  // Race history (only if public)
  let races: any[] = [];
  if (sections.races) {
    const { data } = await supabase
      .from('race_results')
      .select('id, race_name, distance, finish_time, race_date, is_pr, share_card_url')
      .eq('athlete_id', athlete.id)
      .order('race_date', { ascending: false })
      .limit(20);
    races = data ?? [];
  }

  // Stats (only if public)
  let stats: Record<string, unknown> = {};
  if (sections.stats) {
    const { data: activities } = await supabase
      .from('athlete_activities')
      .select('distance_miles, start_date')
      .eq('athlete_id', athlete.id);

    const totalMiles = (activities ?? []).reduce((s: number, a: any) => s + (a.distance_miles ?? 0), 0);

    // Training streak (consecutive days with activity)
    const actDates = new Set((activities ?? []).map((a: any) => a.start_date?.slice(0, 10)));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (actDates.has(d.toISOString().slice(0, 10))) streak++;
      else break;
    }

    stats = {
      total_miles: Math.round(totalMiles),
      activity_count: (activities ?? []).length,
      streak_days: streak,
    };
  }

  // Milestones (only if public)
  let milestones: any[] = [];
  if (sections.milestones) {
    const { data } = await supabase
      .from('milestones')
      .select('milestone_type, label, value, earned_at')
      .eq('athlete_id', athlete.id)
      .order('earned_at', { ascending: false })
      .limit(10);
    milestones = data ?? [];
  }

  return res.json({
    id: athlete.id,
    name: athlete.name,
    username: athlete.username,
    primary_events: athlete.primary_events,
    pr_mile: athlete.pr_mile,
    pr_5k: athlete.pr_5k,
    team_name: teamName,
    coach_name: coachName,
    coach_username: coachUsername,
    races,
    stats,
    milestones,
    public_sections: sections,
  });
}));

// ── GET /api/public/coach/:username ───────────────────────────────────────────
router.get('/coach/:username', asyncHandler(async (req, res) => {
  const { username } = req.params;

  const { data: coach } = await supabase
    .from('coach_profiles')
    .select('id, name, username, specialization, philosophy, license_type, avatar_url')
    .eq('username', username)
    .single();

  if (!coach) return res.status(404).json({ error: 'Coach not found' });

  // Team info
  const { data: team } = await supabase
    .from('teams')
    .select('id, name')
    .eq('coach_id', coach.id)
    .single();

  // Athlete count
  const { count: athleteCount } = await supabase
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', team?.id ?? '')
    .is('left_at', null);

  // Marketplace listing
  const { data: listing } = await supabase
    .from('marketplace_listings')
    .select('id, tagline, price_monthly, price_annual, is_active')
    .eq('coach_id', coach.id)
    .eq('is_active', true)
    .single();

  return res.json({
    id: coach.id,
    name: coach.name,
    username: coach.username,
    specialization: coach.specialization,
    philosophy: coach.philosophy,
    license_type: coach.license_type,
    team_name: team?.name ?? null,
    athlete_count: athleteCount ?? 0,
    marketplace: listing ?? null,
  });
}));

export default router;
