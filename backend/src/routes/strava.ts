import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { env } from '../config/env';
import { stravaCallbackSchema, activitiesQuerySchema, syncSchema } from '../schemas';
import * as strava from '../services/stravaService';

const router = Router();

// GET /api/strava/auth — Redirect browser directly to Strava's OAuth consent page
// Called via full browser navigation (window.location.href), not fetch — no auth header available.
// athleteId (athlete_profiles.id) is passed as query param and forwarded as OAuth state.
router.get(
  '/auth',
  asyncHandler(async (req: Request, res: Response) => {
    if (!env.STRAVA_CLIENT_ID || !env.STRAVA_REDIRECT_URI) {
      return res.redirect(`${env.FRONTEND_URL}/signup/strava?strava_error=1`);
    }
    const athleteId = req.query.athleteId as string | undefined;
    if (!athleteId) {
      return res.redirect(`${env.FRONTEND_URL}/signup/strava?strava_error=1`);
    }
    // Verify the athleteId exists to prevent state spoofing
    const { data: athlete } = await supabase
      .from('athlete_profiles')
      .select('id')
      .eq('id', athleteId)
      .single();
    if (!athlete) {
      return res.redirect(`${env.FRONTEND_URL}/signup/strava?strava_error=1`);
    }
    const url = strava.getAuthUrl(athleteId);
    res.redirect(url);
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

    console.log('[strava/callback] received code:', code?.slice(0, 8), 'state:', athleteId);

    const tokenData = await strava.exchangeCode(code);

    // Upsert on strava_athlete_id — if this Strava account was previously linked to
    // a different athlete_id (e.g. test account reuse), overwrite with the current athlete.
    const { error } = await supabase
      .from('strava_connections')
      .upsert(
        {
          athlete_id: athleteId,
          strava_athlete_id: tokenData.athlete.id,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
          scope: 'read,activity:read_all',
          is_active: true
        },
        { onConflict: 'strava_athlete_id' }
      );

    if (error) {
      // Redirect back to Strava connect step with error flag rather than showing raw JSON
      return res.redirect(`${env.FRONTEND_URL}/signup/strava?strava_error=1`);
    }

    // Redirect back to onboarding if not yet complete, otherwise dashboard
    const { data: athleteProfile } = await supabase
      .from('athlete_profiles')
      .select('onboarding_completed')
      .eq('id', athleteId)
      .single();

    const redirectUrl = athleteProfile?.onboarding_completed
      ? `${env.FRONTEND_URL}/athlete/dashboard`
      : `${env.FRONTEND_URL}/signup/meet-pace`;
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

// DELETE /api/athlete/strava — Disconnect Strava and delete all synced activity data
router.delete(
  '/strava',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    // Delete all synced Strava activities (Strava API compliance — data must be deleted on disconnect)
    await supabase
      .from('athlete_activities')
      .delete()
      .eq('athlete_id', req.athlete.id)
      .eq('source', 'strava');

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
  (req: Request, res: Response) => {
    // Respond 200 immediately — Strava requires this within 2 seconds
    res.status(200).json({ ok: true });

    const { object_type, aspect_type, object_id, owner_id } = req.body;

    // Process in background — Strava sends events for activities and athletes
    if (object_type === 'activity' && aspect_type === 'create') {
      (async () => {
        const { data: connection } = await supabase
          .from('strava_connections')
          .select('*')
          .eq('strava_athlete_id', owner_id)
          .eq('is_active', true)
          .single();

        if (!connection) return;

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
          // eslint-disable-next-line no-console
          console.error('[Strava webhook] Error syncing activity:', err);
        }
      })();
    }
  }
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
