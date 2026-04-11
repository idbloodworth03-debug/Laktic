-- Chat conversations: group messages into named sessions
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       UUID REFERENCES public.athlete_seasons(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL DEFAULT 'New Conversation',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link existing and future messages to a conversation
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE;
