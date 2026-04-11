-- Add 3000m and 3200m PR fields to athlete_profiles.
-- These are the shortest distances the Lactic Pacing Calculator v2 accepts
-- as aerobic indicators (spec section 7: "only use performances of 3000m or longer").
ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS pr_3000m TEXT,
  ADD COLUMN IF NOT EXISTS pr_3200m TEXT;
