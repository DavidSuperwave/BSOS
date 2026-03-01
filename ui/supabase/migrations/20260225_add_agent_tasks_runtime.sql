-- ============================================================
-- Agent task runtime (subagents, approvals, artifacts)
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    parent_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    child_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    agent_type TEXT NOT NULL CHECK (agent_type IN ('main', 'campaigns', 'crm', 'inbox', 'research', 'knowledge')),
    objective TEXT NOT NULL,
    inputs JSONB DEFAULT '{}'::jsonb,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'blocked', 'completed', 'failed', 'cancelled')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    current_step TEXT,
    result JSONB,
    error_message TEXT,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_company ON agent_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_parent_session ON agent_tasks(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(company_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created ON agent_tasks(created_at DESC);

ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on agent_tasks" ON agent_tasks;
CREATE POLICY "Service role full access on agent_tasks" ON agent_tasks
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS agent_task_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'blocked', 'completed', 'failed', 'cancelled')),
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_task_steps_task ON agent_task_steps(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_task_steps_created ON agent_task_steps(task_id, created_at);

ALTER TABLE agent_task_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on agent_task_steps" ON agent_task_steps;
CREATE POLICY "Service role full access on agent_task_steps" ON agent_task_steps
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS agent_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    reason TEXT,
    requested_by TEXT,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_company ON agent_approvals(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_task ON agent_approvals(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_status ON agent_approvals(status);

ALTER TABLE agent_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on agent_approvals" ON agent_approvals;
CREATE POLICY "Service role full access on agent_approvals" ON agent_approvals
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS agent_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    task_id UUID REFERENCES agent_tasks(id) ON DELETE SET NULL,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    artifact_type TEXT NOT NULL,
    name TEXT NOT NULL,
    content JSONB,
    storage_path TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_company ON agent_artifacts(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_task ON agent_artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_session ON agent_artifacts(session_id);

ALTER TABLE agent_artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on agent_artifacts" ON agent_artifacts;
CREATE POLICY "Service role full access on agent_artifacts" ON agent_artifacts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION create_agent_tasks_tables_if_needed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- no-op keeper function; tables are migration-managed
  RETURN;
END;
$$;
