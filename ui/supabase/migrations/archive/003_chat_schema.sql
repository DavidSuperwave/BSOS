-- Update chat_sessions: add company scoping + session types
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS session_type text DEFAULT 'main' CHECK (session_type IN ('main', 'inbox', 'campaign', 'research', 'cron')),
  ADD COLUMN IF NOT EXISTS openclaw_session_key text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  ADD COLUMN IF NOT EXISTS context_ref text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS summary_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_tokens integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS message_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_company ON chat_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_type ON chat_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);

-- chat_messages: Individual message rows
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL DEFAULT '',
  tool_calls jsonb,
  tokens_used integer DEFAULT 0,
  model text,
  is_compacted boolean DEFAULT false,
  compacted_into uuid REFERENCES chat_messages(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_compacted ON chat_messages(session_id, is_compacted);
