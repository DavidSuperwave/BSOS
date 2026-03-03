-- Supermemory key inventory for admin-managed key distribution.
-- Each key can be assigned to one company at a time.

CREATE TABLE IF NOT EXISTS supermemory_key_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT,
  api_key TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supermemory_key_pool_active
  ON supermemory_key_pool (is_active);

CREATE INDEX IF NOT EXISTS idx_supermemory_key_pool_assigned_company
  ON supermemory_key_pool (assigned_company_id);

ALTER TABLE supermemory_key_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on supermemory_key_pool"
  ON supermemory_key_pool
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
