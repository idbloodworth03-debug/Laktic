-- migrations/002_teams.sql
-- Rollback: migrations/rollback_002_teams.sql

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES coach_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_bot_id UUID REFERENCES coach_bots(id),
  invite_code TEXT UNIQUE NOT NULL,
  invite_code_expires_at TIMESTAMPTZ,
  max_uses INTEGER DEFAULT 100,
  uses_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  athlete_id UUID REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'injured', 'inactive')),
  UNIQUE(team_id, athlete_id)
);

CREATE TABLE IF NOT EXISTS team_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'joined', 'removed', 'status_changed', 'invite_regenerated')),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_teams_coach_id ON teams(coach_id);
CREATE INDEX IF NOT EXISTS idx_teams_invite_code ON teams(invite_code);
CREATE INDEX IF NOT EXISTS idx_team_members_athlete_id ON team_members(athlete_id);
CREATE INDEX IF NOT EXISTS idx_team_events_team_id ON team_events(team_id);

-- RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches own their teams" ON teams
  FOR ALL USING (coach_id = (SELECT id FROM coach_profiles WHERE user_id = auth.uid()));

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team coaches manage members" ON team_members
  FOR ALL USING (team_id IN (SELECT id FROM teams WHERE coach_id = (SELECT id FROM coach_profiles WHERE user_id = auth.uid())));
CREATE POLICY "Athletes see own membership" ON team_members
  FOR SELECT USING (athlete_id = (SELECT id FROM athlete_profiles WHERE user_id = auth.uid()));

ALTER TABLE team_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team coaches see events" ON team_events
  FOR SELECT USING (team_id IN (SELECT id FROM teams WHERE coach_id = (SELECT id FROM coach_profiles WHERE user_id = auth.uid())));
