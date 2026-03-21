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
