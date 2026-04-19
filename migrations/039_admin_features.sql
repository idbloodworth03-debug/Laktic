-- 039: Admin features — banned emails + suspended flag on profiles
CREATE TABLE IF NOT EXISTS banned_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  reason     TEXT,
  banned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE athlete_profiles ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE coach_profiles   ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE;
