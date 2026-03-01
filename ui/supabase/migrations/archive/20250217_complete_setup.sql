-- ============================================================
-- GTM ENGINE - COMPLETE DATABASE SETUP (New Supabase Instance)
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/wmncawwcgnotizhowzii/sql/new
-- ============================================================

-- 1. COMPANIES TABLE (Root table for multi-tenancy)
CREATE TABLE IF NOT EXISTS companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    domain TEXT,
    plusvibe_workspace_id TEXT,
    supermemory_namespace TEXT,
    supermemory_container_tag TEXT,
    settings JSONB DEFAULT '{}',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on companies" ON companies
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 2. COMPANY USERS TABLE (Multi-user access per company)
CREATE TABLE IF NOT EXISTS company_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID,
    email TEXT,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    joined_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id);
CREATE INDEX IF NOT EXISTS idx_company_users_user ON company_users(user_id);
CREATE INDEX IF NOT EXISTS idx_company_users_email ON company_users(email);

ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on company_users" ON company_users
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 3. COMPANY AGENTS TABLE (Pre-provisioned agents per company)
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

-- 4. CHAT SESSIONS TABLE (Isolated chat sessions per company/agent)
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

-- 5. CHAT MESSAGES TABLE (Messages with tool tracking)
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

-- 6. COMPANY INTEGRATIONS TABLE (API keys & sync status)
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

-- 7. KNOWLEDGE DOCUMENTS TABLE (RAG documents)
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_company ON knowledge_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_documents(category);

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on knowledge" ON knowledge_documents
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 8. INBOX MESSAGES TABLE (Email replies)
CREATE TABLE IF NOT EXISTS inbox_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    thread_id TEXT,
    campaign_id TEXT,
    sender JSONB,
    subject TEXT,
    body TEXT,
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbox_company ON inbox_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_inbox_thread ON inbox_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_campaign ON inbox_messages(campaign_id);

ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on inbox" ON inbox_messages
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 9. HELPER FUNCTION: Increment session message count
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

-- 10. INSERT DEFAULT COMPANY (Superwave)
INSERT INTO companies (name, slug, domain, plusvibe_workspace_id, supermemory_namespace, settings)
VALUES (
    'Superwave',
    'superwave',
    'superwave.ai',
    '678eb62a071ff7544034bcde',
    'blitzscale:company:superwave',
    '{"default": true, "created_by": "migration"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- 11. VERIFY SETUP
DO $$
DECLARE
    company_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO company_count FROM companies;
    RAISE NOTICE '✅ Database setup complete!';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - companies (multi-tenant root)';
    RAISE NOTICE '  - company_users (access control)';
    RAISE NOTICE '  - company_agents (pre-provisioned agents)';
    RAISE NOTICE '  - chat_sessions (isolated chat sessions)';
    RAISE NOTICE '  - chat_messages (messages with tool tracking)';
    RAISE NOTICE '  - company_integrations (API keys & sync status)';
    RAISE NOTICE '  - knowledge_documents (RAG documents)';
    RAISE NOTICE '  - inbox_messages (email replies)';
    RAISE NOTICE '';
    RAISE NOTICE 'Default company created: %', company_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Deploy OpenClaw Gateway to Railway';
    RAISE NOTICE '  2. Deploy GTM Engine UI to Railway';
    RAISE NOTICE '  3. Get company ID: SELECT id FROM companies WHERE slug = ''superwave'';';
    RAISE NOTICE '  4. Provision agents: POST /api/companies/{id}/agents/provision';
END $$;
