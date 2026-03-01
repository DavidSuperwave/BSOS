-- ============================================================
-- Chat snapshots + agent decisions for long-session retention
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    session_key TEXT NOT NULL,
    messages JSONB[] DEFAULT '{}',
    summary TEXT,
    retention_reason TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_snapshots_company_created
    ON chat_snapshots(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_snapshots_session
    ON chat_snapshots(session_key, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    session_key TEXT,
    decision TEXT,
    reasoning TEXT,
    context_refs JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_company_created
    ON agent_decisions(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_session
    ON agent_decisions(session_key, created_at DESC);

ALTER TABLE chat_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on chat_snapshots" ON chat_snapshots;
CREATE POLICY "Service role full access on chat_snapshots" ON chat_snapshots
    FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on agent_decisions" ON agent_decisions;
CREATE POLICY "Service role full access on agent_decisions" ON agent_decisions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
