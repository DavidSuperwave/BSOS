-- events: Agent-generated notifications
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_id uuid REFERENCES chat_sessions(id),
  event_type text NOT NULL CHECK (event_type IN ('action_item', 'insight', 'alert', 'status_update', 'cron_result')),
  title text NOT NULL,
  description text,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  actions jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'acted', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_company ON events(company_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(company_id, status);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(company_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(company_id, created_at DESC);

-- tool_invocations: Audit log of agent tool calls
CREATE TABLE IF NOT EXISTS tool_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_id uuid REFERENCES chat_sessions(id),
  message_id uuid REFERENCES chat_messages(id),
  tool_name text NOT NULL,
  tool_tier text DEFAULT 'open' CHECK (tool_tier IN ('open', 'provisioned', 'proxied')),
  input_params jsonb,
  output_summary text,
  status text DEFAULT 'success' CHECK (status IN ('success', 'error', 'timeout')),
  error_message text,
  duration_ms integer,
  tokens_used integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_invocations_company ON tool_invocations(company_id);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_session ON tool_invocations(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_tool ON tool_invocations(tool_name);

-- research_jobs: Research pipeline tracking
CREATE TABLE IF NOT EXISTS research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_id uuid REFERENCES chat_sessions(id),
  job_type text NOT NULL CHECK (job_type IN ('market', 'tam', 'icp', 'competitor', 'custom')),
  query text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result jsonb,
  citations jsonb DEFAULT '[]'::jsonb,
  supermemory_synced boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_research_jobs_company ON research_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON research_jobs(company_id, status);
