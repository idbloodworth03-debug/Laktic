-- Laktic Phase 1A — Database Migrations
-- Run these in order in the Supabase SQL Editor.
-- Supabase Auth manages auth.users — do not create that table.

-- ─────────────────────────────────────────────────────────────────
-- Migration 001 — coach_profiles
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.coach_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'coach',
  name TEXT NOT NULL,
  school_or_org TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- Migration 002 — athlete_profiles
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.athlete_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'athlete',
  name TEXT NOT NULL,
  weekly_volume_miles FLOAT DEFAULT 20,
  primary_events TEXT[] DEFAULT '{}',
  pr_mile TEXT,
  pr_5k TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- Migration 003 — coach_bots
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.coach_bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES coach_profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  name TEXT NOT NULL,
  philosophy TEXT NOT NULL,
  event_focus TEXT,
  level_focus TEXT CHECK (level_focus IN ('beginner','intermediate','advanced','elite')),
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- Migration 004 — bot_workouts
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.bot_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES coach_bots(id) ON DELETE CASCADE NOT NULL,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  title TEXT NOT NULL,
  description TEXT,
  distance_miles FLOAT,
  pace_guideline TEXT,
  ai_adjustable BOOLEAN DEFAULT TRUE,
  UNIQUE (bot_id, day_of_week)
);

-- ─────────────────────────────────────────────────────────────────
-- Migration 005 — coach_knowledge_documents
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.coach_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_bot_id UUID REFERENCES coach_bots(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'philosophy', 'sample_week', 'training_block',
    'taper', 'injury_rule', 'faq', 'notes'
  )),
  content_text TEXT NOT NULL,
  source_file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- Migration 006 — athlete_seasons
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.athlete_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES athlete_profiles(id) ON DELETE CASCADE NOT NULL,
  bot_id UUID REFERENCES coach_bots(id) NOT NULL,
  race_calendar JSONB NOT NULL DEFAULT '[]',
  season_plan JSONB NOT NULL DEFAULT '[]',
  ai_used BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX one_active_season_per_athlete
  ON athlete_seasons(athlete_id) WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────────
-- Migration 007 — chat_messages
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES athlete_seasons(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('athlete','bot')),
  content TEXT NOT NULL,
  plan_was_updated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- Row Level Security (recommended)
-- Enable RLS on all tables and use service role key on backend.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- The backend uses the service role key which bypasses RLS.
-- No client-side RLS policies needed for this architecture.

-- ─────────────────────────────────────────────────────────────────
-- Migration 008 — trial period support
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.coach_profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days');

-- Back-fill existing coaches so they get 14 days from now if not yet set
UPDATE public.coach_profiles SET trial_ends_at = (NOW() + INTERVAL '14 days') WHERE trial_ends_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- Migration 009 — team_calendar_events + attendance_records
-- (Phase 2 — already applied if you ran the Phase 2 branch)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES coach_profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  default_bot_id UUID REFERENCES coach_bots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  athlete_id UUID REFERENCES athlete_profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','injured','inactive')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, athlete_id)
);

CREATE TABLE IF NOT EXISTS public.team_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  coach_id UUID REFERENCES coach_profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('practice','race','off_day','travel','meeting','other')),
  event_date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  location_name TEXT,
  location_lat FLOAT,
  location_lng FLOAT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES team_calendar_events(id) ON DELETE CASCADE NOT NULL,
  athlete_id UUID REFERENCES athlete_profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','excused','late')),
  check_in_at TIMESTAMPTZ,
  check_in_lat FLOAT,
  check_in_lng FLOAT,
  marked_by TEXT CHECK (marked_by IN ('gps','self','coach')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, athlete_id)
);

-- ─────────────────────────────────────────────────────────────────
-- Migration 010 — athlete_body_metrics + fuel_log (Phase 3)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.athlete_body_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES athlete_profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  weight_kg FLOAT,
  height_cm FLOAT,
  sweat_rate_ml_per_hr FLOAT DEFAULT 500,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fuel_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES athlete_profiles(id) ON DELETE CASCADE NOT NULL,
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  calories INT,
  carbs_g FLOAT,
  protein_g FLOAT,
  hydration_ml INT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- Migration 011 — push_subscriptions (Phase 3)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- ─────────────────────────────────────────────────────────────────
