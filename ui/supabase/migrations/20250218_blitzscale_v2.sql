
-- ============================================================
-- BLITZSCALE OS - COMPLETE DATABASE SCHEMA v2.0
-- Consolidated from all migration files + new features
-- Date: February 18, 2026
-- ============================================================

-- ============================================================
-- UTILITY FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SECTION 1: CORE MULTI-TENANCY
-- ============================================================

-- 1.1 ACCOUNTS (Organization/billing entity)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id),
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_owner ON accounts(owner_user_id);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on accounts" ON accounts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 1.2 ACCOUNT MEMBERS (User-to-account junction)
CREATE TABLE IF NOT EXISTS account_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_account_members_user ON account_members(user_id);
CREATE INDEX IF NOT EXISTS idx_account_members_account ON account_members(account_id);

ALTER TABLE account_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on account_members" ON account_members
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 1.3 COMPANIES (Core multi-tenant entity)
CREATE TABLE IF NOT EXISTS companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES accounts(id),
    user_id UUID,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    domain TEXT,
    industry TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'onboarding', 'suspended')),

    -- Onboarding
    onboarding_data JSONB DEFAULT '{}'::JSONB,
    onboarding_step INTEGER DEFAULT 0,
    onboarding_completed_at TIMESTAMPTZ,

    -- PlusVibe Integration
    plusvibe_workspace_id TEXT,
    plusvibe_api_key TEXT,
    plusvibe_enabled BOOLEAN DEFAULT false,

    -- Supermemory
    supermemory_namespace TEXT,
    supermemory_container_tag TEXT,

    -- Agent Config
    agent_status TEXT DEFAULT 'pending' CHECK (agent_status IN ('pending', 'provisioning', 'active', 'error', 'disabled')),
    agent_config JSONB DEFAULT '{}'::JSONB,
    integration_credentials JSONB DEFAULT '{}'::JSONB,

    -- Docker Container (Provisioning)
    container_name TEXT,
    container_port INTEGER,
    container_status TEXT DEFAULT 'none' CHECK (container_status IN ('none', 'pending', 'provisioning', 'running', 'error', 'stopped')),
    container_url TEXT,

    -- Telegram
    telegram_bot_token TEXT,
    telegram_chat_id TEXT,

    -- AI Provider Config
    ai_provider TEXT DEFAULT 'openrouter',
    ai_model TEXT DEFAULT 'minimax/MiniMax-M2.1',

    -- Health & Provisioning Tracking
    provisioned_at TIMESTAMPTZ,
    last_health_check TIMESTAMPTZ,

    -- Settings
    settings JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
CREATE INDEX IF NOT EXISTS idx_companies_account ON companies(account_id);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_container_status ON companies(container_status);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on companies" ON companies
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 1.4 COMPANY USERS (Legacy junction — kept for backward compat)
CREATE TABLE IF NOT EXISTS company_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID,
    email TEXT,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id);
CREATE INDEX IF NOT EXISTS idx_company_users_user ON company_users(user_id);

ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on company_users" ON company_users
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 2: AGENTS & CHAT
-- ============================================================

-- 2.1 COMPANY AGENTS (Pre-provisioned agents per company)
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
    config JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, agent_type)
);

CREATE INDEX IF NOT EXISTS idx_company_agents_company ON company_agents(company_id);
CREATE INDEX IF NOT EXISTS idx_company_agents_agent_id ON company_agents(agent_id);

