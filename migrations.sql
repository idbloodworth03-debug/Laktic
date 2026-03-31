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

-- Migration 021 — Sprint 3 growth features
-- username, referrals, share_events, share_card_url, license_type
-- ─────────────────────────────────────────────────────────────────

-- Athlete profile additions
ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_credit_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_sections JSONB NOT NULL DEFAULT '{"races":true,"stats":true,"milestones":true}';

-- Coach profile additions
ALTER TABLE public.coach_profiles
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_credit_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS license_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (license_type IN ('individual','team','enterprise'));

-- Race results: share card URL
ALTER TABLE public.race_results
  ADD COLUMN IF NOT EXISTS share_card_url TEXT;

-- Referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID        NOT NULL,
  referrer_type   TEXT        NOT NULL CHECK (referrer_type IN ('athlete','coach')),
  referred_email  TEXT,
  referred_user_id UUID,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','signed_up','converted')),
  reward_granted  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals(referrer_id);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Share events
CREATE TABLE IF NOT EXISTS public.share_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  UUID        NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL,
  platform    TEXT,
  shared_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS share_events_athlete_idx ON public.share_events(athlete_id, shared_at DESC);
ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;

-- Migration 022 — Sprint 4 revenue expansion
-- marketplace_plans, plan_purchases, coach_certifications, recruiting, admin
-- ─────────────────────────────────────────────────────────────────────────────

-- Athlete pro tier
ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free','pro')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ;

-- Coach certified badge
ALTER TABLE public.coach_profiles
  ADD COLUMN IF NOT EXISTS certified_coach BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS certification_completed_at TIMESTAMPTZ;

-- Training plan marketplace
CREATE TABLE IF NOT EXISTS public.marketplace_plans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    UUID        NOT NULL REFERENCES public.coach_profiles(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL,
  sport       TEXT        NOT NULL DEFAULT 'running',
  level       TEXT        NOT NULL DEFAULT 'intermediate'
                          CHECK (level IN ('beginner','intermediate','advanced')),
  duration_weeks INTEGER  NOT NULL DEFAULT 12,
  price_cents INTEGER     NOT NULL DEFAULT 0,
  published   BOOLEAN     NOT NULL DEFAULT FALSE,
  preview_pdf_url TEXT,
  full_pdf_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS marketplace_plans_coach_idx ON public.marketplace_plans(coach_id);
CREATE INDEX IF NOT EXISTS marketplace_plans_published_idx ON public.marketplace_plans(published, sport, level);
ALTER TABLE public.marketplace_plans ENABLE ROW LEVEL SECURITY;

-- Plan purchases
CREATE TABLE IF NOT EXISTS public.plan_purchases (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID        NOT NULL REFERENCES public.marketplace_plans(id) ON DELETE CASCADE,
  athlete_id      UUID        NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  stripe_session_id TEXT,
  amount_paid_cents INTEGER   NOT NULL DEFAULT 0,
  purchased_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS plan_purchases_athlete_idx ON public.plan_purchases(athlete_id, purchased_at DESC);
ALTER TABLE public.plan_purchases ENABLE ROW LEVEL SECURITY;

-- Coach certification
CREATE TABLE IF NOT EXISTS public.coach_certifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    UUID        NOT NULL REFERENCES public.coach_profiles(id) ON DELETE CASCADE UNIQUE,
  quiz_scores JSONB       NOT NULL DEFAULT '{}',
  modules_completed INTEGER NOT NULL DEFAULT 0,
  passed      BOOLEAN     NOT NULL DEFAULT FALSE,
  stripe_session_id TEXT,
  payment_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.coach_certifications ENABLE ROW LEVEL SECURITY;

-- College recruiting — athlete profiles
CREATE TABLE IF NOT EXISTS public.recruiting_profiles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      UUID        NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE UNIQUE,
  gpa             NUMERIC(3,2),
  graduation_year INTEGER,
  target_distance TEXT,
  highlight_video_url TEXT,
  recruiting_notes TEXT,
  visible         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.recruiting_profiles ENABLE ROW LEVEL SECURITY;

-- Recruiter accounts
CREATE TABLE IF NOT EXISTS public.recruiter_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  name            TEXT        NOT NULL,
  school          TEXT        NOT NULL,
  division        TEXT        NOT NULL DEFAULT 'D1'
                              CHECK (division IN ('D1','D2','D3','NAIA','JUCO')),
  email           TEXT        NOT NULL,
  stripe_session_id TEXT,
  active          BOOLEAN     NOT NULL DEFAULT FALSE,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.recruiter_accounts ENABLE ROW LEVEL SECURITY;

-- Migration 023 — coach community posts
-- Allow coaches to post to the community feed.
-- athlete_id becomes nullable; new coach_id column identifies coach posts.
-- Constraint ensures every post has exactly one author (athlete XOR coach).
ALTER TABLE public.team_feed
  ALTER COLUMN athlete_id DROP NOT NULL;

ALTER TABLE public.team_feed
  ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES public.coach_profiles(id) ON DELETE CASCADE;

ALTER TABLE public.team_feed
  DROP CONSTRAINT IF EXISTS team_feed_author_check;

ALTER TABLE public.team_feed
  ADD CONSTRAINT team_feed_author_check
    CHECK (
      (athlete_id IS NOT NULL AND coach_id IS NULL) OR
      (athlete_id IS NULL     AND coach_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS team_feed_coach_idx ON public.team_feed(coach_id, created_at DESC)
  WHERE coach_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- Migration 024 — Row Level Security Policies (all tables)
--
-- Schema verified from migrations.sql before writing this migration.
-- Column names confirmed:
--   team_challenges:     challenger_team_id | challenged_team_id
--   direct_messages:     athlete_id | coach_id | sender_role | read_at  (table exists)
--   marketplace_plans:   published  (BOOLEAN — NOT is_published)
--   recruiting_profiles: visible    (BOOLEAN — NOT is_visible_to_recruiters)
--   recruiter_accounts:  active     (BOOLEAN — NOT verified)
--   marketplace_coaches: approval_status = 'approved'
--   race_results:        exists (confirmed via ALTER TABLE in migration 021)
--   community_challenges: does NOT exist — omitted
--
-- Safety guarantees:
--   • ENABLE ROW LEVEL SECURITY is idempotent — safe to re-run.
--   • DROP POLICY IF EXISTS before every CREATE POLICY — no conflict errors.
--   • Every statement is in its own DO $$ BEGIN ... EXCEPTION ... END $$ block.
--     A missing table or any other error emits a NOTICE and never stops the script.
-- ─────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════════
-- STEP 1 — Enable RLS on every table (idempotent; unknown tables caught)
-- ════════════════════════════════════════════════════════════════════

DO $$ BEGIN ALTER TABLE public.coach_profiles            ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] coach_profiles: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.athlete_profiles          ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] athlete_profiles: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.coach_bots                ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] coach_bots: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.bot_workouts              ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] bot_workouts: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.coach_knowledge_documents ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] coach_knowledge_documents: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.knowledge_doc_versions    ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] knowledge_doc_versions: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.athlete_seasons           ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] athlete_seasons: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.chat_messages             ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] chat_messages: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.teams                     ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] teams: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.team_members              ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] team_members: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.team_calendar_events      ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] team_calendar_events: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.attendance_records        ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] attendance_records: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.athlete_body_metrics      ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] athlete_body_metrics: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.fuel_log                  ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] fuel_log: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.push_subscriptions        ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] push_subscriptions: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.athlete_activities        ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] athlete_activities: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.race_results              ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] race_results: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.weekly_summaries          ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] weekly_summaries: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.strava_connections        ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] strava_connections: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.daily_readiness           ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] daily_readiness: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.injury_risk_scores        ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] injury_risk_scores: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.performance_predictions   ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] performance_predictions: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.race_gameplans            ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] race_gameplans: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.race_debriefs             ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] race_debriefs: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.recovery_profiles         ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] recovery_profiles: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.plan_jobs                 ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] plan_jobs: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.direct_messages           ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] direct_messages: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.coach_digests             ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] coach_digests: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.marketplace_coaches       ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] marketplace_coaches: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.team_feed                 ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] team_feed: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.feed_kudos                ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] feed_kudos: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.milestones                ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] milestones: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.challenges                ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] challenges: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.challenge_participants    ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] challenge_participants: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.team_challenges           ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] team_challenges: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.referrals                 ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] referrals: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.share_events              ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] share_events: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.marketplace_plans         ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] marketplace_plans: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.plan_purchases            ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] plan_purchases: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.coach_certifications      ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] coach_certifications: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.recruiting_profiles       ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] recruiting_profiles: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.recruiter_accounts        ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] recruiter_accounts: %', SQLERRM; END $$;


