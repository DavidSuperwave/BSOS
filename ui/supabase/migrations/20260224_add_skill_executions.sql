-- ============================================================
-- Skill execution traces for tag-based insight provenance
-- ============================================================

CREATE TABLE IF NOT EXISTS skill_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    context_id TEXT,
    session_key TEXT,
    trace_id TEXT,
    input_refs JSONB,
    input_params JSONB,
    steps JSONB[] DEFAULT '{}',
    output_summary TEXT,
    output_insight_ids TEXT[] DEFAULT '{}',
    tokens_used INTEGER,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_executions_company_created
    ON skill_executions(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_executions_session
    ON skill_executions(session_key);

CREATE INDEX IF NOT EXISTS idx_skill_executions_trace
    ON skill_executions(trace_id);

CREATE INDEX IF NOT EXISTS idx_skill_executions_skill
    ON skill_executions(skill_id, company_id, created_at DESC);

ALTER TABLE skill_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on skill_executions" ON skill_executions;
CREATE POLICY "Service role full access on skill_executions" ON skill_executions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