ALTER TABLE company_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on company_agents" ON company_agents
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2.2 CHAT SESSIONS (Isolated per company/agent)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID,
    agent_id TEXT,
    session_type TEXT DEFAULT 'main' CHECK (session_type IN ('main', 'group', 'isolated', 'campaigns', 'crm', 'inbox')),
    component_context JSONB,
    context_scope JSONB,
    title TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed', 'completed')),
    openclaw_session_key TEXT,
    context_ref TEXT,
    summary TEXT,
    summary_updated_at TIMESTAMPTZ,

    -- Session hierarchy (sub-agent support)
    parent_session_id UUID REFERENCES chat_sessions(id),
    channel_id UUID,  -- FK added after channels table creation
    is_background BOOLEAN DEFAULT false,
    mention_gated BOOLEAN DEFAULT false,
    context_window INTEGER,
    expires_at TIMESTAMPTZ,

    -- Counters
    message_count INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_company ON chat_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent ON chat_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_type ON chat_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_parent ON chat_sessions(parent_session_id);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on chat_sessions" ON chat_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2.3 CHAT MESSAGES (With chain-of-thought support)
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL DEFAULT '',
    tool_calls JSONB,
    tokens_used INTEGER DEFAULT 0,
    model TEXT,

    -- Chain-of-thought / reasoning
    reasoning_content TEXT,
    reasoning_duration INTEGER,
    tool_steps JSONB,
    content_parts JSONB,

    -- Message compaction
    is_compacted BOOLEAN DEFAULT false,
    compacted_into UUID REFERENCES chat_messages(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_compacted ON chat_messages(session_id, is_compacted);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on chat_messages" ON chat_messages
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 3: CHANNELS & MULTI-PLATFORM ROUTING
-- ============================================================

-- 3.1 CHANNELS (Multi-platform connection registry)
CREATE TABLE IF NOT EXISTS channels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('telegram', 'whatsapp', 'slack', 'discord', 'webchat', 'email', 'sms')),
    platform_account_id TEXT,
    display_name TEXT,
    config JSONB DEFAULT '{}'::JSONB,
    webhook_url TEXT,
    webhook_secret TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disconnected', 'error')),
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, platform, platform_account_id)
);

CREATE INDEX IF NOT EXISTS idx_channels_company ON channels(company_id);
CREATE INDEX IF NOT EXISTS idx_channels_platform ON channels(platform);
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on channels" ON channels
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add FK from chat_sessions to channels now that table exists
ALTER TABLE chat_sessions
    ADD CONSTRAINT fk_chat_sessions_channel
    FOREIGN KEY (channel_id) REFERENCES channels(id);

