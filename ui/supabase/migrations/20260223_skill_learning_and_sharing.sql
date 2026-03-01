-- ============================================================
-- Skills learning workflows + portability/share support
-- ============================================================

CREATE TABLE IF NOT EXISTS company_skill_learning_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_by UUID,
    source_type TEXT NOT NULL
        CHECK (source_type IN ('research', 'url', 'paste_docs')),
    learn_mode TEXT NOT NULL
        CHECK (learn_mode IN ('quick', 'interactive')),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'researching', 'drafting', 'validating', 'saving', 'completed', 'error', 'cancelled')),
    query TEXT,
    source_url TEXT,
    source_content TEXT,
    draft_skill_md TEXT,
    draft_metadata JSONB DEFAULT '{}'::JSONB,
    progress JSONB DEFAULT '[]'::JSONB,
    error_message TEXT,
    output_skill_slug TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (company_id, output_skill_slug)
      REFERENCES company_skill_registry(company_id, slug) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_learning_sessions_company
    ON company_skill_learning_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_skill_learning_sessions_status
    ON company_skill_learning_sessions(company_id, status);
CREATE INDEX IF NOT EXISTS idx_skill_learning_sessions_created_at
    ON company_skill_learning_sessions(company_id, created_at DESC);

ALTER TABLE company_skill_learning_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on company_skill_learning_sessions" ON company_skill_learning_sessions;
CREATE POLICY "Service role full access on company_skill_learning_sessions" ON company_skill_learning_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_company_skill_learning_sessions_updated_at ON company_skill_learning_sessions;
CREATE TRIGGER update_company_skill_learning_sessions_updated_at
    BEFORE UPDATE ON company_skill_learning_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS company_skill_blueprints (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    version TEXT DEFAULT '1.0.0',
    skill_md TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::JSONB,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_company_skill_blueprints_company
    ON company_skill_blueprints(company_id);
CREATE INDEX IF NOT EXISTS idx_company_skill_blueprints_slug
    ON company_skill_blueprints(slug);
CREATE INDEX IF NOT EXISTS idx_company_skill_blueprints_default
    ON company_skill_blueprints(is_default);

ALTER TABLE company_skill_blueprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on company_skill_blueprints" ON company_skill_blueprints;
CREATE POLICY "Service role full access on company_skill_blueprints" ON company_skill_blueprints
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_company_skill_blueprints_updated_at ON company_skill_blueprints;
CREATE TRIGGER update_company_skill_blueprints_updated_at
    BEFORE UPDATE ON company_skill_blueprints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS skill_share_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    skill_slug TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    label TEXT,
    allow_download BOOLEAN NOT NULL DEFAULT true,
    allow_import BOOLEAN NOT NULL DEFAULT true,
    max_imports INTEGER,
    import_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_by UUID,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (company_id, skill_slug)
      REFERENCES company_skill_registry(company_id, slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_share_links_company
    ON skill_share_links(company_id);
CREATE INDEX IF NOT EXISTS idx_skill_share_links_company_skill
    ON skill_share_links(company_id, skill_slug);
CREATE INDEX IF NOT EXISTS idx_skill_share_links_token
    ON skill_share_links(token);

ALTER TABLE skill_share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on skill_share_links" ON skill_share_links;
CREATE POLICY "Service role full access on skill_share_links" ON skill_share_links
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_skill_share_links_updated_at ON skill_share_links;
CREATE TRIGGER update_skill_share_links_updated_at
    BEFORE UPDATE ON skill_share_links
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS company_skill_imports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    skill_slug TEXT NOT NULL,
    source_type TEXT NOT NULL
        CHECK (source_type IN ('share_link', 'blueprint', 'company_copy')),
    source_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    source_skill_slug TEXT,
    share_link_id UUID REFERENCES skill_share_links(id) ON DELETE SET NULL,
    blueprint_id UUID REFERENCES company_skill_blueprints(id) ON DELETE SET NULL,
    imported_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (company_id, skill_slug)
      REFERENCES company_skill_registry(company_id, slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_company_skill_imports_company
    ON company_skill_imports(company_id);
CREATE INDEX IF NOT EXISTS idx_company_skill_imports_skill
    ON company_skill_imports(company_id, skill_slug);

ALTER TABLE company_skill_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on company_skill_imports" ON company_skill_imports;
CREATE POLICY "Service role full access on company_skill_imports" ON company_skill_imports
    FOR ALL TO service_role USING (true) WITH CHECK (true);
