-- ============================================================
-- Cached references to project-tagged Supermemory documents
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_document_refs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES knowledge_projects(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    supermemory_doc_id TEXT NOT NULL,
    supermemory_container_tag TEXT NOT NULL,
    title TEXT,
    tags_primary TEXT,
    tags_secondary TEXT[] DEFAULT '{}',
    relationships_derived_from TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, supermemory_doc_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_refs_project_tag
    ON knowledge_document_refs(project_id, tags_primary);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_refs_company_created
    ON knowledge_document_refs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_refs_container_doc
    ON knowledge_document_refs(supermemory_container_tag, supermemory_doc_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_refs_derived_from
    ON knowledge_document_refs USING GIN(relationships_derived_from);

ALTER TABLE knowledge_document_refs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on knowledge_document_refs" ON knowledge_document_refs;
CREATE POLICY "Service role full access on knowledge_document_refs" ON knowledge_document_refs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_knowledge_document_refs_updated_at ON knowledge_document_refs;
CREATE TRIGGER update_knowledge_document_refs_updated_at
    BEFORE UPDATE ON knowledge_document_refs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