-- 3.2 CHANNEL MESSAGES (Unified inbound/outbound log)
CREATE TABLE IF NOT EXISTS channel_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    session_id UUID REFERENCES chat_sessions(id),
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_id TEXT,
    sender_name TEXT,
    content TEXT,
    content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'video', 'audio', 'document', 'location', 'sticker')),
    media_url TEXT,
    media_metadata JSONB,
    platform_message_id TEXT,
    reply_to_id TEXT,
    status TEXT DEFAULT 'received' CHECK (status IN ('received', 'processing', 'delivered', 'failed', 'read')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_messages_company ON channel_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_session ON channel_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_sender ON channel_messages(company_id, sender_id);

ALTER TABLE channel_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on channel_messages" ON channel_messages
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 4: INBOX & EMAIL MANAGEMENT
-- ============================================================

-- 4.1 INBOX MESSAGES (Campaign email replies with AI analysis)
CREATE TABLE IF NOT EXISTS inbox_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT,
    thread_id TEXT NOT NULL,
    plusvibe_id TEXT,
    from_email TEXT NOT NULL,
    from_name TEXT,
    from_domain TEXT,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    body_text TEXT,
    sentiment TEXT DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative', 'ooo', 'auto_reply')),
    intent TEXT CHECK (intent IN ('interested', 'not_interested', 'meeting_request', 'question', 'referral')),
    tags TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied', 'archived', 'booked')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    reply_count INT DEFAULT 0,
    last_reply_at TIMESTAMPTZ,
    ai_summary TEXT,
    suggested_actions JSONB,
    company_enrichment JSONB,
    sender JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_company ON inbox_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_campaign ON inbox_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread ON inbox_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_sentiment ON inbox_messages(sentiment);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_status ON inbox_messages(status);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_priority ON inbox_messages(priority);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_created ON inbox_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_from_domain ON inbox_messages(from_domain);

ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on inbox_messages" ON inbox_messages
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_inbox_messages_updated_at
    BEFORE UPDATE ON inbox_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4.2 EMAIL THREADS
CREATE TABLE IF NOT EXISTS email_threads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL,
    prospect_email TEXT NOT NULL,
    prospect_name TEXT,
    prospect_company TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'booked', 'lost', 'nurturing')),
    message_count INT DEFAULT 0,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    ai_analysis JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_threads_company ON email_threads(company_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_campaign ON email_threads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_prospect ON email_threads(prospect_email);
CREATE INDEX IF NOT EXISTS idx_email_threads_status ON email_threads(status);

ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on email_threads" ON email_threads
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_email_threads_updated_at
    BEFORE UPDATE ON email_threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4.3 EMAIL TAGS
CREATE TABLE IF NOT EXISTS email_tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6b7280',
    category TEXT DEFAULT 'custom' CHECK (category IN ('status', 'priority', 'team', 'custom')),
    rules JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_tags_company ON email_tags(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_tags_name_company ON email_tags(company_id, name);

ALTER TABLE email_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on email_tags" ON email_tags
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 5: PIPELINE / KANBAN CRM
-- ============================================================

-- 5.1 PIPELINES (Board definitions)
CREATE TABLE IF NOT EXISTS pipelines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    stage_order UUID[] DEFAULT '{}',
    config JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_company ON pipelines(company_id);

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on pipelines" ON pipelines
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5.2 PIPELINE STAGES (Board columns)
CREATE TABLE IF NOT EXISTS pipeline_stages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6b7280',
    position INTEGER NOT NULL DEFAULT 0,
    auto_move_on JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id, position);

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on pipeline_stages" ON pipeline_stages
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5.3 PIPELINE ENTRIES (Lead/deal cards)
CREATE TABLE IF NOT EXISTS pipeline_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES pipeline_stages(id),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    contact_name TEXT,
    contact_email TEXT,
    contact_company TEXT,
    source TEXT CHECK (source IN ('plusvibe', 'manual', 'webhook', 'import', 'ai')),
    source_id TEXT,
    value DECIMAL,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    assigned_to UUID,
    custom_fields JSONB DEFAULT '{}'::JSONB,
    media JSONB DEFAULT '[]'::JSONB,
    position INTEGER DEFAULT 0,
    moved_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_entries_pipeline_stage ON pipeline_entries(pipeline_id, stage_id, position);
CREATE INDEX IF NOT EXISTS idx_pipeline_entries_company ON pipeline_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_entries_contact ON pipeline_entries(company_id, contact_email);

ALTER TABLE pipeline_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on pipeline_entries" ON pipeline_entries
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_pipeline_entries_updated_at
    BEFORE UPDATE ON pipeline_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SECTION 6: REPORTS, DOCUMENTS, MEDIA
-- ============================================================

-- 6.1 REPORTS (Saved chart configurations)
CREATE TABLE IF NOT EXISTS reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    chart_type TEXT CHECK (chart_type IN ('bar', 'line', 'area', 'pie', 'donut', 'funnel', 'scatter', 'radar')),
    data_source TEXT CHECK (data_source IN ('campaigns', 'inbox', 'pipeline', 'events', 'custom')),
    query_config JSONB DEFAULT '{}'::JSONB,
    chart_config JSONB DEFAULT '{}'::JSONB,
    pinned BOOLEAN DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_company ON reports(company_id);
CREATE INDEX IF NOT EXISTS idx_reports_pinned ON reports(company_id, pinned);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on reports" ON reports
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6.2 DOCUMENTS (Rich text with embedded charts)
CREATE TABLE IF NOT EXISTS documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content JSONB DEFAULT '{}'::JSONB,
    embedded_reports UUID[] DEFAULT '{}',
    category TEXT CHECK (category IN ('playbook', 'report', 'template', 'note')),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_by UUID,
    last_edited_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(company_id, category);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on documents" ON documents
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6.3 MEDIA FILES (File/media library)
CREATE TABLE IF NOT EXISTS media_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT CHECK (file_type IN ('image', 'video', 'audio', 'pdf', 'document')),
    mime_type TEXT,
    file_size INTEGER,
    storage_path TEXT,
    thumbnail_path TEXT,
    metadata JSONB DEFAULT '{}'::JSONB,
    uploaded_by UUID,
    context TEXT,
    context_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_files_company ON media_files(company_id);
CREATE INDEX IF NOT EXISTS idx_media_files_type ON media_files(company_id, file_type);
CREATE INDEX IF NOT EXISTS idx_media_files_context ON media_files(context, context_id);

ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on media_files" ON media_files
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 7: EVENTS, TOOLS, RESEARCH
-- ============================================================

-- 7.1 EVENTS (Agent-generated notifications)
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    session_id UUID REFERENCES chat_sessions(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('action_item', 'insight', 'alert', 'status_update', 'cron_result', 'reply_received', 'lead_qualified', 'campaign_paused')),
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    actions JSONB DEFAULT '[]'::JSONB,
    status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'acted', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_company ON events(company_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(company_id, status);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(company_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(company_id, created_at DESC);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on events" ON events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7.2 TOOL INVOCATIONS (Audit log)
CREATE TABLE IF NOT EXISTS tool_invocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    session_id UUID REFERENCES chat_sessions(id),
    message_id UUID REFERENCES chat_messages(id),
    tool_name TEXT NOT NULL,
    tool_tier TEXT DEFAULT 'open' CHECK (tool_tier IN ('open', 'provisioned', 'proxied')),
    input_params JSONB,
    output_summary TEXT,
    status TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'timeout')),
    error_message TEXT,
    duration_ms INTEGER,
    tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_invocations_company ON tool_invocations(company_id);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_session ON tool_invocations(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_tool ON tool_invocations(tool_name);

ALTER TABLE tool_invocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tool_invocations" ON tool_invocations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7.3 RESEARCH JOBS
CREATE TABLE IF NOT EXISTS research_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    session_id UUID REFERENCES chat_sessions(id),
    job_type TEXT NOT NULL CHECK (job_type IN ('market', 'tam', 'icp', 'competitor', 'custom')),
    query TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    result JSONB,
    citations JSONB DEFAULT '[]'::JSONB,
    supermemory_synced BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_research_jobs_company ON research_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON research_jobs(company_id, status);

ALTER TABLE research_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on research_jobs" ON research_jobs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 8: AUTOMATION / CRON
-- ============================================================

-- 8.1 SCHEDULED JOBS (Cron definitions)
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    cron_expression TEXT,
    job_type TEXT CHECK (job_type IN ('pipeline_summary', 'lead_enrichment', 'follow_up_check', 'inbox_digest', 'backup', 'custom')),
    config JSONB DEFAULT '{}'::JSONB,
    session_id UUID REFERENCES chat_sessions(id),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    run_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_company ON scheduled_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status ON scheduled_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at);

ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on scheduled_jobs" ON scheduled_jobs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8.2 JOB RUNS (Execution history)
CREATE TABLE IF NOT EXISTS job_runs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    result JSONB,
    error TEXT,
    duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job ON job_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_company ON job_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);

ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on job_runs" ON job_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 9: INBOXING INFRASTRUCTURE
-- ============================================================

