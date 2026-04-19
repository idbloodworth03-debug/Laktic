import { Router, Response } from 'express';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';
import { computeReadiness } from '../utils/readinessEngine';

const router = Router();

const ATL_TC = 7;
const CTL_TC = 42;

function computeLoads(activities: { date: string; load: number }[]) {
  if (activities.length === 0) return [];

  const sorted = [...activities].sort((a, b) => a.date.localeCompare(b.date));
  const startDate = new Date(sorted[0].date);
  const endDate = new Date();

  const loadByDate: Record<string, number> = {};
  for (const a of sorted) loadByDate[a.date] = (loadByDate[a.date] ?? 0) + a.load;

  const result: { date: string; atl: number; ctl: number; tsb: number; load: number }[] = [];
  let atl = 0;
  let ctl = 0;

  const kAtl = 1 - Math.exp(-1 / ATL_TC);
  const kCtl = 1 - Math.exp(-1 / CTL_TC);

  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    const load = loadByDate[dateStr] ?? 0;

    atl = atl + kAtl * (load - atl);
    ctl = ctl + kCtl * (load - ctl);
    const tsb = ctl - atl;

    result.push({
      date: dateStr,
      atl: Math.round(atl * 10) / 10,
      ctl: Math.round(ctl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
      load,
    });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

router.get('/loads', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase
    .from('athlete_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  if (!profile) return res.status(403).json({ error: 'Athlete only' });

  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: activities, error } = await supabase
    .from('athlete_activities')
    .select('start_date, moving_time_seconds, distance_meters')
    .eq('athlete_id', profile.id)
    .gte('start_date', cutoff)
    .order('start_date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const withLoad = (activities ?? []).map(a => ({
    date: (a.start_date as string).split('T')[0],
    load: Math.round(((a.moving_time_seconds ?? 0) / 60) * 1.2),
  }));

  const loads = computeLoads(withLoad);
  res.json({ loads });
});

router.get('/weekly', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase
    .from('athlete_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  if (!profile) return res.status(403).json({ error: 'Athlete only' });

  const weeks = parseInt(req.query.weeks as string) || 12;
  const cutoff = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: activities, error } = await supabase
    .from('athlete_activities')
    .select('start_date, moving_time_seconds, distance_meters, activity_type')
    .eq('athlete_id', profile.id)
    .gte('start_date', cutoff)
    .order('start_date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const byWeek: Record<string, { week: string; km: number; minutes: number; count: number }> = {};
  for (const a of activities ?? []) {
    const d = new Date((a.start_date as string).split('T')[0]);
    const dayOfWeek = d.getDay();
    const mondayOffset = (dayOfWeek + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - mondayOffset);
    const weekKey = monday.toISOString().split('T')[0];

    if (!byWeek[weekKey]) byWeek[weekKey] = { week: weekKey, km: 0, minutes: 0, count: 0 };
    byWeek[weekKey].km += (a.distance_meters ?? 0) / 1000;
    byWeek[weekKey].minutes += (a.moving_time_seconds ?? 0) / 60;
    byWeek[weekKey].count += 1;
  }

  res.json(Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week)));
});

router.get('/coach/:athleteId', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: coach } = await supabase.from('coach_profiles').select('id').eq('user_id', userId).single();
  if (!coach) return res.status(403).json({ error: 'Coach only' });

  const { data: activities, error } = await supabase
    .from('athlete_activities')
    .select('start_date, moving_time_seconds, distance_meters')
    .eq('athlete_id', req.params.athleteId)
    .gte('start_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .order('start_date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const withLoad = (activities ?? []).map(a => ({
    date: (a.start_date as string).split('T')[0],
    load: Math.round(((a.moving_time_seconds ?? 0) / 60) * 1.2),
  }));

  res.json({ loads: computeLoads(withLoad) });
});

// GET /api/training-analytics/insights — readiness + latest Pace message
router.get('/insights', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase
    .from('athlete_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  if (!profile) return res.status(403).json({ error: 'Athlete only' });

  const athleteId = profile.id;

  // Fetch readiness
  const readiness = await computeReadiness(athleteId, supabase);

  // Fetch most recent assistant (Pace) message from any active season
  const { data: season } = await supabase
    .from('athlete_seasons')
    .select('id')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let paceMessage: string | null = null;
  let paceMessageAt: string | null = null;

  if (season) {
    const { data: msg } = await supabase
      .from('chat_messages')
      .select('content, created_at')
      .eq('season_id', season.id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (msg) {
      paceMessage = msg.content as string;
      paceMessageAt = msg.created_at as string;
    }
  }

  res.json({ readiness, paceMessage, paceMessageAt });
});

export default router;