-- ════════════════════════════════════════════════════════════════════
-- STEP 2 — Policies
--
-- Naming convention: "<table_prefix>__<role>_<operation>_<scope>"
-- Each policy is in its own DO block — one failure never stops another.
-- DROP POLICY IF EXISTS before CREATE POLICY prevents duplicate-name errors.
-- ════════════════════════════════════════════════════════════════════


-- ── coach_profiles ───────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "cp__coach_select_own" ON public.coach_profiles;
  CREATE POLICY "cp__coach_select_own" ON public.coach_profiles
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] cp__coach_select_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "cp__coach_update_own" ON public.coach_profiles;
  CREATE POLICY "cp__coach_update_own" ON public.coach_profiles
    FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] cp__coach_update_own: %', SQLERRM; END $$;

-- Athletes on the coach's team may read the coach's profile
DO $$ BEGIN
  DROP POLICY IF EXISTS "cp__athlete_select_their_coach" ON public.coach_profiles;
  CREATE POLICY "cp__athlete_select_their_coach" ON public.coach_profiles
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = coach_profiles.id
          AND tm.athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] cp__athlete_select_their_coach: %', SQLERRM; END $$;


-- ── athlete_profiles ─────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "ap__athlete_select_own" ON public.athlete_profiles;
  CREATE POLICY "ap__athlete_select_own" ON public.athlete_profiles
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ap__athlete_select_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "ap__athlete_update_own" ON public.athlete_profiles;
  CREATE POLICY "ap__athlete_update_own" ON public.athlete_profiles
    FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ap__athlete_update_own: %', SQLERRM; END $$;

-- Coaches may read profiles of athletes on their team
DO $$ BEGIN
  DROP POLICY IF EXISTS "ap__coach_select_team_athletes" ON public.athlete_profiles;
  CREATE POLICY "ap__coach_select_team_athletes" ON public.athlete_profiles
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = athlete_profiles.id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ap__coach_select_team_athletes: %', SQLERRM; END $$;


-- ── coach_bots ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "cb__coach_all_own" ON public.coach_bots;
  CREATE POLICY "cb__coach_all_own" ON public.coach_bots
    FOR ALL USING (coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid()));
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] cb__coach_all_own: %', SQLERRM; END $$;

-- Any authenticated user may read published bots (marketplace browsing)
DO $$ BEGIN
  DROP POLICY IF EXISTS "cb__auth_select_published" ON public.coach_bots;
  CREATE POLICY "cb__auth_select_published" ON public.coach_bots
    FOR SELECT USING (is_published = TRUE AND auth.uid() IS NOT NULL);
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] cb__auth_select_published: %', SQLERRM; END $$;