-- 9.1 REGISTRAR CREDENTIALS
CREATE TABLE IF NOT EXISTS registrar_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('PORKBUN', 'GODADDY', 'DYNADOT', 'SPACESHIP')),
    name TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT,
    is_active BOOLEAN DEFAULT true,
    last_tested_at TIMESTAMPTZ,
    status TEXT DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_registrar_creds_company ON registrar_credentials(company_id);

ALTER TABLE registrar_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on registrar_credentials" ON registrar_credentials
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9.2 PLATFORM CONNECTIONS
CREATE TABLE IF NOT EXISTS platform_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('plusvibe', 'instantly', 'smartlead', 'email_bison')),
    name TEXT NOT NULL,
    username TEXT,
    password TEXT,
    api_key TEXT,
    workspace_id TEXT,
    extra_config JSONB DEFAULT '{}'::JSONB,
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verifying', 'verified', 'failed')),
    verification_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_connections_company ON platform_connections(company_id);
CREATE INDEX IF NOT EXISTS idx_platform_connections_platform ON platform_connections(platform);

ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on platform_connections" ON platform_connections
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9.3 INBOXING DOMAINS
CREATE TABLE IF NOT EXISTS inboxing_domains (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    domain TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'dns_setup', 'update_nameservers', 'queued', 'setting_up', 'active', 'failed', 'deleting')),
    inboxing_id TEXT,
    registrar_id UUID REFERENCES registrar_credentials(id),
    cloudflare_id TEXT,
    platform_connection_id UUID REFERENCES platform_connections(id),
    user_count INT DEFAULT 49,
    mailbox_count INT DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    campaign_id TEXT,
    redirect_url TEXT,
    redirect_type TEXT DEFAULT 'NONE' CHECK (redirect_type IN ('NONE', 'REGULAR', 'MASKED')),
    csv_available_at TIMESTAMPTZ,
    nameservers TEXT[] DEFAULT '{}',
    failure_reason TEXT,
    health_score INT DEFAULT 100,
    last_health_check TIMESTAMPTZ,
    dns_spf BOOLEAN DEFAULT false,
    dns_dkim BOOLEAN DEFAULT false,
    dns_dmarc BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inboxing_domains_company ON inboxing_domains(company_id);
