-- Knowledge Base Tool Execution Logging
-- Tracks when agents create/update documents via chat

CREATE TABLE IF NOT EXISTS knowledge_tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    tool TEXT NOT NULL, -- 'create_document', 'update_document', etc.
    params JSONB NOT NULL, -- Parameters passed to tool
    result JSONB, -- Result from execution
    document_id TEXT, -- ID of affected document (if applicable)
    agent_type TEXT NOT NULL DEFAULT 'main', -- 'main', 'campaign', 'inbox'
    session_key TEXT NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    execution_time_ms INTEGER, -- How long the tool took
    error TEXT -- Error message if failed
);

-- Indexes for common queries
CREATE INDEX idx_knowledge_tool_exec_company ON knowledge_tool_executions(company_id, executed_at DESC);
CREATE INDEX idx_knowledge_tool_exec_session ON knowledge_tool_executions(session_key);
CREATE INDEX idx_knowledge_tool_exec_document ON knowledge_tool_executions(document_id);
CREATE INDEX idx_knowledge_tool_exec_tool ON knowledge_tool_executions(tool, company_id);

-- View: Recent document changes by agents
CREATE OR REPLACE VIEW agent_document_changes AS
SELECT 
    t.company_id,
    t.tool,
    t.params->>'title' as document_title,
    t.params->>'folder' as folder,
    t.document_id,
    t.agent_type,
    t.executed_at,
    t.result->>'success' as success,
    c.name as company_name
FROM knowledge_tool_executions t
JOIN companies c ON c.id = t.company_id
WHERE t.tool IN ('create_document', 'update_document')
ORDER BY t.executed_at DESC;
