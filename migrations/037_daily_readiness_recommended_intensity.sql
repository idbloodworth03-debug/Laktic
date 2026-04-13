-- Migration 037: Add recommended_intensity column to daily_readiness
-- This column is derived from the readiness score and used by the coaching AI context.

ALTER TABLE public.daily_readiness
  ADD COLUMN IF NOT EXISTS recommended_intensity TEXT;
