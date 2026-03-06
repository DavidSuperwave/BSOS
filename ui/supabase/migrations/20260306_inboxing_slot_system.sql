-- ============================================================
-- MIGRATION: Inboxing Slot System
-- Date: 2026-03-06
-- Purpose: Track slot assignments and protect API access
-- ============================================================

-- 1. Company slot allocations
-- Tracks how many Inboxing slots each company has access to
CREATE TABLE IF NOT EXISTS inboxing_slot_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Slot tracking
  total_slots INT NOT NULL DEFAULT 0,           -- Total slots allocated to company
  used_slots INT NOT NULL DEFAULT 0,            -- Currently used slots (count of assigned domains)
  free_slots INT GENERATED ALWAYS AS (total_slots - used_slots) STORED,
  
  -- Allocation metadata
  allocation_type TEXT NOT NULL DEFAULT 'free' CHECK (allocation_type IN ('free', 'purchased', 'trial')),
  stripe_subscription_id TEXT,                 -- For purchased slots
  expires_at TIMESTAMPTZ,                       -- For trial/free slots
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_slot_allocations_company ON inboxing_slot_allocations(company_id);
CREATE INDEX IF NOT EXISTS idx_slot_allocations_stripe ON inboxing_slot_allocations(stripe_subscription_id);

-- 2. Domain slot assignments
-- Links Inboxing domains to companies (for slot tracking)
CREATE TABLE IF NOT EXISTS inboxing_domain_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inboxing_domain_id UUID REFERENCES inboxing_domains(id) ON DELETE SET NULL,
  inboxing_id TEXT NOT NULL,                    -- Inboxing.com domain ID (from API)
  domain_name TEXT NOT NULL,
  
  -- Assignment metadata
  assigned_by UUID REFERENCES auth.users(id),  -- Admin who assigned it
  assigned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  notes TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reclaimed', 'suspended')),
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(inboxing_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_domain_assignments_company ON inboxing_domain_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_domain_assignments_inboxing_id ON inboxing_domain_assignments(inboxing_id);
CREATE INDEX IF NOT EXISTS idx_domain_assignments_status ON inboxing_domain_assignments(status);

-- 3. Enable RLS
ALTER TABLE inboxing_slot_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inboxing_domain_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on slot allocations" ON inboxing_slot_allocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on domain assignments" ON inboxing_domain_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Updated_at triggers
CREATE TRIGGER slot_allocations_updated_at
  BEFORE UPDATE ON inboxing_slot_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER domain_assignments_updated_at
  BEFORE UPDATE ON inboxing_domain_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Function to update used_slots count
CREATE OR REPLACE FUNCTION update_company_used_slots()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE inboxing_slot_allocations
    SET used_slots = used_slots + 1
    WHERE company_id = NEW.company_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If status changed from active to something else
    IF OLD.status = 'active' AND NEW.status != 'active' THEN
      UPDATE inboxing_slot_allocations
      SET used_slots = GREATEST(0, used_slots - 1)
      WHERE company_id = NEW.company_id;
    -- If status changed to active
    ELSIF OLD.status != 'active' AND NEW.status = 'active' THEN
      UPDATE inboxing_slot_allocations
      SET used_slots = used_slots + 1
      WHERE company_id = NEW.company_id;
    -- If company changed
    ELSIF OLD.company_id != NEW.company_id THEN
      UPDATE inboxing_slot_allocations
      SET used_slots = GREATEST(0, used_slots - 1)
      WHERE company_id = OLD.company_id;
      UPDATE inboxing_slot_allocations
      SET used_slots = used_slots + 1
      WHERE company_id = NEW.company_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
    UPDATE inboxing_slot_allocations
    SET used_slots = GREATEST(0, used_slots - 1)
    WHERE company_id = OLD.company_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_used_slots_on_assignment
  AFTER INSERT OR UPDATE OR DELETE ON inboxing_domain_assignments
  FOR EACH ROW EXECUTE FUNCTION update_company_used_slots();

-- 6. Helper functions for slot management
CREATE OR REPLACE FUNCTION increment_company_slots(p_company_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO inboxing_slot_allocations (company_id, total_slots, used_slots, allocation_type)
  VALUES (p_company_id, 0, 1, 'free')
  ON CONFLICT (company_id) DO UPDATE
  SET used_slots = inboxing_slot_allocations.used_slots + 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_company_slots(p_company_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE inboxing_slot_allocations
  SET used_slots = GREATEST(0, used_slots - 1)
  WHERE company_id = p_company_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Initialize slot allocations for existing companies (give them 0 slots initially)
INSERT INTO inboxing_slot_allocations (company_id, total_slots, used_slots, allocation_type)
SELECT id, 0, 0, 'free'
FROM companies
WHERE id NOT IN (SELECT company_id FROM inboxing_slot_allocations)
ON CONFLICT (company_id) DO NOTHING;
