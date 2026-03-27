import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireCoach, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import {
  calendarEventSchema,
  calendarEventUpdateSchema,
  checkInSchema,
  manualAttendanceSchema
} from '../schemas';

const router = Router();

const CHECK_IN_RADIUS_METERS = 200;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getCoachTeam(coachId: string) {
  const { data } = await supabase
    .from('teams')
    .select('id')
    .eq('coach_id', coachId)
    .single();
  return data;
}

async function getAthleteTeam(athleteId: string) {
  const { data } = await supabase
    .from('team_members')
    .select('team_id, status')
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .single();
  return data;
}

// ── Coach: create calendar event ──────────────────────────────────────────────

router.post(
  '/calendar',
  auth,
  requireCoach,
  validate(calendarEventSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const team = await getCoachTeam(req.coach.id);
    if (!team) return res.status(404).json({ error: 'No team found. Create a team first.' });

    const { data, error } = await supabase
      .from('team_calendar_events')
      .insert({
        team_id: team.id,
        coach_id: req.coach.id,
        ...req.body
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// ── Coach: list calendar events ───────────────────────────────────────────────

router.get(
  '/calendar',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const team = await getCoachTeam(req.coach.id);
    if (!team) return res.json([]);

    const { from, to } = req.query as { from?: string; to?: string };

    let query = supabase
      .from('team_calendar_events')
      .select('*')
      .eq('team_id', team.id)
      .order('event_date', { ascending: true });

    if (from) query = query.gte('event_date', from);
    if (to) query = query.lte('event_date', to);

    const { data } = await query;
    res.json(data || []);
  })
);

// ── Coach: update calendar event ──────────────────────────────────────────────

router.patch(
  '/calendar/:eventId',
  auth,
  requireCoach,
  validate(calendarEventUpdateSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { eventId } = req.params;

    const { data: event } = await supabase
      .from('team_calendar_events')
      .select('id')
      .eq('id', eventId)
      .eq('coach_id', req.coach.id)
      .single();

    if (!event) return res.status(404).json({ error: 'Event not found.' });

    const { data, error } = await supabase
      .from('team_calendar_events')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// ── Coach: delete calendar event ──────────────────────────────────────────────

router.delete(
  '/calendar/:eventId',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { eventId } = req.params;

    const { data: event } = await supabase
      .from('team_calendar_events')
      .select('id')
      .eq('id', eventId)
      .eq('coach_id', req.coach.id)
      .single();

    if (!event) return res.status(404).json({ error: 'Event not found.' });

    await supabase.from('team_calendar_events').delete().eq('id', eventId);
    res.json({ ok: true });
  })
);

// ── Coach: manually set attendance for an athlete ─────────────────────────────

router.post(
  '/calendar/:eventId/attendance',
  auth,
  requireCoach,
  validate(manualAttendanceSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { eventId } = req.params;
    const { athlete_id, status, notes } = req.body;

    // Verify coach owns the event
    const { data: event } = await supabase
      .from('team_calendar_events')
      .select('id')
      .eq('id', eventId)
      .eq('coach_id', req.coach.id)
      .single();

    if (!event) return res.status(404).json({ error: 'Event not found.' });

    const { data, error } = await supabase
      .from('attendance_records')
      .upsert(
        { event_id: eventId, athlete_id, status, notes: notes || null, marked_by: 'coach', updated_at: new Date().toISOString() },
        { onConflict: 'event_id,athlete_id' }
      )
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  })
);

// ── Coach: get attendance for an event ───────────────────────────────────────

router.get(
  '/calendar/:eventId/attendance',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { eventId } = req.params;

    const { data: event } = await supabase
      .from('team_calendar_events')
      .select('id, team_id')
      .eq('id', eventId)
      .eq('coach_id', req.coach.id)
      .single();

    if (!event) return res.status(404).json({ error: 'Event not found.' });

    // Get all team members
    const { data: members } = await supabase
      .from('team_members')
      .select('athlete_id, athlete_profiles!athlete_id(id, name)')
      .eq('team_id', event.team_id)
      .eq('status', 'active');

    // Get existing attendance records
    const { data: records } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('event_id', eventId);

    const recordsByAthlete: Record<string, any> = {};
    (records || []).forEach((r: any) => { recordsByAthlete[r.athlete_id] = r; });

    const result = (members || []).map((m: any) => ({
      athlete_id: m.athlete_id,
      athlete_name: m.athlete_profiles?.name || 'Unknown',
      record: recordsByAthlete[m.athlete_id] || null
    }));

    res.json(result);
  })
);

