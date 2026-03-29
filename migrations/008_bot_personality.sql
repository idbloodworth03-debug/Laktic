-- Migration 008: Add personality fields to coach_bots
ALTER TABLE coach_bots
  ADD COLUMN IF NOT EXISTS personality TEXT NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS personality_prompt TEXT;
