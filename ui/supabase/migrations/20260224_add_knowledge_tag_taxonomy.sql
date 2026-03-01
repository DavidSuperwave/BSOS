-- ============================================================
-- Per-company tag taxonomy for project knowledge metadata
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_tag_taxonomy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    primary_tag TEXT NOT NULL,
    description TEXT,
    color TEXT,
    order_index INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, primary_tag)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_tag_taxonomy_company
    ON knowledge_tag_taxonomy(company_id, order_index, primary_tag);

ALTER TABLE knowledge_tag_taxonomy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on knowledge_tag_taxonomy" ON knowledge_tag_taxonomy;
CREATE POLICY "Service role full access on knowledge_tag_taxonomy" ON knowledge_tag_taxonomy
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed default taxonomy for existing companies.
INSERT INTO knowledge_tag_taxonomy (company_id, primary_tag, description, color, order_index)
SELECT
    c.id,
    t.primary_tag,
    t.description,
    t.color,
    t.order_index
FROM companies c
CROSS JOIN (
    VALUES
      ('profile',  'Company identity, services, positioning', '#60a5fa', 10),
      ('icp',      'Ideal customer profiles and personas', '#34d399', 20),
      ('campaign', 'Campaign plans, analysis, and sequences', '#f59e0b', 30),
      ('research', 'Market and competitor research', '#a78bfa', 40),
      ('asset',    'Case studies, playbooks, SOPs', '#22c55e', 50),
      ('analysis', 'Generated insights and reports', '#f97316', 60)
) AS t(primary_tag, description, color, order_index)
ON CONFLICT (company_id, primary_tag) DO NOTHING;