// ── Coach: full attendance report ─────────────────────────────────────────────

router.get(
  '/attendance/report',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const team = await getCoachTeam(req.coach.id);
    if (!team) return res.json({ events: [], athletes: [] });

    const { from, to } = req.query as { from?: string; to?: string };

    let eventsQuery = supabase
      .from('team_calendar_events')
      .select('id, title, event_type, event_date')
      .eq('team_id', team.id)
      .order('event_date', { ascending: true });

    if (from) eventsQuery = eventsQuery.gte('event_date', from);
    if (to) eventsQuery = eventsQuery.lte('event_date', to);

    const { data: events } = await eventsQuery;

    if (!events || events.length === 0) return res.json({ events: [], athletes: [] });

    const eventIds = events.map(e => e.id);

    const { data: members } = await supabase
      .from('team_members')
      .select('athlete_id, athlete_profiles!athlete_id(id, name)')
      .eq('team_id', team.id)
      .eq('status', 'active');

    const { data: records } = await supabase
      .from('attendance_records')
      .select('*')
      .in('event_id', eventIds);

    // Build matrix: for each athlete, show status per event
    const athletes = (members || []).map((m: any) => {
      const athleteRecords: Record<string, string> = {};
      (records || [])
        .filter(r => r.athlete_id === m.athlete_id)
        .forEach(r => { athleteRecords[r.event_id] = r.status; });

      const totalEvents = events.length;
      const presentCount = Object.values(athleteRecords).filter(s => s === 'present' || s === 'late').length;

      return {
        athlete_id: m.athlete_id,
        athlete_name: m.athlete_profiles?.name || 'Unknown',
        records: athleteRecords,
        present_count: presentCount,
        total_events: totalEvents,
        attendance_pct: totalEvents > 0 ? Math.round((presentCount / totalEvents) * 100) : null
      };
    });

    res.json({ events, athletes });
  })
);

// ── Athlete: view team calendar ───────────────────────────────────────────────

router.get(
  '/calendar/team',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const membership = await getAthleteTeam(req.athlete.id);
    if (!membership) return res.json([]);

    const { from, to } = req.query as { from?: string; to?: string };

    let query = supabase
      .from('team_calendar_events')
      .select('*')
      .eq('team_id', membership.team_id)
      .order('event_date', { ascending: true });

    if (from) query = query.gte('event_date', from);
    if (to) query = query.lte('event_date', to);

    const { data: events } = await query;

    // Attach athlete's own attendance record to each event
    const eventIds = (events || []).map(e => e.id);
    let attendanceMap: Record<string, any> = {};
    if (eventIds.length > 0) {
      const { data: records } = await supabase
        .from('attendance_records')
        .select('event_id, status, check_in_at, marked_by')
        .eq('athlete_id', req.athlete.id)
        .in('event_id', eventIds);
      (records || []).forEach(r => { attendanceMap[r.event_id] = r; });
    }

    const result = (events || []).map(e => ({
      ...e,
      my_attendance: attendanceMap[e.id] || null
    }));

    res.json(result);
  })
);

// ── Athlete: GPS check-in ─────────────────────────────────────────────────────

