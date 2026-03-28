-- migrations/006_calendar_attendance.sql
-- Phase 2.3 Team Calendar + Phase 2.4 Attendance Tracker

CREATE TABLE IF NOT EXISTS team_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES coach_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'practice'
    CHECK (event_type IN ('practice', 'race', 'off_day', 'travel', 'meeting', 'other')),
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location_name TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES team_calendar_events(id) ON DELETE CASCADE,
  athlete_id UUID REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'absent'
    CHECK (status IN ('present', 'absent', 'excused', 'late')),
  check_in_at TIMESTAMPTZ,
  check_in_lat DOUBLE PRECISION,
  check_in_lng DOUBLE PRECISION,
  marked_by TEXT NOT NULL DEFAULT 'coach'
    CHECK (marked_by IN ('coach', 'gps', 'self')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, athlete_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_cal_events_team_id ON team_calendar_events(team_id);
CREATE INDEX IF NOT EXISTS idx_team_cal_events_date ON team_calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_attendance_event_id ON attendance_records(event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_athlete_id ON attendance_records(athlete_id);

-- RLS
ALTER TABLE team_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage their team calendar" ON team_calendar_events
  FOR ALL USING (
    coach_id = (SELECT id FROM coach_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Athletes see team calendar" ON team_calendar_events
  FOR SELECT USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE athlete_id = (SELECT id FROM athlete_profiles WHERE user_id = auth.uid())
    )
  );

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage attendance records" ON attendance_records
  FOR ALL USING (
    event_id IN (
      SELECT id FROM team_calendar_events
      WHERE coach_id = (SELECT id FROM coach_profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Athletes see own attendance" ON attendance_records
  FOR SELECT USING (
    athlete_id = (SELECT id FROM athlete_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Athletes upsert own check-in" ON attendance_records
  FOR INSERT WITH CHECK (
    athlete_id = (SELECT id FROM athlete_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Athletes update own check-in" ON attendance_records
  FOR UPDATE USING (
    athlete_id = (SELECT id FROM athlete_profiles WHERE user_id = auth.uid())
  );
