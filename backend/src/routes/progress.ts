import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, requireCoach, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { raceResultSchema, raceResultUpdateSchema, weeklyQuerySchema, directMessageSchema } from '../schemas';
import { computeAllWeeks } from '../services/progressService';
import { buildAthletePdf, buildTeamPdf } from '../services/pdfService';

const router = Router();

// ── Athlete Weekly Summaries ────────────────────────────────────────────────

// GET /api/athlete/progress/weekly — Live-compute from athlete_activities (last N weeks)
router.get(
  '/progress/weekly',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = weeklyQuerySchema.safeParse(req.query);
    const weeks = parsed.success ? parsed.data.weeks : 12;
    const athleteId = req.athlete.id;
    const now = new Date();

    const getMonday = (d: Date): string => {
      const date = new Date(d);
      const day = date.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      date.setUTCDate(date.getUTCDate() + diff);
      return date.toISOString().slice(0, 10);
    };

    const currentMonday = getMonday(now);

    // Fetch 90 days of activities for streak + fetch N-week window for chart
    const since90 = new Date(now);
    since90.setDate(since90.getDate() - 90);

    const { data: activities } = await supabase
      .from('athlete_activities')
      .select('start_date, distance_miles, duration, pace, activity_type')
      .eq('athlete_id', athleteId)
      .gte('start_date', since90.toISOString())
      .order('start_date', { ascending: true });

    const acts = activities || [];

    // Build week buckets for the last N weeks
    const weekMap: Record<string, { week_start: string; miles: number; run_count: number; duration_secs: number; longest: number; pace_sum: number; pace_count: number }> = {};
    for (let i = 0; i < weeks; i++) {
      const d = new Date(currentMonday + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - i * 7);
      const wk = d.toISOString().slice(0, 10);
      weekMap[wk] = { week_start: wk, miles: 0, run_count: 0, duration_secs: 0, longest: 0, pace_sum: 0, pace_count: 0 };
    }

    const weekSince = new Date(currentMonday + 'T00:00:00Z');
    weekSince.setUTCDate(weekSince.getUTCDate() - (weeks - 1) * 7);
    const weekSinceStr = weekSince.toISOString().slice(0, 10);

    for (const act of acts) {
      const wk = getMonday(new Date(act.start_date));
      if (wk < weekSinceStr || !weekMap[wk]) continue;
      weekMap[wk].miles += act.distance_miles || 0;
      weekMap[wk].run_count += 1;
      if ((act.distance_miles || 0) > weekMap[wk].longest) weekMap[wk].longest = act.distance_miles || 0;
      if (act.duration) weekMap[wk].duration_secs += act.duration;
      if (act.pace) {
        const parts = act.pace.split(':');
        if (parts.length === 2) {
          const secs = parseInt(parts[0]) * 60 + parseInt(parts[1]);
          if (secs > 0) { weekMap[wk].pace_sum += secs; weekMap[wk].pace_count += 1; }
        }
      }
    }

    const summaries = Object.values(weekMap)
      .sort((a, b) => a.week_start.localeCompare(b.week_start))
      .map(w => {
        const avgSecs = w.pace_count > 0 ? Math.round(w.pace_sum / w.pace_count) : 0;
        const m = Math.floor(avgSecs / 60);
        const s = avgSecs % 60;
        return {
          week_start: w.week_start,
          total_distance_miles: Math.round(w.miles * 10) / 10,
          run_count: w.run_count,
          avg_pace_per_mile: avgSecs > 0 ? `${m}:${s.toString().padStart(2, '0')}` : '--',
          total_duration_minutes: Math.round(w.duration_secs / 60),
          longest_run_miles: Math.round(w.longest * 10) / 10,
          avg_heartrate: null,
          intensity_score: null,
          compliance_pct: null,
        };
      });

    // YTD totals
    const ytdStart = `${now.getFullYear()}-01-01T00:00:00Z`;
    const ytdActs = acts.filter(a => a.start_date >= ytdStart);
    const ytd = {
      total_miles: Math.round(ytdActs.reduce((s, a) => s + (a.distance_miles || 0), 0) * 10) / 10,
      total_runs: ytdActs.length,
      total_hours: Math.round(ytdActs.reduce((s, a) => s + ((a.duration || 0) / 3600), 0) * 10) / 10,
    };

    // Streak: consecutive active days going back from today
    const actDates = new Set(acts.map(a => a.start_date.slice(0, 10)));
    let streak = 0;
    const todayStr = now.toISOString().slice(0, 10);
    const cursor = new Date(actDates.has(todayStr) ? now : new Date(now.getTime() - 86400000));
    cursor.setHours(0, 0, 0, 0);
    while (true) {
      const ds = cursor.toISOString().slice(0, 10);
      if (actDates.has(ds)) { streak++; cursor.setDate(cursor.getDate() - 1); }
      else break;
    }

    res.json({ summaries, ytd, streak });
  })
);

