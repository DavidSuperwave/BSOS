-- ============================================================
-- BLITZSCALE OS - MULTI-COMPANY TABLES
-- ============================================================
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ovymybiibcxunnqoaoub/sql/new
-- ============================================================

-- 1. COMPANIES TABLE
CREATE TABLE IF NOT EXISTS companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    domain TEXT,
    plusvibe_workspace_id TEXT,
    supermemory_namespace TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on companies" ON companies
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 2. COMPANY USERS TABLE (for multi-user access)
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

-- 3. KNOWLEDGE DOCUMENTS TABLE (if not exists)
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
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

-- 4. INSERT DEFAULT COMPANY (Superwave)
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

-- 5. HELPER FUNCTION: Get company by slug
CREATE OR REPLACE FUNCTION get_company_by_slug(company_slug TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    domain TEXT,
    plusvibe_workspace_id TEXT,
    supermemory_namespace TEXT,
    settings JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.name, c.slug, c.domain, c.plusvibe_workspace_id, c.supermemory_namespace, c.settings
    FROM companies c
    WHERE c.slug = company_slug;
END;
$$ LANGUAGE plpgsql;

-- 6. VERIFY SETUP
DO $$
BEGIN
    RAISE NOTICE '✅ Companies table created';
    RAISE NOTICE '✅ Company users table created';
    RAISE NOTICE '✅ Knowledge documents table created';
    RAISE NOTICE '✅ Default company (Superwave) inserted';
    RAISE NOTICE '';
    RAISE NOTICE 'Setup complete! You can now add companies via:';
    RAISE NOTICE '  cd automation/gtm-engine && node scripts/add-company.js --name "Company" --slug company';
END $$;
