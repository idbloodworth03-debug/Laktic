import { supabase } from '../db/supabase';
import { env } from '../config/env';

// Strava API constants
const STRAVA_API = 'https://www.strava.com/api/v3';
const STRAVA_AUTH = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN = 'https://www.strava.com/oauth/token';

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: { id: number };
}

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain: number;
  average_cadence?: number;
  suffer_score?: number;
  perceived_exertion?: number;
  description?: string;
}

interface StravaConnection {
  id: string;
  athlete_id: string;
  strava_athlete_id: number;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

/** Build OAuth URL that redirects athlete to Strava consent screen */
export function getAuthUrl(athleteId: string): string {
  const params = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID!,
    redirect_uri: env.STRAVA_REDIRECT_URI!,
    response_type: 'code',
    scope: 'read,activity:read_all',
    state: athleteId,
    approval_prompt: 'force'
  });
  return `${STRAVA_AUTH}?${params.toString()}`;
}

/** Exchange authorization code for access + refresh tokens */
export async function exchangeCode(code: string): Promise<StravaTokenResponse> {
  const res = await fetch(STRAVA_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code'
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava token exchange failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<StravaTokenResponse>;
}

/** Refresh an expired access token */
export async function refreshToken(connection: StravaConnection): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at);
  if (expiresAt > new Date()) {
    return connection.access_token;
  }

  const res = await fetch(STRAVA_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token'
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava token refresh failed: ${res.status} ${body}`);
  }

  const data = await res.json() as StravaTokenResponse;

  // Persist new tokens
  await supabase
    .from('strava_connections')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: new Date(data.expires_at * 1000).toISOString()
    })
    .eq('id', connection.id);

  return data.access_token;
}

/** Fetch a page of activities from Strava */
export async function getActivities(
  accessToken: string,
  after?: number,
  before?: number,
  page = 1,
  perPage = 50
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage)
  });
  if (after) params.set('after', String(after));
  if (before) params.set('before', String(before));

  const res = await fetch(`${STRAVA_API}/athlete/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava getActivities failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<StravaActivity[]>;
}

/** Fetch a single activity with full detail */
export async function getActivity(accessToken: string, activityId: number): Promise<StravaActivity> {
  const res = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava getActivity failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<StravaActivity>;
}

/** Sync activities for an athlete over the last N days */
export async function syncActivities(athleteId: string, days = 30): Promise<number> {
  const { data: connection } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('is_active', true)
    .single();

  if (!connection) throw new Error('No active Strava connection');

  const accessToken = await refreshToken(connection as StravaConnection);
  const after = Math.floor(Date.now() / 1000) - days * 86400;

  let page = 1;
  let synced = 0;
  let hasMore = true;

  while (hasMore) {
    const activities = await getActivities(accessToken, after, undefined, page, 50);
    if (activities.length === 0) {
      hasMore = false;
      break;
    }

    for (const activity of activities) {
      const row = {
        athlete_id: athleteId,
        strava_activity_id: activity.id,
        source: 'strava' as const,
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
      };

      // Upsert — skip duplicates by strava_activity_id
      const { error } = await supabase
        .from('athlete_activities')
        .upsert(row, { onConflict: 'strava_activity_id' });

      if (!error) synced++;
    }

    page++;
    if (activities.length < 50) hasMore = false;
  }

  // Update last_sync_at
  await supabase
    .from('strava_connections')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', connection.id);

  return synced;
}