-- Migration 012 — Phase 4: Marketplace + Content Versioning + Social Feed
-- ─────────────────────────────────────────────────────────────────

-- 4.1 Elite Coaching Marketplace
CREATE TABLE IF NOT EXISTS public.marketplace_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES public.coach_profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  bio TEXT NOT NULL,
  credentials TEXT NOT NULL,
  specialization TEXT NOT NULL CHECK (specialization IN ('distance','sprints','triathlon','trail','field','cross_country','multi_event')),
  price_per_month NUMERIC(8,2) NOT NULL DEFAULT 25.00,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  last_content_refresh_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 Knowledge Document Version History
CREATE TABLE IF NOT EXISTS public.knowledge_doc_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID REFERENCES public.coach_knowledge_documents(id) ON DELETE CASCADE NOT NULL,
  version_number INT NOT NULL,
  title TEXT NOT NULL,
  content_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_doc_versions_doc_id_idx ON public.knowledge_doc_versions(doc_id, version_number DESC);

-- 4.3 Social Feed
CREATE TABLE IF NOT EXISTS public.team_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  athlete_id UUID REFERENCES public.athlete_profiles(id) ON DELETE CASCADE NOT NULL,
  feed_type TEXT NOT NULL CHECK (feed_type IN ('activity','race_result','milestone','manual')),
  activity_id UUID REFERENCES public.athlete_activities(id) ON DELETE SET NULL,
  race_result_id UUID REFERENCES public.race_results(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_feed_team_created_idx ON public.team_feed(team_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.feed_kudos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_post_id UUID REFERENCES public.team_feed(id) ON DELETE CASCADE NOT NULL,
  athlete_id UUID REFERENCES public.athlete_profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(feed_post_id, athlete_id)
);

-- ─────────────────────────────────────────────────────────────────
-- Migration 013 — plan_jobs (async plan generation tracking)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES public.athlete_profiles(id) ON DELETE CASCADE NOT NULL,
  bot_id UUID REFERENCES public.coach_bots(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'complete', 'failed')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.plan_jobs ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- Migration 014 — direct_messages
-- Athletes and coaches exchange direct messages outside the AI bot.
-- read_at is NULL until the recipient opens the thread.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID REFERENCES public.athlete_profiles(id) ON DELETE CASCADE NOT NULL,
  coach_id UUID REFERENCES public.coach_profiles(id) ON DELETE CASCADE NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('athlete', 'coach')),
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS direct_messages_coach_idx
  ON public.direct_messages(coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_athlete_coach_idx
  ON public.direct_messages(athlete_id, coach_id, created_at DESC);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- Migration 015 — teams schema drift fix
-- The backend references these columns but they were never created.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS uses_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_uses INT,
  ADD COLUMN IF NOT EXISTS invite_code_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ─────────────────────────────────────────────────────────────────
-- Migration 016 — plan_jobs source column
-- Tracks whether a job was triggered by subscribe or regenerate.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.plan_jobs
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'subscribe'
    CHECK (source IN ('subscribe', 'regenerate'));

-- ─────────────────────────────────────────────────────────────────
-- Migration 017 — direct_messages schema drift fix
-- read_at was missing if the table was created before Migration 014
-- or via a manual CREATE TABLE without all columns.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────
-- Migration 018 — multi-team support
-- Athletes can belong to multiple teams simultaneously.
-- active_team_id = which team's context is currently active.
-- left_at IS NULL = current member; IS NOT NULL = has left.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS active_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────
-- Migration 019 — community feed, milestones, challenges
-- Extends team_feed with community scope/channel/image fields.
-- Adds milestones, challenges, challenge_participants, team_challenges.
-- ─────────────────────────────────────────────────────────────────

-- Extend team_feed for community scope
ALTER TABLE public.team_feed
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'team'
    CHECK (scope IN ('team', 'public')),
  ADD COLUMN IF NOT EXISTS sport_channel TEXT
    CHECK (sport_channel IN ('track', 'xc', 'triathlon', 'road', 'swimming', 'general')),
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Milestones: personal achievements detected from activity data
CREATE TABLE IF NOT EXISTS public.milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,               -- e.g. "First 50-mile week", "10-day streak"
  milestone_type TEXT NOT NULL,      -- 'distance', 'streak', 'pr', 'race_count'
  value NUMERIC,
  shared_at TIMESTAMPTZ,             -- NULL = not yet shared to community
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS milestones_athlete_idx ON public.milestones(athlete_id, created_at DESC);
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- Challenges: coach-created group challenges
CREATE TABLE IF NOT EXISTS public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.coach_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  target_value NUMERIC NOT NULL,     -- e.g. 100
  target_unit TEXT NOT NULL,         -- e.g. 'miles', 'workouts', 'hours'
  metric TEXT NOT NULL DEFAULT 'miles', -- which activity field to sum
  sport_emoji TEXT DEFAULT '🏃',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS challenges_active_idx ON public.challenges(is_active, ends_at DESC);
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

-- Challenge participants
CREATE TABLE IF NOT EXISTS public.challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(challenge_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS challenge_participants_challenge_idx ON public.challenge_participants(challenge_id);
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;

-- Team-vs-team challenges
CREATE TABLE IF NOT EXISTS public.team_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  challenged_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  invite_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  target_unit TEXT NOT NULL DEFAULT 'miles',
  metric TEXT NOT NULL DEFAULT 'miles',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.team_challenges ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- Migration 020 — Sprint 2 AI features
-- injury_risk_scores, race_gameplans, performance_predictions,
-- race_debriefs, coach_digests, daily_readiness, recovery_profiles
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.injury_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low','moderate','high','critical')),
  factors JSONB NOT NULL DEFAULT '{}',
  explanation TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_coach BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS injury_risk_athlete_idx ON public.injury_risk_scores(athlete_id, computed_at DESC);
ALTER TABLE public.injury_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.race_gameplans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  race_event_id UUID REFERENCES public.team_calendar_events(id) ON DELETE SET NULL,
  race_name TEXT NOT NULL,
  race_date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gameplan JSONB NOT NULL DEFAULT '{}',
  coach_approved BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','delivered'))
);
CREATE INDEX IF NOT EXISTS race_gameplans_athlete_idx ON public.race_gameplans(athlete_id, race_date DESC);
ALTER TABLE public.race_gameplans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.performance_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  distance TEXT NOT NULL CHECK (distance IN ('5K','10K','half_marathon','marathon')),
  predicted_time_seconds INTEGER NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low','medium','high')),
  trend TEXT NOT NULL CHECK (trend IN ('improving','plateau','declining')),
  explanation TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(athlete_id, distance)
);
ALTER TABLE public.performance_predictions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.race_debriefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  race_result_id UUID REFERENCES public.race_results(id) ON DELETE SET NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  summary TEXT,
  insights JSONB,
  completed_at TIMESTAMPTZ,
  coach_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS race_debriefs_athlete_idx ON public.race_debriefs(athlete_id, created_at DESC);
ALTER TABLE public.race_debriefs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.coach_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.coach_profiles(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  digest_content TEXT NOT NULL,
  athlete_count INTEGER NOT NULL DEFAULT 0,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS coach_digests_coach_idx ON public.coach_digests(coach_id, sent_at DESC);
ALTER TABLE public.coach_digests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.daily_readiness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  readiness_score INTEGER NOT NULL CHECK (readiness_score BETWEEN 0 AND 100),
  recommended_intensity TEXT NOT NULL CHECK (recommended_intensity IN ('rest','easy','moderate','hard','race')),
  explanation TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(athlete_id, date)
);
CREATE INDEX IF NOT EXISTS daily_readiness_athlete_idx ON public.daily_readiness(athlete_id, date DESC);
ALTER TABLE public.daily_readiness ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.recovery_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE UNIQUE,
  hrv_baseline NUMERIC,
  avg_recovery_hours NUMERIC,
  hard_effort_pattern JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.recovery_profiles ENABLE ROW LEVEL SECURITY;
