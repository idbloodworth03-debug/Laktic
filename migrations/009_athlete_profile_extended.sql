-- Migration 009: Extended athlete profile fields for richer AI context
ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS fitness_level TEXT,
  ADD COLUMN IF NOT EXISTS primary_goal TEXT,
  ADD COLUMN IF NOT EXISTS training_days_per_week INTEGER,
  ADD COLUMN IF NOT EXISTS biggest_challenge TEXT,
  ADD COLUMN IF NOT EXISTS injury_notes TEXT,
  ADD COLUMN IF NOT EXISTS has_target_race BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_race_name TEXT,
  ADD COLUMN IF NOT EXISTS target_race_date DATE;
