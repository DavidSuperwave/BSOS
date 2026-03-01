-- accounts: Organization-level entity
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- account_members: Maps users to accounts
CREATE TABLE IF NOT EXISTS account_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, user_id)
);

-- Add new columns to companies table
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id),
  ADD COLUMN IF NOT EXISTS onboarding_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS integration_credentials jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS agent_status text DEFAULT 'pending' CHECK (agent_status IN ('pending', 'provisioning', 'active', 'error', 'disabled')),
  ADD COLUMN IF NOT EXISTS agent_config jsonb DEFAULT '{}'::jsonb;

UPDATE companies SET supermemory_namespace = 'blitzscale:company:' || id::text WHERE supermemory_namespace IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_owner ON accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_account_members_user ON account_members(user_id);
CREATE INDEX IF NOT EXISTS idx_account_members_account ON account_members(account_id);
CREATE INDEX IF NOT EXISTS idx_companies_account ON companies(account_id);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
