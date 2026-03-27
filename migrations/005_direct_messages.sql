-- Direct messages between athletes and their coach

CREATE TABLE direct_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES coach_profiles(id)   ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('athlete', 'coach')),
  content     text NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 5000),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX ON direct_messages (athlete_id, coach_id, created_at);
