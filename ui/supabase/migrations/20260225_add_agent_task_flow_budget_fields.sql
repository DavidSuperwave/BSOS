-- ============================================================
-- Agent task flow and budget metadata
-- ============================================================

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS flow_id TEXT,
  ADD COLUMN IF NOT EXISTS step_id TEXT,
  ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_actions INTEGER,
  ADD COLUMN IF NOT EXISTS actions_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hard_stop_behavior TEXT CHECK (hard_stop_behavior IN ('summarize', 'ask_approval', 'abort')),
  ADD COLUMN IF NOT EXISTS worker_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_flow ON agent_tasks(flow_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_dead_letter ON agent_tasks(dead_lettered_at);

