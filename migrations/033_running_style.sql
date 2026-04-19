-- Migration 033: Add running_style column to athlete_profiles
ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS running_style TEXT;
