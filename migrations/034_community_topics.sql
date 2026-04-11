-- Add topic column to team_feed for community topic filtering
ALTER TABLE team_feed
  ADD COLUMN IF NOT EXISTS topic TEXT NOT NULL DEFAULT 'general'
    CHECK (topic IN ('general','running','apparel','races','fun'));