CREATE INDEX IF NOT EXISTS idx_inboxing_domains_status ON inboxing_domains(status);

ALTER TABLE inboxing_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on inboxing_domains" ON inboxing_domains
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9.4 INBOXING JOBS
CREATE TABLE IF NOT EXISTS inboxing_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    domain_id UUID REFERENCES inboxing_domains(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('domain_create', 'inbox_provision', 'upload', 'health_check', 'domain_delete')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
    payload JSONB DEFAULT '{}'::JSONB,
    result JSONB,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inboxing_jobs_company ON inboxing_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_inboxing_jobs_domain ON inboxing_jobs(domain_id);
CREATE INDEX IF NOT EXISTS idx_inboxing_jobs_status ON inboxing_jobs(status);

ALTER TABLE inboxing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on inboxing_jobs" ON inboxing_jobs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 10: PLATFORM & INTEGRATIONS
-- ============================================================

-- 10.1 PLATFORM CREDENTIALS (Shared API keys - service role only)
CREATE TABLE IF NOT EXISTS platform_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service TEXT NOT NULL UNIQUE,
    api_key TEXT NOT NULL,
    config JSONB DEFAULT '{}'::JSONB,
    is_active BOOLEAN DEFAULT true,
    rotated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on platform_credentials" ON platform_credentials
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 10.2 COMPANY INTEGRATIONS
CREATE TABLE IF NOT EXISTS company_integrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    service TEXT NOT NULL,
    api_key TEXT,
    config JSONB DEFAULT '{}'::JSONB,
    sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, service)
);

CREATE INDEX IF NOT EXISTS idx_company_integrations_company ON company_integrations(company_id);

ALTER TABLE company_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on company_integrations" ON company_integrations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 11: KNOWLEDGE BASE
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_company ON knowledge_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_documents(category);

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on knowledge" ON knowledge_documents
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 12: HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION increment_session_message_count(
    session_uuid UUID,
    add_tokens INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
    UPDATE chat_sessions
    SET message_count = message_count + 1,
        token_count = COALESCE(token_count, 0) + add_tokens,
        total_tokens = COALESCE(total_tokens, 0) + add_tokens,
        updated_at = NOW()
    WHERE id = session_uuid;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SECTION 13: REALTIME SUBSCRIPTIONS
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE inbox_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE channel_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_entries;

-- ============================================================
-- SECTION 14: SEED DATA
-- ============================================================

INSERT INTO companies (name, slug, domain, plusvibe_workspace_id, supermemory_namespace, settings)
VALUES (
    'Superwave',
    'superwave',
    'superwave.ai',
    '678eb62a071ff7544034bcde',
    'blitzscale:company:superwave',
    '{"default": true, "created_by": "migration"}'::JSONB
)
ON CONFLICT (slug) DO NOTHING;