-- Athletes on the team may read their team's bot even when unpublished
DO $$ BEGIN
  DROP POLICY IF EXISTS "cb__athlete_select_team_bot" ON public.coach_bots;
  CREATE POLICY "cb__athlete_select_team_bot" ON public.coach_bots
    FOR SELECT USING (
      id IN (
        SELECT t.default_bot_id FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE tm.athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND tm.left_at IS NULL
          AND t.default_bot_id IS NOT NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] cb__athlete_select_team_bot: %', SQLERRM; END $$;


-- ── bot_workouts ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "bw__coach_all_own" ON public.bot_workouts;
  CREATE POLICY "bw__coach_all_own" ON public.bot_workouts
    FOR ALL USING (
      bot_id IN (
        SELECT id FROM public.coach_bots
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] bw__coach_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "bw__athlete_select_team" ON public.bot_workouts;
  CREATE POLICY "bw__athlete_select_team" ON public.bot_workouts
    FOR SELECT USING (
      bot_id IN (
        SELECT t.default_bot_id FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE tm.athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND tm.left_at IS NULL
          AND t.default_bot_id IS NOT NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] bw__athlete_select_team: %', SQLERRM; END $$;


-- ── coach_knowledge_documents ────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "ckd__coach_all_own" ON public.coach_knowledge_documents;
  CREATE POLICY "ckd__coach_all_own" ON public.coach_knowledge_documents
    FOR ALL USING (
      coach_bot_id IN (
        SELECT id FROM public.coach_bots
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ckd__coach_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "ckd__athlete_select_team" ON public.coach_knowledge_documents;
  CREATE POLICY "ckd__athlete_select_team" ON public.coach_knowledge_documents
    FOR SELECT USING (
      coach_bot_id IN (
        SELECT t.default_bot_id FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE tm.athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND tm.left_at IS NULL
          AND t.default_bot_id IS NOT NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ckd__athlete_select_team: %', SQLERRM; END $$;


-- ── knowledge_doc_versions ───────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "kdv__coach_all_own" ON public.knowledge_doc_versions;
  CREATE POLICY "kdv__coach_all_own" ON public.knowledge_doc_versions
    FOR ALL USING (
      doc_id IN (
        SELECT kd.id FROM public.coach_knowledge_documents kd
        JOIN public.coach_bots cb ON cb.id = kd.coach_bot_id
        WHERE cb.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] kdv__coach_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "kdv__athlete_select_team" ON public.knowledge_doc_versions;
  CREATE POLICY "kdv__athlete_select_team" ON public.knowledge_doc_versions
    FOR SELECT USING (
      doc_id IN (
        SELECT kd.id FROM public.coach_knowledge_documents kd
        JOIN public.coach_bots cb ON cb.id = kd.coach_bot_id
        JOIN public.teams t ON t.default_bot_id = cb.id
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE tm.athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] kdv__athlete_select_team: %', SQLERRM; END $$;


-- ── athlete_seasons ──────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "aseason__athlete_all_own" ON public.athlete_seasons;
  CREATE POLICY "aseason__athlete_all_own" ON public.athlete_seasons
    FOR ALL USING (athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid()));
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] aseason__athlete_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "aseason__coach_select_team" ON public.athlete_seasons;
  CREATE POLICY "aseason__coach_select_team" ON public.athlete_seasons
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = athlete_seasons.athlete_id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] aseason__coach_select_team: %', SQLERRM; END $$;


-- ── chat_messages ────────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "chat__athlete_all_own" ON public.chat_messages;
  CREATE POLICY "chat__athlete_all_own" ON public.chat_messages
    FOR ALL USING (
      season_id IN (
        SELECT id FROM public.athlete_seasons
        WHERE athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] chat__athlete_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "chat__coach_select_team" ON public.chat_messages;
  CREATE POLICY "chat__coach_select_team" ON public.chat_messages
    FOR SELECT USING (
      season_id IN (
        SELECT s.id FROM public.athlete_seasons s
        JOIN public.teams t ON t.default_bot_id = s.bot_id
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = s.athlete_id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] chat__coach_select_team: %', SQLERRM; END $$;


-- ── teams ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "teams__coach_all_own" ON public.teams;
  CREATE POLICY "teams__coach_all_own" ON public.teams
    FOR ALL USING (coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid()));
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] teams__coach_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "teams__athlete_select_member" ON public.teams;
  CREATE POLICY "teams__athlete_select_member" ON public.teams
    FOR SELECT USING (
      id IN (
        SELECT team_id FROM public.team_members
        WHERE athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] teams__athlete_select_member: %', SQLERRM; END $$;


-- ── team_members ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "tm__coach_all_own_team" ON public.team_members;
  CREATE POLICY "tm__coach_all_own_team" ON public.team_members
    FOR ALL USING (
      team_id IN (
        SELECT id FROM public.teams
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tm__coach_all_own_team: %', SQLERRM; END $$;

-- Athlete may see their own membership rows
DO $$ BEGIN
  DROP POLICY IF EXISTS "tm__athlete_select_own" ON public.team_members;
  CREATE POLICY "tm__athlete_select_own" ON public.team_members
    FOR SELECT USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tm__athlete_select_own: %', SQLERRM; END $$;

-- Athlete may see other members on their teams (roster pages)
DO $$ BEGIN
  DROP POLICY IF EXISTS "tm__athlete_select_teammates" ON public.team_members;
  CREATE POLICY "tm__athlete_select_teammates" ON public.team_members
    FOR SELECT USING (
      team_id IN (
        SELECT tm2.team_id FROM public.team_members tm2
        WHERE tm2.athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND tm2.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tm__athlete_select_teammates: %', SQLERRM; END $$;


-- ── team_calendar_events ─────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "tce__coach_all_own" ON public.team_calendar_events;
  CREATE POLICY "tce__coach_all_own" ON public.team_calendar_events
    FOR ALL USING (coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid()));
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tce__coach_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tce__athlete_select_team" ON public.team_calendar_events;
  CREATE POLICY "tce__athlete_select_team" ON public.team_calendar_events
    FOR SELECT USING (
      team_id IN (
        SELECT team_id FROM public.team_members
        WHERE athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tce__athlete_select_team: %', SQLERRM; END $$;


-- ── attendance_records ───────────────────────────────────────────────────────

-- Coach manages all attendance for their team's events
DO $$ BEGIN
  DROP POLICY IF EXISTS "ar__coach_all_team" ON public.attendance_records;
  CREATE POLICY "ar__coach_all_team" ON public.attendance_records
    FOR ALL USING (
      event_id IN (
        SELECT id FROM public.team_calendar_events
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ar__coach_all_team: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "ar__athlete_select_own" ON public.attendance_records;
  CREATE POLICY "ar__athlete_select_own" ON public.attendance_records
    FOR SELECT USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ar__athlete_select_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "ar__athlete_insert_own" ON public.attendance_records;
  CREATE POLICY "ar__athlete_insert_own" ON public.attendance_records
    FOR INSERT WITH CHECK (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ar__athlete_insert_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "ar__athlete_update_own" ON public.attendance_records;
  CREATE POLICY "ar__athlete_update_own" ON public.attendance_records
    FOR UPDATE USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ar__athlete_update_own: %', SQLERRM; END $$;


-- ── athlete_body_metrics ─────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "abm__athlete_all_own" ON public.athlete_body_metrics;
  CREATE POLICY "abm__athlete_all_own" ON public.athlete_body_metrics
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] abm__athlete_all_own: %', SQLERRM; END $$;


-- ── fuel_log ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "fl__athlete_all_own" ON public.fuel_log;
  CREATE POLICY "fl__athlete_all_own" ON public.fuel_log
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] fl__athlete_all_own: %', SQLERRM; END $$;


-- ── push_subscriptions ───────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "psub__user_all_own" ON public.push_subscriptions;
  CREATE POLICY "psub__user_all_own" ON public.push_subscriptions
    FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] psub__user_all_own: %', SQLERRM; END $$;


-- ── athlete_activities ───────────────────────────────────────────────────────
-- (table exists; CREATE TABLE not in this file — wrapped to be safe)

DO $$ BEGIN
  DROP POLICY IF EXISTS "aa__athlete_all_own" ON public.athlete_activities;
  CREATE POLICY "aa__athlete_all_own" ON public.athlete_activities
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] aa__athlete_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "aa__coach_select_team" ON public.athlete_activities;
  CREATE POLICY "aa__coach_select_team" ON public.athlete_activities
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = athlete_activities.athlete_id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] aa__coach_select_team: %', SQLERRM; END $$;


-- ── race_results ─────────────────────────────────────────────────────────────
-- (table exists — confirmed by ALTER TABLE in migration 021)

DO $$ BEGIN
  DROP POLICY IF EXISTS "rr__athlete_all_own" ON public.race_results;
  CREATE POLICY "rr__athlete_all_own" ON public.race_results
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] rr__athlete_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "rr__coach_select_team" ON public.race_results;
  CREATE POLICY "rr__coach_select_team" ON public.race_results
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = race_results.athlete_id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] rr__coach_select_team: %', SQLERRM; END $$;


-- ── weekly_summaries ─────────────────────────────────────────────────────────
-- (table may not exist — fully wrapped)

DO $$ BEGIN
  DROP POLICY IF EXISTS "ws__athlete_all_own" ON public.weekly_summaries;
  CREATE POLICY "ws__athlete_all_own" ON public.weekly_summaries
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ws__athlete_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "ws__coach_select_team" ON public.weekly_summaries;
  CREATE POLICY "ws__coach_select_team" ON public.weekly_summaries
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = weekly_summaries.athlete_id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ws__coach_select_team: %', SQLERRM; END $$;


-- ── strava_connections ───────────────────────────────────────────────────────
-- (table may not exist — fully wrapped)

DO $$ BEGIN
  DROP POLICY IF EXISTS "sconn__athlete_all_own" ON public.strava_connections;
  CREATE POLICY "sconn__athlete_all_own" ON public.strava_connections
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] sconn__athlete_all_own: %', SQLERRM; END $$;


-- ── daily_readiness ──────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "dr__athlete_select_own" ON public.daily_readiness;
  CREATE POLICY "dr__athlete_select_own" ON public.daily_readiness
    FOR SELECT USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] dr__athlete_select_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "dr__coach_select_team" ON public.daily_readiness;
  CREATE POLICY "dr__coach_select_team" ON public.daily_readiness
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = daily_readiness.athlete_id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] dr__coach_select_team: %', SQLERRM; END $$;


-- ── injury_risk_scores ───────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "irs__athlete_select_own" ON public.injury_risk_scores;
  CREATE POLICY "irs__athlete_select_own" ON public.injury_risk_scores
    FOR SELECT USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] irs__athlete_select_own: %', SQLERRM; END $$;

-- Coaches can read AND update (flag/dismiss) risk scores for their team
DO $$ BEGIN
  DROP POLICY IF EXISTS "irs__coach_all_team" ON public.injury_risk_scores;
  CREATE POLICY "irs__coach_all_team" ON public.injury_risk_scores
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = injury_risk_scores.athlete_id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] irs__coach_all_team: %', SQLERRM; END $$;


-- ── performance_predictions ──────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "pp__athlete_select_own" ON public.performance_predictions;
  CREATE POLICY "pp__athlete_select_own" ON public.performance_predictions
    FOR SELECT USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] pp__athlete_select_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "pp__coach_select_team" ON public.performance_predictions;
  CREATE POLICY "pp__coach_select_team" ON public.performance_predictions
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = performance_predictions.athlete_id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] pp__coach_select_team: %', SQLERRM; END $$;


-- ── race_gameplans ───────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "rg__athlete_select_own" ON public.race_gameplans;
  CREATE POLICY "rg__athlete_select_own" ON public.race_gameplans
    FOR SELECT USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] rg__athlete_select_own: %', SQLERRM; END $$;

