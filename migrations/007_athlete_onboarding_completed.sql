-- Add onboarding_completed flag to athlete_profiles
-- Used by the Strava OAuth callback to redirect back to onboarding vs dashboard

ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
