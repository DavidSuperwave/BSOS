-- ============================================================
-- GTM ENGINE - MULTI-TENANT AGENT DEPLOYMENT
-- Run this in Supabase SQL Editor before deploying to Railway
-- ============================================================

-- 1. COMPANY AGENTS TABLE
-- Stores pre-provisioned agents for each company
CREATE TABLE IF NOT EXISTS company_agents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    agent_type TEXT NOT NULL CHECK (agent_type IN ('main', 'campaigns', 'crm', 'inbox')),
    agent_name TEXT,
    model TEXT DEFAULT 'kimi-coding/k2p5',
    workspace_path TEXT,
    available_tools TEXT[],
    allowed_contexts TEXT[],
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, agent_type)
);

CREATE INDEX IF NOT EXISTS idx_company_agents_company ON company_agents(company_id);
CREATE INDEX IF NOT EXISTS idx_company_agents_agent_id ON company_agents(agent_id);

ALTER TABLE company_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on company_agents" ON company_agents
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 2. CHAT SESSIONS TABLE
-- Isolated chat sessions per company/agent
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID,
    agent_id TEXT,
    session_type TEXT DEFAULT 'main' CHECK (session_type IN ('main', 'campaigns', 'crm', 'inbox')),
    component_context JSONB,
    context_scope JSONB,
    title TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
    message_count INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_company ON chat_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent ON chat_sessions(agent_id);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on chat_sessions" ON chat_sessions
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 3. CHAT MESSAGES TABLE
-- Stores all chat messages with tool call tracking
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tool_calls JSONB,
    tokens_used INTEGER,
    model TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on chat_messages" ON chat_messages
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 4. COMPANY INTEGRATIONS TABLE
-- Stores API keys and sync status per service
CREATE TABLE IF NOT EXISTS company_integrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    service TEXT NOT NULL,
    api_key TEXT,
    config JSONB DEFAULT '{}',
    sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, service)
);

CREATE INDEX IF NOT EXISTS idx_company_integrations_company ON company_integrations(company_id);

ALTER TABLE company_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on company_integrations" ON company_integrations
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 5. ADD SUPERMEMORY CONTAINER TAG TO COMPANIES TABLE
-- Add if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'companies' AND column_name = 'supermemory_container_tag'
    ) THEN
        ALTER TABLE companies ADD COLUMN supermemory_container_tag TEXT;
    END IF;
END $$;

-- 6. HELPER FUNCTION: Increment session message count
CREATE OR REPLACE FUNCTION increment_session_message_count(
    session_uuid UUID,
    token_count INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
    UPDATE chat_sessions
    SET message_count = message_count + 1,
        token_count = token_count + token_count,
        updated_at = NOW()
    WHERE id = session_uuid;
END;
$$ LANGUAGE plpgsql;

-- 7. VERIFY SETUP
DO $$
DECLARE
    company_count INTEGER;
    agent_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO company_count FROM companies;
    RAISE NOTICE '✅ Migration complete!';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - company_agents (pre-provisioned agents per company)';
    RAISE NOTICE '  - chat_sessions (isolated chat sessions)';
    RAISE NOTICE '  - chat_messages (messages with tool tracking)';
    RAISE NOTICE '  - company_integrations (API keys & sync status)';
    RAISE NOTICE '';
    RAISE NOTICE 'Current companies: %', company_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Deploy OpenClaw Gateway to Railway';
    RAISE NOTICE '  2. Deploy GTM Engine UI to Railway';
    RAISE NOTICE '  3. Provision agents: POST /api/companies/{id}/agents/provision';
END $$;
