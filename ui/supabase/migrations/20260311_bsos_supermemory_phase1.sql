-- BSOS × Supermemory phase 1 foundation.
-- Extends the project/cache schema and creates the canonical BSOS linking/audit tables.

ALTER TABLE knowledge_projects
ADD COLUMN IF NOT EXISTS project_key text,
ADD COLUMN IF NOT EXISTS system_seeded boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS display_order integer,
ADD COLUMN IF NOT EXISTS icon text,
ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_projects_company_project_key
  ON knowledge_projects(company_id, project_key)
  WHERE project_key IS NOT NULL;

ALTER TABLE knowledge_document_refs
ADD COLUMN IF NOT EXISTS ui_path jsonb,
ADD COLUMN IF NOT EXISTS artifact_type text,
ADD COLUMN IF NOT EXISTS linked_campaign_id text,
ADD COLUMN IF NOT EXISTS linked_lead_id text,
ADD COLUMN IF NOT EXISTS supermemory_document_id text,
ADD COLUMN IF NOT EXISTS custom_id text,
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_knowledge_document_refs_company_artifact_type
  ON knowledge_document_refs(company_id, artifact_type);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_refs_company_custom_id
  ON knowledge_document_refs(company_id, custom_id);

CREATE TABLE IF NOT EXISTS knowledge_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  relation_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_links_company_source
  ON knowledge_links(company_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_links_company_target
  ON knowledge_links(company_id, target_type, target_id);

ALTER TABLE knowledge_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_links_select_policy ON knowledge_links;
CREATE POLICY knowledge_links_select_policy
ON knowledge_links
FOR SELECT
USING (
  company_id IN (
    SELECT c.id
    FROM companies c
    JOIN account_members am ON am.account_id = c.account_id
    WHERE am.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS knowledge_links_service_role_policy ON knowledge_links;
CREATE POLICY knowledge_links_service_role_policy
ON knowledge_links
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS memory_write_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  namespace text NOT NULL,
  container_tag text NOT NULL,
  content_hash text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  is_inference boolean NOT NULL DEFAULT false,
  contamination_check_passed boolean NOT NULL DEFAULT true,
  contamination_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_write_audit_company_created
  ON memory_write_audit(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_write_audit_content_hash
  ON memory_write_audit(content_hash);

ALTER TABLE memory_write_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memory_write_audit_service_role_policy ON memory_write_audit;
CREATE POLICY memory_write_audit_service_role_policy
ON memory_write_audit
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES knowledge_projects(id) ON DELETE SET NULL,
  category text NOT NULL,
  content text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  confidence_status text NOT NULL DEFAULT 'provisional',
  source text,
  source_event_id text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_inference boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_entries_service_role_policy ON knowledge_entries;
CREATE POLICY knowledge_entries_service_role_policy
ON knowledge_entries
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS skill_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  run_id text NOT NULL,
  output_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE skill_outputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS skill_outputs_service_role_policy ON skill_outputs;
CREATE POLICY skill_outputs_service_role_policy
ON skill_outputs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS intelligence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  headline text,
  summary_md text,
  highlights jsonb NOT NULL DEFAULT '{}'::jsonb,
  risks jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE intelligence_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intelligence_reports_service_role_policy ON intelligence_reports;
CREATE POLICY intelligence_reports_service_role_policy
ON intelligence_reports
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS campaign_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  recommendation_type text NOT NULL,
  reasoning text NOT NULL,
  supporting_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_approval boolean NOT NULL DEFAULT false,
  approval_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaign_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_recommendations_service_role_policy ON campaign_recommendations;
CREATE POLICY campaign_recommendations_service_role_policy
ON campaign_recommendations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'warning',
  alert_type text NOT NULL,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_alerts_service_role_policy ON admin_alerts;
CREATE POLICY admin_alerts_service_role_policy
ON admin_alerts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