// POST /api/athlete/progress/compute — Recompute weekly summaries from activities
router.post(
  '/progress/compute',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = weeklyQuerySchema.safeParse(req.body);
    const weeks = parsed.success ? parsed.data.weeks : 12;

    const summaries = await computeAllWeeks(req.athlete.id, weeks);
    res.json({ computed: summaries.length, summaries });
  })
);

// ── Race Results ────────────────────────────────────────────────────────────

// GET /api/athlete/races/results — Get race results
router.get(
  '/races/results',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data, error } = await supabase
      .from('race_results')
      .select('*')
      .eq('athlete_id', req.athlete.id)
      .order('race_date', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  })
);

// POST /api/athlete/races/results — Add race result
router.post(
  '/races/results',
  auth,
  requireAthlete,
  validate(raceResultSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data, error } = await supabase
      .from('race_results')
      .insert({ ...req.body, athlete_id: req.athlete.id })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// PATCH /api/athlete/races/results/:id — Update race result
router.patch(
  '/races/results/:id',
  auth,
  requireAthlete,
  validate(raceResultUpdateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { data, error } = await supabase
      .from('race_results')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('athlete_id', req.athlete.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Result not found' });
    res.json(data);
  })
);

// DELETE /api/athlete/races/results/:id — Delete race result
router.delete(
  '/races/results/:id',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { error } = await supabase
      .from('race_results')
      .delete()
      .eq('id', req.params.id)
      .eq('athlete_id', req.athlete.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  })
);

// ── Coach Team Progress ─────────────────────────────────────────────────────

// GET /api/coach/team/progress — Team progress overview
router.get(
  '/progress',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    // Get coach's team
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (!team) return res.status(404).json({ error: 'No team found' });

    // Get team member athlete IDs
    const { data: members } = await supabase
      .from('team_members')
      .select(`
        athlete_id,
        status,
        athlete_profiles!athlete_id (id, name, weekly_volume_miles, primary_events)
      `)
      .eq('team_id', team.id)
      .eq('status', 'active');

    if (!members || members.length === 0) return res.json([]);

    const athleteIds = members.map((m: any) => m.athlete_id);

    // Get latest weekly summary for each athlete (most recent week)
    const { data: summaries } = await supabase
      .from('weekly_summaries')
      .select('*')
      .in('athlete_id', athleteIds)
      .order('week_start', { ascending: false });

    // Group: latest summary per athlete
    const latestByAthlete: Record<string, any> = {};
    for (const s of summaries || []) {
      if (!latestByAthlete[s.athlete_id]) {
        latestByAthlete[s.athlete_id] = s;
      }
    }

    const result = members.map((m: any) => ({
      athlete: m.athlete_profiles,
      member_status: m.status,
      latest_week: latestByAthlete[m.athlete_id] || null
    }));

    res.json(result);
  })
);

// GET /api/coach/team/athletes/:id/progress — Single athlete detailed progress
router.get(
  '/athletes/:id/progress',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const athleteId = req.params.id;

    // Verify athlete is on coach's team
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('coach_id', req.coach.id)
      .single();

    if (!team) return res.status(404).json({ error: 'No team found' });

    const { data: member } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', team.id)
      .eq('athlete_id', athleteId)
      .single();

    if (!member) return res.status(403).json({ error: 'Athlete is not on your team' });

    const parsed = weeklyQuerySchema.safeParse(req.query);
    const weeks = parsed.success ? parsed.data.weeks : 12;

    // Get weekly summaries
    const { data: summaries } = await supabase
      .from('weekly_summaries')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('week_start', { ascending: false })
      .limit(weeks);

    // Get race results
    const { data: races } = await supabase
      .from('race_results')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('race_date', { ascending: false });

    // Get athlete profile
    const { data: profile } = await supabase
      .from('athlete_profiles')
      .select('id, name, weekly_volume_miles, primary_events')
      .eq('id', athleteId)
      .single();

    res.json({
      profile,
      summaries: (summaries || []).reverse(),
      races: races || []
    });
  })
);

// ── Coach: view athlete's bot chat ───────────────────────────────────────────

// GET /api/coach/team/athletes/:id/chat
router.get(
  '/athletes/:id/chat',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const athleteId = req.params.id;

    const { data: team } = await supabase.from('teams').select('id').eq('coach_id', req.coach.id).single();
    if (!team) return res.status(404).json({ error: 'No team found' });

    const { data: member } = await supabase.from('team_members').select('id').eq('team_id', team.id).eq('athlete_id', athleteId).single();
    if (!member) return res.status(403).json({ error: 'Athlete not on your team' });

    const { data: season } = await supabase.from('athlete_seasons').select('id').eq('athlete_id', athleteId).eq('status', 'active').single();
    if (!season) return res.json([]);

    const { data: messages } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('season_id', season.id)
      .order('created_at', { ascending: true });

    res.json(messages || []);
  })
);

// ── Coach: direct messages with athlete ──────────────────────────────────────

