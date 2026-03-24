-- 004_progress.sql — Weekly training summaries + race results

-- Weekly training summaries (computed from activities)
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  total_distance_miles REAL DEFAULT 0,
  total_duration_minutes REAL DEFAULT 0,
  total_elevation_feet REAL DEFAULT 0,
  run_count INTEGER DEFAULT 0,
  avg_pace_per_mile TEXT,
  avg_heartrate REAL,
  longest_run_miles REAL DEFAULT 0,
  intensity_score REAL,
  compliance_pct REAL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(athlete_id, week_start)
);

-- Race results tracking
CREATE TABLE IF NOT EXISTS race_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  race_name TEXT NOT NULL,
  race_date DATE NOT NULL,
  distance TEXT NOT NULL,
  finish_time TEXT NOT NULL,
  pace_per_mile TEXT,
  placement TEXT,
  is_pr BOOLEAN DEFAULT false,
  conditions TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_weekly_summaries_athlete ON weekly_summaries(athlete_id, week_start DESC);
CREATE INDEX idx_race_results_athlete ON race_results(athlete_id, race_date DESC);

-- RLS
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athletes see own summaries" ON weekly_summaries
  FOR ALL USING (athlete_id = (SELECT id FROM athlete_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Coaches see team summaries" ON weekly_summaries
  FOR SELECT USING (athlete_id IN (
    SELECT tm.athlete_id FROM team_members tm
    JOIN teams t ON tm.team_id = t.id
    JOIN coach_profiles cp ON t.coach_id = cp.id
    WHERE cp.user_id = auth.uid()
  ));

ALTER TABLE race_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Athletes own results" ON race_results
  FOR ALL USING (athlete_id = (SELECT id FROM athlete_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Coaches see team results" ON race_results
  FOR SELECT USING (athlete_id IN (
    SELECT tm.athlete_id FROM team_members tm
    JOIN teams t ON tm.team_id = t.id
    JOIN coach_profiles cp ON t.coach_id = cp.id
    WHERE cp.user_id = auth.uid()
  ));