-- Coaches can read AND approve/update gameplans for their team
DO $$ BEGIN
  DROP POLICY IF EXISTS "rg__coach_all_team" ON public.race_gameplans;
  CREATE POLICY "rg__coach_all_team" ON public.race_gameplans
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = race_gameplans.athlete_id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] rg__coach_all_team: %', SQLERRM; END $$;


-- ── race_debriefs ────────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "rd__athlete_all_own" ON public.race_debriefs;
  CREATE POLICY "rd__athlete_all_own" ON public.race_debriefs
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] rd__athlete_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "rd__coach_select_team" ON public.race_debriefs;
  CREATE POLICY "rd__coach_select_team" ON public.race_debriefs
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = race_debriefs.athlete_id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] rd__coach_select_team: %', SQLERRM; END $$;


-- ── recovery_profiles ────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "recov__athlete_all_own" ON public.recovery_profiles;
  CREATE POLICY "recov__athlete_all_own" ON public.recovery_profiles
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] recov__athlete_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "recov__coach_select_team" ON public.recovery_profiles;
  CREATE POLICY "recov__coach_select_team" ON public.recovery_profiles
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.teams t
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          AND tm.athlete_id = recovery_profiles.athlete_id
          AND tm.left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] recov__coach_select_team: %', SQLERRM; END $$;


