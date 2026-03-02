-- ============================================================
-- BSOS core tables required by src/lib/bsos and /api/bsos/*
-- Date: 2026-03-02
-- Notes:
-- - Idempotent (CREATE/ALTER IF NOT EXISTS)
-- - Includes service_role RLS policies
-- - Keeps schemas permissive where runtime code paths diverge
-- ============================================================

-- ------------------------------------------------------------
-- campaign_signals
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (
    signal_type IN (
      'open',
      'click',
      'reply',
      'bounce',
      'unsubscribe',
      'meeting_booked',
      'meeting_cancelled',
      'deal_created',
      'deal_won',
      'deal_lost',
      'warmup_health',
      'domain_health',
      'spam_complaint'
    )
  ),
  signal_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  proxy_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  source_platform TEXT NOT NULL CHECK (
    source_platform IN ('plusvibe', 'instantly', 'email_bison', 'close', 'calendly')
  ),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE campaign_signals ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_campaign_signals_company_recorded
  ON campaign_signals(company_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_signals_company_campaign_recorded
  ON campaign_signals(company_id, campaign_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_signals_company_type_recorded
  ON campaign_signals(company_id, signal_type, recorded_at DESC);

ALTER TABLE campaign_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on campaign_signals" ON campaign_signals;
CREATE POLICY "Service role full access on campaign_signals" ON campaign_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- bounce_events
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bounce_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  email_account TEXT NOT NULL,
  domain TEXT NOT NULL,
  bounce_type TEXT NOT NULL DEFAULT 'unknown',
  bounce_code TEXT NOT NULL DEFAULT '',
  bounce_msg TEXT,
  classification TEXT NOT NULL CHECK (
    classification IN (
      'hard_bounce',
      'soft_bounce',
      'mailbox_full',
      'dns_failure',
      'policy_rejection',
      'spam_block',
      'unknown'
    )
  ),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bounce_events_company_recorded
  ON bounce_events(company_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounce_events_company_campaign_recorded
  ON bounce_events(company_id, campaign_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounce_events_company_classification
  ON bounce_events(company_id, classification, recorded_at DESC);

ALTER TABLE bounce_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on bounce_events" ON bounce_events;
CREATE POLICY "Service role full access on bounce_events" ON bounce_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- account_health_snapshots
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  email_account TEXT NOT NULL,
  health_score DOUBLE PRECISION NOT NULL DEFAULT 100,
  inbox_placement_rate DOUBLE PRECISION,
  blacklist_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  spf_pass BOOLEAN NOT NULL DEFAULT true,
  dkim_pass BOOLEAN NOT NULL DEFAULT true,
  dmarc_pass BOOLEAN NOT NULL DEFAULT true,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_health_snapshots_company_snapshot
  ON account_health_snapshots(company_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_health_snapshots_company_email_snapshot
  ON account_health_snapshots(company_id, email_account, snapshot_at DESC);

ALTER TABLE account_health_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on account_health_snapshots" ON account_health_snapshots;
CREATE POLICY "Service role full access on account_health_snapshots" ON account_health_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- daily_intelligence_snapshots
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_intelligence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  report_json JSONB,
  summary JSONB,
  alerts JSONB,
  recommendations JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE daily_intelligence_snapshots ADD COLUMN IF NOT EXISTS report_json JSONB;

CREATE INDEX IF NOT EXISTS idx_daily_intelligence_snapshots_company_date
  ON daily_intelligence_snapshots(company_id, snapshot_date DESC);

ALTER TABLE daily_intelligence_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on daily_intelligence_snapshots" ON daily_intelligence_snapshots;
CREATE POLICY "Service role full access on daily_intelligence_snapshots" ON daily_intelligence_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- approval_requests
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  skill_id TEXT,
  skill_name TEXT,
  action_type TEXT,
  proposed_action JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level TEXT,
  rationale TEXT NOT NULL DEFAULT '',
  confidence_score DOUBLE PRECISION,
  predicted_impact JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejection_reason TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  feedback TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_company_status_created
  ON approval_requests(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_company_skill_created
  ON approval_requests(company_id, skill_id, created_at DESC);

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on approval_requests" ON approval_requests;
CREATE POLICY "Service role full access on approval_requests" ON approval_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- skill_executions compatibility additions
-- Existing migration(s) define this table for chat/skills.
-- BSOS runtime also writes status/params/result/error/executed_at.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skill_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  status TEXT,
  params JSONB,
  result JSONB,
  error TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS params JSONB;
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_skill_executions_company_executed
  ON skill_executions(company_id, executed_at DESC);

ALTER TABLE skill_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on skill_executions" ON skill_executions;
CREATE POLICY "Service role full access on skill_executions" ON skill_executions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- campaign_phases
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  current_phase TEXT NOT NULL DEFAULT 'cold_start' CHECK (
    current_phase IN ('cold_start', 'discovery', 'signal_accumulation', 'optimization', 'scaling')
  ),
  previous_phase TEXT CHECK (
    previous_phase IN ('cold_start', 'discovery', 'signal_accumulation', 'optimization', 'scaling')
  ),
  optimization_mode TEXT DEFAULT 'suggest',
  signal_quality_score DOUBLE PRECISION,
  trust_level DOUBLE PRECISION,
  transitioned_at TIMESTAMPTZ,
  transition_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_phases_company_phase
  ON campaign_phases(company_id, current_phase, updated_at DESC);

ALTER TABLE campaign_phases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on campaign_phases" ON campaign_phases;
CREATE POLICY "Service role full access on campaign_phases" ON campaign_phases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- cold_start_configs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cold_start_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id TEXT,
  campaign_type TEXT,
  variants JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  industry TEXT NOT NULL DEFAULT 'default',
  prior_alpha DOUBLE PRECISION NOT NULL DEFAULT 1,
  prior_beta DOUBLE PRECISION NOT NULL DEFAULT 49,
  estimated_reply_rate DOUBLE PRECISION,
  current_multiplier DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completion_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_cold_start_configs_company_complete
  ON cold_start_configs(company_id, is_complete, started_at DESC);

ALTER TABLE cold_start_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on cold_start_configs" ON cold_start_configs;
CREATE POLICY "Service role full access on cold_start_configs" ON cold_start_configs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- learning_entries
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  confidence_tier TEXT NOT NULL DEFAULT 'hypothesis' CHECK (
    confidence_tier IN ('hypothesis', 'emerging', 'established', 'validated')
  ),
  positive_weight DOUBLE PRECISION NOT NULL DEFAULT 0,
  negative_weight DOUBLE PRECISION NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  source_campaign_id TEXT,
  source_campaign_ids TEXT[] NOT NULL DEFAULT '{}',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE learning_entries ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION NOT NULL DEFAULT 0.1;
ALTER TABLE learning_entries ADD COLUMN IF NOT EXISTS confidence_tier TEXT NOT NULL DEFAULT 'hypothesis';
ALTER TABLE learning_entries ADD COLUMN IF NOT EXISTS positive_weight DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE learning_entries ADD COLUMN IF NOT EXISTS negative_weight DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE learning_entries ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE learning_entries ADD COLUMN IF NOT EXISTS source_campaign_id TEXT;

CREATE INDEX IF NOT EXISTS idx_learning_entries_company_updated
  ON learning_entries(company_id, last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_entries_company_type_confidence
  ON learning_entries(company_id, entry_type, confidence DESC);

ALTER TABLE learning_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on learning_entries" ON learning_entries;
CREATE POLICY "Service role full access on learning_entries" ON learning_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- bandit_arms
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bandit_arms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id TEXT,
  campaign_type TEXT,
  arm_name TEXT,
  alpha DOUBLE PRECISION NOT NULL DEFAULT 1,
  beta DOUBLE PRECISION NOT NULL DEFAULT 49,
  total_pulls INTEGER NOT NULL DEFAULT 0,
  total_rewards INTEGER NOT NULL DEFAULT 0,
  successes INTEGER,
  failures INTEGER,
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bandit_arms ADD COLUMN IF NOT EXISTS campaign_id TEXT;
ALTER TABLE bandit_arms ADD COLUMN IF NOT EXISTS campaign_type TEXT;
ALTER TABLE bandit_arms ADD COLUMN IF NOT EXISTS arm_name TEXT;
ALTER TABLE bandit_arms ADD COLUMN IF NOT EXISTS alpha DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE bandit_arms ADD COLUMN IF NOT EXISTS beta DOUBLE PRECISION NOT NULL DEFAULT 49;
ALTER TABLE bandit_arms ADD COLUMN IF NOT EXISTS total_pulls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bandit_arms ADD COLUMN IF NOT EXISTS total_rewards INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bandit_arms ADD COLUMN IF NOT EXISTS successes INTEGER;
ALTER TABLE bandit_arms ADD COLUMN IF NOT EXISTS failures INTEGER;
ALTER TABLE bandit_arms ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bandit_arms_company_campaign_unique
  ON bandit_arms(company_id, campaign_id)
  WHERE campaign_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bandit_arms_company_type_name_unique
  ON bandit_arms(company_id, campaign_type, arm_name)
  WHERE campaign_type IS NOT NULL AND arm_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bandit_arms_company_updated
  ON bandit_arms(company_id, last_updated DESC);

ALTER TABLE bandit_arms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on bandit_arms" ON bandit_arms;
CREATE POLICY "Service role full access on bandit_arms" ON bandit_arms
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- bsos_cron_log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bsos_cron_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  result_json JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bsos_cron_log_ran
  ON bsos_cron_log(ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_bsos_cron_log_company_ran
  ON bsos_cron_log(company_id, ran_at DESC);

ALTER TABLE bsos_cron_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on bsos_cron_log" ON bsos_cron_log;
CREATE POLICY "Service role full access on bsos_cron_log" ON bsos_cron_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- agent_trace_log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_trace_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  skill_version TEXT,
  trigger_type TEXT,
  input_params JSONB,
  output_result JSONB,
  duration_ms INTEGER,
  tokens_used INTEGER,
  containers_read TEXT[] NOT NULL DEFAULT '{}',
  containers_written TEXT[] NOT NULL DEFAULT '{}',
  approval_required BOOLEAN NOT NULL DEFAULT false,
  approval_status TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_trace_log_company_created
  ON agent_trace_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_trace_log_company_skill_created
  ON agent_trace_log(company_id, skill_name, created_at DESC);

ALTER TABLE agent_trace_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on agent_trace_log" ON agent_trace_log;
CREATE POLICY "Service role full access on agent_trace_log" ON agent_trace_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
