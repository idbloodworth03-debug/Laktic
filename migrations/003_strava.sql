-- 003_strava.sql — Strava OAuth connections + athlete activities

CREATE TABLE IF NOT EXISTS strava_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES athlete_profiles(id) ON DELETE CASCADE UNIQUE,
  strava_athlete_id BIGINT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT DEFAULT 'read,activity:read',
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_sync_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS athlete_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  strava_activity_id BIGINT UNIQUE,
  source TEXT DEFAULT 'strava' CHECK (source IN ('strava', 'garmin', 'coros', 'manual')),
  activity_type TEXT NOT NULL,
  name TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  distance_meters REAL,
  moving_time_seconds INTEGER,
  elapsed_time_seconds INTEGER,
  average_speed REAL,
  max_speed REAL,
  average_heartrate REAL,
  max_heartrate REAL,
  total_elevation_gain REAL,
  average_cadence REAL,
  suffer_score INTEGER,
  perceived_exertion REAL,
  description TEXT,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activities_athlete_date ON athlete_activities(athlete_id, start_date DESC);
CREATE INDEX idx_activities_strava_id ON athlete_activities(strava_activity_id);
CREATE INDEX idx_strava_connections_athlete ON strava_connections(athlete_id);

-- RLS
ALTER TABLE strava_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athletes own their connections" ON strava_connections
  FOR ALL USING (athlete_id = (SELECT id FROM athlete_profiles WHERE user_id = auth.uid()));

ALTER TABLE athlete_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athletes see own activities" ON athlete_activities
  FOR ALL USING (athlete_id = (SELECT id FROM athlete_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Coaches see team activities" ON athlete_activities
  FOR SELECT USING (athlete_id IN (
    SELECT tm.athlete_id FROM team_members tm
    JOIN teams t ON tm.team_id = t.id
    JOIN coach_profiles cp ON t.coach_id = cp.id
    WHERE cp.user_id = auth.uid()
  ));
