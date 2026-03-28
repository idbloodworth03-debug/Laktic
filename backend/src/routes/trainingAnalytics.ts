import { Router, Response } from 'express';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';

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
    .select('id, subscription_tier')
    .eq('user_id', userId)
    .single();
  if (!profile) return res.status(403).json({ error: 'Athlete only' });

  const cutoff = profile.subscription_tier === 'pro'
    ? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: activities, error } = await supabase
    .from('activities')
    .select('date, duration_minutes, distance_km')
    .eq('athlete_id', profile.id)
    .gte('date', cutoff)
    .order('date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const withLoad = (activities ?? []).map(a => ({
    date: a.date,
    load: Math.round((a.duration_minutes ?? 0) * 1.2),
  }));

  const loads = computeLoads(withLoad);
  res.json({ loads, is_pro: profile.subscription_tier === 'pro' });
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
    .from('activities')
    .select('date, duration_minutes, distance_km, activity_type')
    .eq('athlete_id', profile.id)
    .gte('date', cutoff)
    .order('date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const byWeek: Record<string, { week: string; km: number; minutes: number; count: number }> = {};
  for (const a of activities ?? []) {
    const d = new Date(a.date);
    const dayOfWeek = d.getDay();
    const mondayOffset = (dayOfWeek + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - mondayOffset);
    const weekKey = monday.toISOString().split('T')[0];

    if (!byWeek[weekKey]) byWeek[weekKey] = { week: weekKey, km: 0, minutes: 0, count: 0 };
    byWeek[weekKey].km += a.distance_km ?? 0;
    byWeek[weekKey].minutes += a.duration_minutes ?? 0;
    byWeek[weekKey].count += 1;
  }

  res.json(Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week)));
});

router.get('/coach/:athleteId', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: coach } = await supabase.from('coach_profiles').select('id').eq('user_id', userId).single();
  if (!coach) return res.status(403).json({ error: 'Coach only' });

  const { data: activities, error } = await supabase
    .from('activities')
    .select('date, duration_minutes, distance_km')
    .eq('athlete_id', req.params.athleteId)
    .gte('date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .order('date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const withLoad = (activities ?? []).map(a => ({
    date: a.date,
    load: Math.round((a.duration_minutes ?? 0) * 1.2),
  }));

  res.json({ loads: computeLoads(withLoad) });
});

export default router;
