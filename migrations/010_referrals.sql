-- Migration 010: Referral system
-- Adds referral_code + referral_credit_days to both profile tables,
-- and creates the referrals tracking table.

-- ── Athlete profiles ──────────────────────────────────────────────────────────
ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_credit_days INTEGER NOT NULL DEFAULT 0;

-- ── Coach profiles ────────────────────────────────────────────────────────────
ALTER TABLE coach_profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_credit_days INTEGER NOT NULL DEFAULT 0;

-- ── Referrals table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL,
  referrer_type TEXT NOT NULL CHECK (referrer_type IN ('athlete', 'coach')),
  referred_email TEXT,
  referred_user_id UUID,
  status TEXT NOT NULL DEFAULT 'signed_up' CHECK (status IN ('pending', 'signed_up', 'converted')),
  reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referrals_referrer_id_idx ON referrals (referrer_id);
CREATE INDEX IF NOT EXISTS referrals_referred_user_id_idx ON referrals (referred_user_id);
