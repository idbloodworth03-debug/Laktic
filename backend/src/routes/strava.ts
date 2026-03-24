import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { env } from '../config/env';
import { stravaCallbackSchema, activitiesQuerySchema, syncSchema } from '../schemas';
import * as strava from '../services/stravaService';

const router = Router();

// GET /api/strava/auth — Generate Strava OAuth URL (redirect to Strava)
router.get(
  '/auth',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    if (!env.STRAVA_CLIENT_ID || !env.STRAVA_REDIRECT_URI) {
      return res.status(500).json({ error: 'Strava integration is not configured' });
    }
    const url = strava.getAuthUrl(req.athlete.id);
    res.json({ url });
  })
);

// GET /api/strava/callback — Handle OAuth callback, exchange code for tokens
router.get(
  '/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = stravaCallbackSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    const { code, state: athleteId } = parsed.data;

    const tokenData = await strava.exchangeCode(code);

    // Upsert the connection (one per athlete)
    const { error } = await supabase
      .from('strava_connections')
      .upsert(
        {
          athlete_id: athleteId,
          strava_athlete_id: tokenData.athlete.id,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
          scope: 'read,activity:read',
          is_active: true
        },
        { onConflict: 'athlete_id' }
      );

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Redirect back to frontend settings page
    const redirectUrl = `${env.FRONTEND_URL}/athlete/settings?strava=connected`;
    res.redirect(redirectUrl);
  })
);

// GET /api/athlete/strava — Get connection status
router.get(
  '/strava',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data: connection } = await supabase
      .from('strava_connections')
      .select('id, strava_athlete_id, scope, connected_at, last_sync_at, is_active')
      .eq('athlete_id', req.athlete.id)
      .single();

    if (!connection) {
      return res.json({ connected: false });
    }

    res.json({
      connected: connection.is_active,
      strava_athlete_id: connection.strava_athlete_id,
      connected_at: connection.connected_at,
      last_sync_at: connection.last_sync_at,
      scope: connection.scope
    });
  })
);

// POST /api/athlete/strava/sync — Manually trigger activity sync
router.post(
  '/strava/sync',
  auth,
  requireAthlete,
  validate(syncSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { days } = req.body;
    const synced = await strava.syncActivities(req.athlete.id, days);
    res.json({ synced, message: `Synced ${synced} activities from the last ${days} days` });
  })
);

// DELETE /api/athlete/strava — Disconnect Strava
router.delete(
  '/strava',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { error } = await supabase
      .from('strava_connections')
      .update({ is_active: false })
      .eq('athlete_id', req.athlete.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Strava disconnected' });
  })
);

// POST /api/strava/webhook — Strava webhook receiver (new activity push)
router.post(
  '/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const { object_type, aspect_type, object_id, owner_id } = req.body;

    // Strava sends events for activities and athletes
    if (object_type === 'activity' && aspect_type === 'create') {
      // Find the connection by strava_athlete_id
      const { data: connection } = await supabase
        .from('strava_connections')
        .select('*')
        .eq('strava_athlete_id', owner_id)
        .eq('is_active', true)
        .single();

      if (connection) {
        try {
          const accessToken = await strava.refreshToken(connection);
          const activity = await strava.getActivity(accessToken, object_id);

          await supabase.from('athlete_activities').upsert(
            {
              athlete_id: connection.athlete_id,
              strava_activity_id: activity.id,
              source: 'strava',
              activity_type: activity.sport_type || activity.type,
              name: activity.name,
              start_date: activity.start_date,
              distance_meters: activity.distance,
              moving_time_seconds: activity.moving_time,
              elapsed_time_seconds: activity.elapsed_time,
              average_speed: activity.average_speed,
              max_speed: activity.max_speed,
              average_heartrate: activity.average_heartrate || null,
              max_heartrate: activity.max_heartrate || null,
              total_elevation_gain: activity.total_elevation_gain,
              average_cadence: activity.average_cadence || null,
              suffer_score: activity.suffer_score || null,
              perceived_exertion: activity.perceived_exertion || null,
              description: activity.description || null,
              raw_data: activity
            },
            { onConflict: 'strava_activity_id' }
          );
        } catch (err) {
          // Log but don't fail — Strava expects 200
          // eslint-disable-next-line no-console
          console.error('[Strava webhook] Error syncing activity:', err);
        }
      }
    }

    // Strava requires a 200 response within 2 seconds
    res.status(200).json({ ok: true });
  })
);

// GET /api/strava/webhook — Strava webhook verification (GET challenge)
router.get(
  '/webhook',
  (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
      res.json({ 'hub.challenge': challenge });
    } else {
      res.status(403).json({ error: 'Verification failed' });
    }
  }
);

// GET /api/athlete/activities — List activities (paginated, date range filter)
router.get(
  '/activities',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = activitiesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors });
    }

    const { page, per_page, after, before } = parsed.data;
    const offset = (page - 1) * per_page;

    let query = supabase
      .from('athlete_activities')
      .select('*', { count: 'exact' })
      .eq('athlete_id', req.athlete.id)
      .order('start_date', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (after) query = query.gte('start_date', after);
    if (before) query = query.lte('start_date', before);

    const { data, count, error } = await query;

    if (error) return res.status(400).json({ error: error.message });

    res.json({
      activities: data || [],
      total: count || 0,
      page,
      per_page,
      total_pages: Math.ceil((count || 0) / per_page)
    });
  })
);

export default router;