router.post(
  '/calendar/:eventId/checkin',
  auth,
  requireAthlete,
  validate(checkInSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { eventId } = req.params;
    const { lat, lng } = req.body;

    const membership = await getAthleteTeam(req.athlete.id);
    if (!membership) return res.status(403).json({ error: 'You are not on an active team.' });

    // Verify event belongs to athlete's team
    const { data: event } = await supabase
      .from('team_calendar_events')
      .select('id, location_lat, location_lng, location_name, event_date')
      .eq('id', eventId)
      .eq('team_id', membership.team_id)
      .single();

    if (!event) return res.status(404).json({ error: 'Event not found.' });

    // GPS proximity check (if event has a location)
    let markedBy: 'gps' | 'self' = 'self';
    if (event.location_lat != null && event.location_lng != null) {
      const distance = haversineMeters(lat, lng, event.location_lat, event.location_lng);
      if (distance > CHECK_IN_RADIUS_METERS) {
        return res.status(400).json({
          error: `You are ${Math.round(distance)}m from ${event.location_name || 'the event location'}. Must be within ${CHECK_IN_RADIUS_METERS}m to check in.`,
          distance_meters: Math.round(distance)
        });
      }
      markedBy = 'gps';
    }

    const { data, error } = await supabase
      .from('attendance_records')
      .upsert(
        {
          event_id: eventId,
          athlete_id: req.athlete.id,
          status: 'present',
          check_in_at: new Date().toISOString(),
          check_in_lat: lat,
          check_in_lng: lng,
          marked_by: markedBy,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'event_id,athlete_id' }
      )
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, record: data, marked_by: markedBy });
  })
);

// ── Athlete: iCal export ──────────────────────────────────────────────────────

router.get(
  '/calendar/export.ics',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const membership = await getAthleteTeam(req.athlete.id);

    // Also include the athlete's personal race calendar from active season
    const { data: season } = await supabase
      .from('athlete_seasons')
      .select('race_calendar')
      .eq('athlete_id', req.athlete.id)
      .eq('status', 'active')
      .single();

    const icsLines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Laktic//Training Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Laktic Training',
      'X-WR-TIMEZONE:UTC'
    ];

    function formatDate(dateStr: string): string {
      return dateStr.replace(/-/g, '');
    }

    function escape(str: string): string {
      return str.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
    }

    function addEvent(uid: string, summary: string, dateStr: string, description = '', location = '') {
      const dtstart = formatDate(dateStr);
      // DTEND is next day for all-day events
      const nextDay = new Date(dateStr + 'T00:00:00Z');
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const dtend = nextDay.toISOString().slice(0, 10).replace(/-/g, '');

      icsLines.push('BEGIN:VEVENT');
      icsLines.push(`UID:${uid}@laktic.app`);
      icsLines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`);
      icsLines.push(`DTSTART;VALUE=DATE:${dtstart}`);
      icsLines.push(`DTEND;VALUE=DATE:${dtend}`);
      icsLines.push(`SUMMARY:${escape(summary)}`);
      if (description) icsLines.push(`DESCRIPTION:${escape(description)}`);
      if (location) icsLines.push(`LOCATION:${escape(location)}`);
      icsLines.push('END:VEVENT');
    }

    // Team calendar events
    if (membership) {
      const { data: teamEvents } = await supabase
        .from('team_calendar_events')
        .select('*')
        .eq('team_id', membership.team_id)
        .order('event_date', { ascending: true });

      const typeLabels: Record<string, string> = {
        practice: 'Practice',
        race: 'Race',
        off_day: 'Rest Day',
        travel: 'Travel',
        meeting: 'Team Meeting',
        other: 'Team Event'
      };

      (teamEvents || []).forEach(ev => {
        const label = typeLabels[ev.event_type] || 'Team Event';
        const summary = `[${label}] ${ev.title}`;
        const desc = [ev.notes, ev.start_time ? `Time: ${ev.start_time}` : ''].filter(Boolean).join('\n');
        addEvent(ev.id, summary, ev.event_date, desc, ev.location_name || '');
      });
    }

    // Personal race calendar
    const races: Array<{ name: string; date: string; is_goal_race?: boolean; notes?: string }> =
      season?.race_calendar || [];

    races.forEach((race, idx) => {
      const prefix = race.is_goal_race ? '[Goal Race]' : '[Race]';
      addEvent(`race-${idx}-${race.date}`, `${prefix} ${race.name}`, race.date, race.notes || '');
    });

    icsLines.push('END:VCALENDAR');

    const icsContent = icsLines.join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="laktic-calendar.ics"');
    res.send(icsContent);
  })
);

export default router;