-- ── plan_jobs ────────────────────────────────────────────────────────────────
-- Athletes may only read — backend writes via service role

DO $$ BEGIN
  DROP POLICY IF EXISTS "pj__athlete_select_own" ON public.plan_jobs;
  CREATE POLICY "pj__athlete_select_own" ON public.plan_jobs
    FOR SELECT USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] pj__athlete_select_own: %', SQLERRM; END $$;


-- ── direct_messages ──────────────────────────────────────────────────────────
-- Verified columns: athlete_id, coach_id, sender_role, read_at

DO $$ BEGIN
  DROP POLICY IF EXISTS "dm__athlete_select_thread" ON public.direct_messages;
  CREATE POLICY "dm__athlete_select_thread" ON public.direct_messages
    FOR SELECT USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] dm__athlete_select_thread: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "dm__coach_select_thread" ON public.direct_messages;
  CREATE POLICY "dm__coach_select_thread" ON public.direct_messages
    FOR SELECT USING (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] dm__coach_select_thread: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "dm__athlete_insert" ON public.direct_messages;
  CREATE POLICY "dm__athlete_insert" ON public.direct_messages
    FOR INSERT WITH CHECK (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
      AND sender_role = 'athlete'
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] dm__athlete_insert: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "dm__coach_insert" ON public.direct_messages;
  CREATE POLICY "dm__coach_insert" ON public.direct_messages
    FOR INSERT WITH CHECK (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      AND sender_role = 'coach'
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] dm__coach_insert: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "dm__athlete_update_read" ON public.direct_messages;
  CREATE POLICY "dm__athlete_update_read" ON public.direct_messages
    FOR UPDATE USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] dm__athlete_update_read: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "dm__coach_update_read" ON public.direct_messages;
  CREATE POLICY "dm__coach_update_read" ON public.direct_messages
    FOR UPDATE USING (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] dm__coach_update_read: %', SQLERRM; END $$;


-- ── coach_digests ────────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "cd__coach_all_own" ON public.coach_digests;
  CREATE POLICY "cd__coach_all_own" ON public.coach_digests
    FOR ALL USING (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] cd__coach_all_own: %', SQLERRM; END $$;


-- ── marketplace_coaches ──────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "mc__coach_all_own" ON public.marketplace_coaches;
  CREATE POLICY "mc__coach_all_own" ON public.marketplace_coaches
    FOR ALL USING (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] mc__coach_all_own: %', SQLERRM; END $$;

-- Any authenticated user may browse approved marketplace coaches
DO $$ BEGIN
  DROP POLICY IF EXISTS "mc__auth_select_approved" ON public.marketplace_coaches;
  CREATE POLICY "mc__auth_select_approved" ON public.marketplace_coaches
    FOR SELECT USING (approval_status = 'approved' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] mc__auth_select_approved: %', SQLERRM; END $$;


-- ── team_feed ────────────────────────────────────────────────────────────────
-- Public-scope posts are readable by all authenticated users.
-- Team-scope posts are readable only by that team's members and coach.

