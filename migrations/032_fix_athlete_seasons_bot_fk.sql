-- Migration 032 — Fix athlete_seasons bot_id FK to SET NULL on coach delete
-- Fixes: ERROR 23503 violates foreign key constraint "athlete_seasons_bot_id_fkey"
-- when deleting a coach user whose bot is still referenced by athlete seasons.

-- Fix athlete_seasons table
ALTER TABLE public.athlete_seasons
  DROP CONSTRAINT IF EXISTS athlete_seasons_bot_id_fkey;

ALTER TABLE public.athlete_seasons
  ADD CONSTRAINT athlete_seasons_bot_id_fkey
  FOREIGN KEY (bot_id) REFERENCES public.coach_bots(id) ON DELETE SET NULL;

-- Fix any plan_generation_jobs or similar table with same issue
DO $$ BEGIN
  ALTER TABLE public.plan_jobs
    DROP CONSTRAINT IF EXISTS plan_jobs_bot_id_fkey;
  ALTER TABLE public.plan_jobs
    ADD CONSTRAINT plan_jobs_bot_id_fkey
    FOREIGN KEY (bot_id) REFERENCES public.coach_bots(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'plan_jobs table does not exist, skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE public.plan_generation_jobs
    DROP CONSTRAINT IF EXISTS plan_generation_jobs_bot_id_fkey;
  ALTER TABLE public.plan_generation_jobs
    ADD CONSTRAINT plan_generation_jobs_bot_id_fkey
    FOREIGN KEY (bot_id) REFERENCES public.coach_bots(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'plan_generation_jobs table does not exist, skipping.';
END $$;
