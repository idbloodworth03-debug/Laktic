-- Track when users were last active on the platform
ALTER TABLE athlete_profiles ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