DO $$ BEGIN
  DROP POLICY IF EXISTS "tf__select_team_or_public" ON public.team_feed;
  CREATE POLICY "tf__select_team_or_public" ON public.team_feed
    FOR SELECT USING (
      scope = 'public'
      OR team_id IN (
        SELECT team_id FROM public.team_members
        WHERE athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND left_at IS NULL
      )
      OR team_id IN (
        SELECT id FROM public.teams
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tf__select_team_or_public: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tf__athlete_insert_own" ON public.team_feed;
  CREATE POLICY "tf__athlete_insert_own" ON public.team_feed
    FOR INSERT WITH CHECK (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
      AND team_id IN (
        SELECT team_id FROM public.team_members
        WHERE athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND left_at IS NULL
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tf__athlete_insert_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tf__athlete_delete_own" ON public.team_feed;
  CREATE POLICY "tf__athlete_delete_own" ON public.team_feed
    FOR DELETE USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tf__athlete_delete_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tf__coach_insert_own" ON public.team_feed;
  CREATE POLICY "tf__coach_insert_own" ON public.team_feed
    FOR INSERT WITH CHECK (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      AND team_id IN (
        SELECT id FROM public.teams
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tf__coach_insert_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tf__coach_delete_own" ON public.team_feed;
  CREATE POLICY "tf__coach_delete_own" ON public.team_feed
    FOR DELETE USING (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tf__coach_delete_own: %', SQLERRM; END $$;


-- ── feed_kudos ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "fk__select_visible_posts" ON public.feed_kudos;
  CREATE POLICY "fk__select_visible_posts" ON public.feed_kudos
    FOR SELECT USING (
      feed_post_id IN (
        SELECT id FROM public.team_feed
        WHERE scope = 'public'
          OR team_id IN (
            SELECT team_id FROM public.team_members
            WHERE athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
              AND left_at IS NULL
          )
          OR team_id IN (
            SELECT id FROM public.teams
            WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
          )
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] fk__select_visible_posts: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "fk__athlete_insert_own" ON public.feed_kudos;
  CREATE POLICY "fk__athlete_insert_own" ON public.feed_kudos
    FOR INSERT WITH CHECK (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] fk__athlete_insert_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "fk__athlete_delete_own" ON public.feed_kudos;
  CREATE POLICY "fk__athlete_delete_own" ON public.feed_kudos
    FOR DELETE USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] fk__athlete_delete_own: %', SQLERRM; END $$;


-- ── milestones ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "mil__athlete_all_own" ON public.milestones;
  CREATE POLICY "mil__athlete_all_own" ON public.milestones
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] mil__athlete_all_own: %', SQLERRM; END $$;


-- ── challenges ───────────────────────────────────────────────────────────────
-- All authenticated users can read; only coaches can write

DO $$ BEGIN
  DROP POLICY IF EXISTS "ch__auth_select_all" ON public.challenges;
  CREATE POLICY "ch__auth_select_all" ON public.challenges
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ch__auth_select_all: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "ch__coach_insert_own" ON public.challenges;
  CREATE POLICY "ch__coach_insert_own" ON public.challenges
    FOR INSERT WITH CHECK (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ch__coach_insert_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "ch__coach_update_own" ON public.challenges;
  CREATE POLICY "ch__coach_update_own" ON public.challenges
    FOR UPDATE USING (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ch__coach_update_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "ch__coach_delete_own" ON public.challenges;
  CREATE POLICY "ch__coach_delete_own" ON public.challenges
    FOR DELETE USING (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ch__coach_delete_own: %', SQLERRM; END $$;


-- ── challenge_participants ───────────────────────────────────────────────────
-- All authenticated can read participant lists (leaderboards)

DO $$ BEGIN
  DROP POLICY IF EXISTS "chp__auth_select_all" ON public.challenge_participants;
  CREATE POLICY "chp__auth_select_all" ON public.challenge_participants
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] chp__auth_select_all: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "chp__athlete_insert_own" ON public.challenge_participants;
  CREATE POLICY "chp__athlete_insert_own" ON public.challenge_participants
    FOR INSERT WITH CHECK (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] chp__athlete_insert_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "chp__athlete_delete_own" ON public.challenge_participants;
  CREATE POLICY "chp__athlete_delete_own" ON public.challenge_participants
    FOR DELETE USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] chp__athlete_delete_own: %', SQLERRM; END $$;


-- ── team_challenges ──────────────────────────────────────────────────────────
-- Verified columns: challenger_team_id, challenged_team_id
-- Members of either team (athletes + coach) may read; only challenger coach may insert

DO $$ BEGIN
  DROP POLICY IF EXISTS "tc__select_involved" ON public.team_challenges;
  CREATE POLICY "tc__select_involved" ON public.team_challenges
    FOR SELECT USING (
      challenger_team_id IN (
        SELECT team_id FROM public.team_members
        WHERE athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND left_at IS NULL
        UNION ALL
        SELECT id FROM public.teams
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
      OR challenged_team_id IN (
        SELECT team_id FROM public.team_members
        WHERE athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
          AND left_at IS NULL
        UNION ALL
        SELECT id FROM public.teams
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tc__select_involved: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tc__coach_insert" ON public.team_challenges;
  CREATE POLICY "tc__coach_insert" ON public.team_challenges
    FOR INSERT WITH CHECK (
      challenger_team_id IN (
        SELECT id FROM public.teams
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tc__coach_insert: %', SQLERRM; END $$;

-- Both coaches (challenger and challenged) may update status
DO $$ BEGIN
  DROP POLICY IF EXISTS "tc__coach_update" ON public.team_challenges;
  CREATE POLICY "tc__coach_update" ON public.team_challenges
    FOR UPDATE USING (
      challenger_team_id IN (
        SELECT id FROM public.teams
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
      OR challenged_team_id IN (
        SELECT id FROM public.teams
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tc__coach_update: %', SQLERRM; END $$;


-- ── marketplace_plans ────────────────────────────────────────────────────────
-- Verified column: published (BOOLEAN) — NOT is_published

DO $$ BEGIN
  DROP POLICY IF EXISTS "mp__coach_all_own" ON public.marketplace_plans;
  CREATE POLICY "mp__coach_all_own" ON public.marketplace_plans
    FOR ALL USING (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] mp__coach_all_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "mp__auth_select_published" ON public.marketplace_plans;
  CREATE POLICY "mp__auth_select_published" ON public.marketplace_plans
    FOR SELECT USING (published = TRUE AND auth.uid() IS NOT NULL);
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] mp__auth_select_published: %', SQLERRM; END $$;


-- ── plan_purchases ───────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "pu__athlete_all_own" ON public.plan_purchases;
  CREATE POLICY "pu__athlete_all_own" ON public.plan_purchases
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] pu__athlete_all_own: %', SQLERRM; END $$;

-- Coaches may see who purchased their plans (sales reporting)
DO $$ BEGIN
  DROP POLICY IF EXISTS "pu__coach_select_sales" ON public.plan_purchases;
  CREATE POLICY "pu__coach_select_sales" ON public.plan_purchases
    FOR SELECT USING (
      plan_id IN (
        SELECT id FROM public.marketplace_plans
        WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] pu__coach_select_sales: %', SQLERRM; END $$;


-- ── coach_certifications ─────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "cc__coach_all_own" ON public.coach_certifications;
  CREATE POLICY "cc__coach_all_own" ON public.coach_certifications
    FOR ALL USING (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] cc__coach_all_own: %', SQLERRM; END $$;


-- ── recruiting_profiles ──────────────────────────────────────────────────────
-- Verified column: visible (BOOLEAN) — NOT is_visible_to_recruiters

DO $$ BEGIN
  DROP POLICY IF EXISTS "rec__athlete_all_own" ON public.recruiting_profiles;
  CREATE POLICY "rec__athlete_all_own" ON public.recruiting_profiles
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] rec__athlete_all_own: %', SQLERRM; END $$;

-- Active recruiters may read athlete profiles where visible = TRUE
DO $$ BEGIN
  DROP POLICY IF EXISTS "rec__recruiter_select_visible" ON public.recruiting_profiles;
  CREATE POLICY "rec__recruiter_select_visible" ON public.recruiting_profiles
    FOR SELECT USING (
      visible = TRUE
      AND EXISTS (
        SELECT 1 FROM public.recruiter_accounts
        WHERE user_id = auth.uid() AND active = TRUE
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] rec__recruiter_select_visible: %', SQLERRM; END $$;


-- ── recruiter_accounts ───────────────────────────────────────────────────────
-- Verified column: active (BOOLEAN) — NOT verified

DO $$ BEGIN
  DROP POLICY IF EXISTS "ra__recruiter_all_own" ON public.recruiter_accounts;
  CREATE POLICY "ra__recruiter_all_own" ON public.recruiter_accounts
    FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ra__recruiter_all_own: %', SQLERRM; END $$;


-- ── referrals ────────────────────────────────────────────────────────────────
-- referrer_id is a profile UUID (not auth.uid()) — use referrer_type to resolve.
-- referred_user_id IS auth.uid() (the new signup's auth user).

DO $$ BEGIN
  DROP POLICY IF EXISTS "ref__user_select_own" ON public.referrals;
  CREATE POLICY "ref__user_select_own" ON public.referrals
    FOR SELECT USING (
      ( referrer_type = 'athlete'
        AND referrer_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid()) )
      OR ( referrer_type = 'coach'
        AND referrer_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid()) )
      OR referred_user_id = auth.uid()
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ref__user_select_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "ref__user_insert_own" ON public.referrals;
  CREATE POLICY "ref__user_insert_own" ON public.referrals
    FOR INSERT WITH CHECK (
      ( referrer_type = 'athlete'
        AND referrer_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid()) )
      OR ( referrer_type = 'coach'
        AND referrer_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid()) )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] ref__user_insert_own: %', SQLERRM; END $$;


-- ── share_events ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "se__athlete_all_own" ON public.share_events;
  CREATE POLICY "se__athlete_all_own" ON public.share_events
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] se__athlete_all_own: %', SQLERRM; END $$;


-- ════════════════════════════════════════════════════════════════════
-- END Migration 024
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- Migration 025 — Fix team_feed RLS: allow public posts with null team_id
-- Athletes and coaches without a team can post to scope='public'.
-- ════════════════════════════════════════════════════════════════════

-- Update athlete insert policy: allow team_id=NULL for public scope
DO $$ BEGIN
  DROP POLICY IF EXISTS "tf__athlete_insert_own" ON public.team_feed;
  CREATE POLICY "tf__athlete_insert_own" ON public.team_feed
    FOR INSERT WITH CHECK (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
      AND (
        -- Public posts: no team required
        (scope = 'public' AND team_id IS NULL)
        -- Public or team posts with a valid team membership
        OR team_id IN (
          SELECT team_id FROM public.team_members
          WHERE athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
            AND left_at IS NULL
        )
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tf__athlete_insert_own: %', SQLERRM; END $$;

-- Update coach insert policy: allow team_id=NULL for public scope
DO $$ BEGIN
  DROP POLICY IF EXISTS "tf__coach_insert_own" ON public.team_feed;
  CREATE POLICY "tf__coach_insert_own" ON public.team_feed
    FOR INSERT WITH CHECK (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      AND (
        -- Public posts: no team required
        (scope = 'public' AND team_id IS NULL)
        -- Public or team posts with a valid team
        OR team_id IN (
          SELECT id FROM public.teams
          WHERE coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
        )
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] tf__coach_insert_own: %', SQLERRM; END $$;

-- Update select policy: public posts with null team_id are visible to all authenticated users
-- (existing scope='public' check already handles this since it doesn't filter on team_id)
-- No change needed to tf__select_team_or_public — scope='public' already covers null team_id.

-- ════════════════════════════════════════════════════════════════════
-- END Migration 025
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- Migration 026 — post_comments table + feed_kudos coach support
-- ════════════════════════════════════════════════════════════════════

-- Comments on community posts
CREATE TABLE IF NOT EXISTS public.post_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID        NOT NULL REFERENCES public.team_feed(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL,
  author_type TEXT        NOT NULL CHECK (author_type IN ('athlete', 'coach')),
  author_name TEXT        NOT NULL,
  content     TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS post_comments_post_idx ON public.post_comments(post_id, created_at ASC);

DO $$ BEGIN ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN RAISE NOTICE '[RLS enable] post_comments: %', SQLERRM; END $$;

-- SELECT: anyone authenticated can read comments on public posts, team members on team posts
DO $$ BEGIN
  DROP POLICY IF EXISTS "pc__select_public" ON public.post_comments;
  CREATE POLICY "pc__select_public" ON public.post_comments
    FOR SELECT USING (
      post_id IN (
        SELECT id FROM public.team_feed WHERE scope = 'public'
        UNION
        SELECT tf.id FROM public.team_feed tf
          JOIN public.team_members tm ON tm.team_id = tf.team_id
          WHERE tm.athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
            AND tm.left_at IS NULL
        UNION
        SELECT tf.id FROM public.team_feed tf
          JOIN public.teams t ON t.id = tf.team_id
          WHERE t.coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
      )
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] pc__select_public: %', SQLERRM; END $$;

-- INSERT: any authenticated user with a profile can comment
DO $$ BEGIN
  DROP POLICY IF EXISTS "pc__insert_authenticated" ON public.post_comments;
  CREATE POLICY "pc__insert_authenticated" ON public.post_comments
    FOR INSERT WITH CHECK (
      (author_type = 'athlete' AND author_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid()))
      OR
      (author_type = 'coach'   AND author_id = (SELECT id FROM public.coach_profiles  WHERE user_id = auth.uid()))
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] pc__insert_authenticated: %', SQLERRM; END $$;

-- DELETE: own comments only
DO $$ BEGIN
  DROP POLICY IF EXISTS "pc__delete_own" ON public.post_comments;
  CREATE POLICY "pc__delete_own" ON public.post_comments
    FOR DELETE USING (
      (author_type = 'athlete' AND author_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid()))
      OR
      (author_type = 'coach'   AND author_id = (SELECT id FROM public.coach_profiles  WHERE user_id = auth.uid()))
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] pc__delete_own: %', SQLERRM; END $$;

-- Add coach_id to feed_kudos so coaches can like posts
DO $$ BEGIN
  ALTER TABLE public.feed_kudos ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES public.coach_profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN RAISE NOTICE '[alter] feed_kudos add coach_id: %', SQLERRM; END $$;

-- Coach insert policy for feed_kudos
DO $$ BEGIN
  DROP POLICY IF EXISTS "fk__coach_insert_own" ON public.feed_kudos;
  CREATE POLICY "fk__coach_insert_own" ON public.feed_kudos
    FOR INSERT WITH CHECK (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] fk__coach_insert_own: %', SQLERRM; END $$;

-- Coach delete policy for feed_kudos
DO $$ BEGIN
  DROP POLICY IF EXISTS "fk__coach_delete_own" ON public.feed_kudos;
  CREATE POLICY "fk__coach_delete_own" ON public.feed_kudos
    FOR DELETE USING (
      coach_id = (SELECT id FROM public.coach_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] fk__coach_delete_own: %', SQLERRM; END $$;

-- ════════════════════════════════════════════════════════════════════
-- END Migration 026
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- Migration 027 — Drop NOT NULL on team_feed.team_id
-- Migration 025 updated RLS to allow team_id IS NULL for public posts
-- but never dropped the column-level NOT NULL constraint. Athletes and
-- coaches without a team get a DB error when posting publicly.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.team_feed ALTER COLUMN team_id DROP NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- END Migration 027
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- Migration 028 — Profile picture (avatar_url) support
-- Adds avatar_url TEXT column to both profile tables.
-- Also creates the public 'avatars' storage bucket and its policies.
-- Run the full block below in the Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.athlete_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.coach_profiles   ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Storage bucket (idempotent via INSERT ... ON CONFLICT)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public            = true,
  file_size_limit   = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS: authenticated users can upload/update their own avatar
DO $$ BEGIN
  DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
  CREATE POLICY "avatars_insert_own" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'avatars'
      AND auth.uid()::text = (string_to_array(name, '/'))[1]
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] avatars_insert_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
  CREATE POLICY "avatars_update_own" ON storage.objects
    FOR UPDATE USING (
      bucket_id = 'avatars'
      AND auth.uid()::text = (string_to_array(name, '/'))[1]
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] avatars_update_own: %', SQLERRM; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
  CREATE POLICY "avatars_select_public" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] avatars_select_public: %', SQLERRM; END $$;

-- ════════════════════════════════════════════════════════════════════
-- END Migration 028
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- Migration 029 — Extended athlete profile for personalized plans
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.athlete_profiles ADD COLUMN IF NOT EXISTS current_weekly_mileage NUMERIC;
ALTER TABLE public.athlete_profiles ADD COLUMN IF NOT EXISTS pr_10k TEXT;
ALTER TABLE public.athlete_profiles ADD COLUMN IF NOT EXISTS pr_half_marathon TEXT;
ALTER TABLE public.athlete_profiles ADD COLUMN IF NOT EXISTS pr_marathon TEXT;
ALTER TABLE public.athlete_profiles ADD COLUMN IF NOT EXISTS experience_level TEXT;
ALTER TABLE public.athlete_profiles ADD COLUMN IF NOT EXISTS long_run_distance NUMERIC;

-- ════════════════════════════════════════════════════════════════════
-- END Migration 029
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- Migration 030 — Workout Completions
-- Tracks which plan workouts an athlete has marked as complete.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.workout_completions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id   UUID NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  season_id    UUID,
  workout_date DATE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(athlete_id, workout_date)
);

ALTER TABLE public.workout_completions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "wc__athlete_own" ON public.workout_completions;
  CREATE POLICY "wc__athlete_own" ON public.workout_completions
    FOR ALL USING (
      athlete_id = (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN others THEN RAISE NOTICE '[policy] wc__athlete_own: %', SQLERRM; END $$;

-- ════════════════════════════════════════════════════════════════════
-- END Migration 030
-- ════════════════════════════════════════════════════════════════════
