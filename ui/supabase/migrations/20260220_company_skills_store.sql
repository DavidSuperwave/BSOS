-- ============================================================
-- Company-local Skills Store (registry + assignments + env)
-- ============================================================

CREATE TABLE IF NOT EXISTS company_skill_registry (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    version TEXT DEFAULT '1.0.0',
    skill_md TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_company_skill_registry_company
    ON company_skill_registry(company_id);
CREATE INDEX IF NOT EXISTS idx_company_skill_registry_slug
    ON company_skill_registry(company_id, slug);

ALTER TABLE company_skill_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on company_skill_registry" ON company_skill_registry;
CREATE POLICY "Service role full access on company_skill_registry" ON company_skill_registry
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_company_skill_registry_updated_at ON company_skill_registry;
CREATE TRIGGER update_company_skill_registry_updated_at
    BEFORE UPDATE ON company_skill_registry
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS company_agent_skill_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    skill_slug TEXT NOT NULL,
    agent_type TEXT NOT NULL CHECK (agent_type IN ('main', 'campaigns', 'crm', 'inbox')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    install_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (install_status IN ('pending', 'installed', 'error', 'disabled')),
    install_message TEXT,
    install_stdout TEXT,
    install_stderr TEXT,
    install_code INTEGER,
    install_warnings JSONB DEFAULT '[]'::JSONB,
    installer_id TEXT,
    last_error TEXT,
    installed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, skill_slug, agent_type),
    FOREIGN KEY (company_id, skill_slug)
      REFERENCES company_skill_registry(company_id, slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_company_agent_skill_assignments_company
    ON company_agent_skill_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_company_agent_skill_assignments_company_agent
    ON company_agent_skill_assignments(company_id, agent_type);
CREATE INDEX IF NOT EXISTS idx_company_agent_skill_assignments_company_slug
    ON company_agent_skill_assignments(company_id, skill_slug);

ALTER TABLE company_agent_skill_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on company_agent_skill_assignments" ON company_agent_skill_assignments;
CREATE POLICY "Service role full access on company_agent_skill_assignments" ON company_agent_skill_assignments
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_company_agent_skill_assignments_updated_at ON company_agent_skill_assignments;
CREATE TRIGGER update_company_agent_skill_assignments_updated_at
    BEFORE UPDATE ON company_agent_skill_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS company_agent_skill_env (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    assignment_id UUID NOT NULL UNIQUE REFERENCES company_agent_skill_assignments(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    skill_slug TEXT NOT NULL,
    agent_type TEXT NOT NULL CHECK (agent_type IN ('main', 'campaigns', 'crm', 'inbox')),
    api_key TEXT,
    env JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, skill_slug, agent_type),
    FOREIGN KEY (company_id, skill_slug, agent_type)
      REFERENCES company_agent_skill_assignments(company_id, skill_slug, agent_type)
      ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_company_agent_skill_env_company
    ON company_agent_skill_env(company_id);
CREATE INDEX IF NOT EXISTS idx_company_agent_skill_env_company_agent
    ON company_agent_skill_env(company_id, agent_type);

ALTER TABLE company_agent_skill_env ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on company_agent_skill_env" ON company_agent_skill_env;
CREATE POLICY "Service role full access on company_agent_skill_env" ON company_agent_skill_env
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_company_agent_skill_env_updated_at ON company_agent_skill_env;
CREATE TRIGGER update_company_agent_skill_env_updated_at
    BEFORE UPDATE ON company_agent_skill_env
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