// GET /api/coach/team/athletes/:id/messages
router.get(
  '/athletes/:id/messages',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const athleteId = req.params.id;

    const { data: team } = await supabase.from('teams').select('id').eq('coach_id', req.coach.id).single();
    if (!team) return res.status(404).json({ error: 'No team found' });

    const { data: member } = await supabase.from('team_members').select('id').eq('team_id', team.id).eq('athlete_id', athleteId).single();
    if (!member) return res.status(403).json({ error: 'Athlete not on your team' });

    const { data: messages } = await supabase
      .from('direct_messages')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('coach_id', req.coach.id)
      .order('created_at', { ascending: true });

    res.json(messages || []);
  })
);

// POST /api/coach/team/athletes/:id/messages
router.post(
  '/athletes/:id/messages',
  auth,
  requireCoach,
  validate(directMessageSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const athleteId = req.params.id;
    const { message } = req.body;

    const { data: team } = await supabase.from('teams').select('id').eq('coach_id', req.coach.id).single();
    if (!team) return res.status(404).json({ error: 'No team found' });

    const { data: member } = await supabase.from('team_members').select('id').eq('team_id', team.id).eq('athlete_id', athleteId).single();
    if (!member) return res.status(403).json({ error: 'Athlete not on your team' });

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ athlete_id: athleteId, coach_id: req.coach.id, sender_role: 'coach', content: message })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// ── Athlete: PDF season report ───────────────────────────────────────────────

// GET /api/athlete/report.pdf
router.get(
  '/report.pdf',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const athleteId = req.athlete.id;

    // Load athlete profile
    const { data: athlete } = await supabase
      .from('athlete_profiles')
      .select('name, weekly_volume_miles, primary_events')
      .eq('id', athleteId)
      .single();

    if (!athlete) return res.status(404).json({ error: 'Athlete not found.' });

    // Load active season (bot name via join)
    const { data: season } = await supabase
      .from('athlete_seasons')
      .select('created_at, race_calendar, season_plan, bot_id, coach_bots!bot_id(name)')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      .single();

    // Last 12 weekly summaries
    const { data: weeklySummaries } = await supabase
      .from('weekly_summaries')
      .select('week_start, total_distance_miles, run_count, avg_pace_per_mile, compliance_pct')
      .eq('athlete_id', athleteId)
      .order('week_start', { ascending: false })
      .limit(12);

    // Attendance summary (from athlete's team)
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      .single();

    let attendance = null;
    if (membership) {
      const { data: allRecords } = await supabase
        .from('attendance_records')
        .select('status')
        .eq('athlete_id', athleteId);

      const total = allRecords?.length || 0;
      const present = (allRecords || []).filter(r => r.status === 'present' || r.status === 'late').length;
      attendance = {
        present_count: present,
        total_events: total,
        attendance_pct: total > 0 ? Math.round((present / total) * 100) : null
      };
    }

    const botName = (season as any)?.coach_bots?.name ?? null;

    buildAthletePdf(res, {
      athlete,
      season: season ? {
        created_at: season.created_at,
        race_calendar: season.race_calendar || [],
        season_plan: season.season_plan || []
      } : null,
      weeklySummaries: (weeklySummaries || []).reverse(),
      attendance,
      botName
    });
  })
);

// ── Coach: team attendance PDF ───────────────────────────────────────────────

// GET /api/coach/team/report.pdf
router.get(
  '/report.pdf',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { from, to } = req.query as { from?: string; to?: string };

    const { data: team } = await supabase
      .from('teams')
      .select('id, name')
      .eq('coach_id', req.coach.id)
      .single();

    if (!team) return res.status(404).json({ error: 'No team found.' });

    let eventsQuery = supabase
      .from('team_calendar_events')
      .select('id, title, event_type, event_date')
      .eq('team_id', team.id)
      .order('event_date', { ascending: true });

    if (from) eventsQuery = eventsQuery.gte('event_date', from);
    if (to) eventsQuery = eventsQuery.lte('event_date', to);

    const { data: events } = await eventsQuery;

    const { data: members } = await supabase
      .from('team_members')
      .select('athlete_id, athlete_profiles!athlete_id(id, name)')
      .eq('team_id', team.id)
      .eq('status', 'active');

    let athleteRows: any[] = [];
    if (events && events.length > 0 && members && members.length > 0) {
      const eventIds = events.map(e => e.id);
      const { data: records } = await supabase
        .from('attendance_records')
        .select('event_id, athlete_id, status')
        .in('event_id', eventIds);

      athleteRows = (members || []).map((m: any) => {
        const athleteRecords: Record<string, string> = {};
        (records || [])
          .filter(r => r.athlete_id === m.athlete_id)
          .forEach(r => { athleteRecords[r.event_id] = r.status; });

        const present = Object.values(athleteRecords).filter(s => s === 'present' || s === 'late').length;
        const total = events.length;
        return {
          athlete_name: (m.athlete_profiles as any)?.name || 'Unknown',
          present_count: present,
          total_events: total,
          attendance_pct: total > 0 ? Math.round((present / total) * 100) : null,
          records: athleteRecords
        };
      });
    }

    buildTeamPdf(res, {
      teamName: team.name,
      events: events || [],
      athletes: athleteRows,
      from: from || null,
      to: to || null
    });
  })
);

export default router;
