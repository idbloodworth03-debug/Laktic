-- Migration 031 — Full onboarding fields for athlete_profiles
-- Adds all fields collected during onboarding that were previously missing,
-- causing Supabase to silently discard them on UPDATE.
ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS age                  INTEGER,
  ADD COLUMN IF NOT EXISTS gender               TEXT,
  ADD COLUMN IF NOT EXISTS fitness_rating       INTEGER,
  ADD COLUMN IF NOT EXISTS pr_800m              TEXT,
  ADD COLUMN IF NOT EXISTS height_ft            INTEGER,
  ADD COLUMN IF NOT EXISTS height_in            INTEGER,
  ADD COLUMN IF NOT EXISTS weight_lbs           NUMERIC,
  ADD COLUMN IF NOT EXISTS sleep_average        TEXT,
  ADD COLUMN IF NOT EXISTS goal_time            TEXT,
  ADD COLUMN IF NOT EXISTS runner_types         TEXT[],
  ADD COLUMN IF NOT EXISTS biggest_challenges   TEXT[],
  ADD COLUMN IF NOT EXISTS target_race_distance TEXT;
