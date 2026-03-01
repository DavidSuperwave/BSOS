-- Project-Based Knowledge Base Schema
-- Creates projects table and updates document handling

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE IF NOT EXISTS knowledge_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Identity
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    
    -- Type and organization
    type TEXT NOT NULL DEFAULT 'vault' CHECK (type IN ('vault', 'knowledge_base', 'deal_room', 'campaign', 'research')),
    
    -- Storage reference (Supermemory container suffix)
    container_tag_suffix TEXT NOT NULL,
    
    -- Access control
    created_by UUID NOT NULL REFERENCES auth.users(id),
    is_shared BOOLEAN DEFAULT false,
    collaborators UUID[] DEFAULT '{}',
    
    -- Caching
    document_count INTEGER DEFAULT 0,
    folder_structure TEXT[] DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ,
    
    -- Constraints
    UNIQUE(company_id, slug)
);

-- Indexes for projects
CREATE INDEX IF NOT EXISTS idx_knowledge_projects_company ON knowledge_projects(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_projects_created_by ON knowledge_projects(created_by);
CREATE INDEX IF NOT EXISTS idx_knowledge_projects_type ON knowledge_projects(company_id, type);
CREATE INDEX IF NOT EXISTS idx_knowledge_projects_shared ON knowledge_projects(company_id, is_shared) WHERE is_shared = true;

-- Function to generate container tag
CREATE OR REPLACE FUNCTION generate_project_container_tag(p_company_id UUID, p_slug TEXT)
RETURNS TEXT AS $$
DECLARE
    company_slug TEXT;
BEGIN
    SELECT slug INTO company_slug FROM companies WHERE id = p_company_id;
    RETURN 'gtm_' || company_slug || '_project_' || p_slug;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-set container tag on insert
CREATE OR REPLACE FUNCTION set_project_container_tag()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.container_tag_suffix IS NULL OR NEW.container_tag_suffix = '' THEN
        NEW.container_tag_suffix = NEW.slug;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_project_container_tag
    BEFORE INSERT ON knowledge_projects
    FOR EACH ROW
    EXECUTE FUNCTION set_project_container_tag();

-- Function to update document count
CREATE OR REPLACE FUNCTION update_project_document_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Note: This is a placeholder - actual count comes from Supermemory
    -- In practice, we'll update this via API or scheduled job
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_project_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_project_timestamp
    BEFORE UPDATE ON knowledge_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_project_timestamp();

-- RLS Policies for projects
ALTER TABLE knowledge_projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own projects and shared projects in their company
CREATE POLICY "View projects" ON knowledge_projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM companies c
            JOIN account_members am ON am.account_id = c.account_id
            WHERE c.id = knowledge_projects.company_id
              AND am.user_id = auth.uid()
        )
    );

-- Policy: Users can create projects in their companies
CREATE POLICY "Create projects" ON knowledge_projects
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM companies c
            JOIN account_members am ON am.account_id = c.account_id
            WHERE c.id = knowledge_projects.company_id
              AND am.user_id = auth.uid()
        )
    );

-- Policy: Only creator or company admin can update/delete
CREATE POLICY "Update projects" ON knowledge_projects
    FOR UPDATE
    USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1
            FROM companies c
            JOIN account_members am ON am.account_id = c.account_id
            WHERE c.id = knowledge_projects.company_id
              AND am.user_id = auth.uid()
              AND am.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Delete projects" ON knowledge_projects
    FOR DELETE
    USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1
            FROM companies c
            JOIN account_members am ON am.account_id = c.account_id
            WHERE c.id = knowledge_projects.company_id
              AND am.user_id = auth.uid()
              AND am.role IN ('owner', 'admin')
        )
    );

-- Table for project-level tool executions (more detailed than general tool logs)
CREATE TABLE IF NOT EXISTS knowledge_project_tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES knowledge_projects(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    tool TEXT NOT NULL,
    params JSONB NOT NULL,
    result JSONB,
    
    document_id TEXT,
    folder_name TEXT,
    
    agent_type TEXT DEFAULT 'main',
    session_key TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    execution_time_ms INTEGER,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_knowledge_project_tools_project ON knowledge_project_tool_executions(project_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_project_tools_company ON knowledge_project_tool_executions(company_id, executed_at DESC);

-- View: Project overview with stats
CREATE OR REPLACE VIEW project_overviews AS
SELECT 
    p.id,
    p.company_id,
    p.name,
    p.slug,
    p.description,
    p.type,
    p.container_tag_suffix,
    p.is_shared,
    p.document_count,
    p.folder_structure,
    p.created_by,
    u.email as created_by_email,
    p.created_at,
    p.updated_at,
    p.last_accessed_at,
    c.name as company_name,
    c.slug as company_slug
FROM knowledge_projects p
JOIN companies c ON c.id = p.company_id
LEFT JOIN auth.users u ON u.id = p.created_by;

-- Function to get full container tag
CREATE OR REPLACE FUNCTION get_project_container_tag(p_project_id UUID)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    SELECT 
        'gtm_' || c.slug || '_project_' || p.container_tag_suffix
    INTO result
    FROM knowledge_projects p
    JOIN companies c ON c.id = p.company_id
    WHERE p.id = p_project_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;
