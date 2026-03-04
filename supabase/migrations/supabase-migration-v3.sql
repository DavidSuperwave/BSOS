-- BSOS v3 Supabase Migration
-- Creates GTM engine tables, indexes, RLS policies, and extends companies API key columns.
-- Idempotent where possible; safe to run in Supabase SQL Editor in one shot.

BEGIN;

-- =====================================================
-- Extensions
-- =====================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- Existing table updates: companies
-- =====================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS close_api_key text,
  ADD COLUMN IF NOT EXISTS calendly_api_key text,
  ADD COLUMN IF NOT EXISTS calendly_user_uri text,
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS perplexity_api_key text,
  ADD COLUMN IF NOT EXISTS supermemory_api_key text,
  ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- =====================================================
-- 1) campaign_copy_analysis (copy-analyzer output)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.campaign_copy_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id text,
  step_index integer,
  variation_label text,
  subject text,
  body text,
  hook_class text,
  cta_class text,
  personalization_depth text,
  word_count integer,
  reading_level text,
  skill_version text,
  confidence_score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text UNIQUE
);

-- =====================================================
-- 2) reply_classifications (reply-miner output)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.reply_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reply_id text,
  lead_email text,
  campaign_id text,
  category text CHECK (category IN ('interested','not-now','objection','OOO','unsubscribe','wrong-person','competitor-mention','referral')),
  sentiment text,
  objections jsonb,
  persona_tag text,
  confidence_score numeric,
  needs_review boolean NOT NULL DEFAULT false,
  thread_context text,
  skill_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text UNIQUE
);

-- =====================================================
-- 3) lead_profiles (lead-profiler output)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.lead_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id text,
  title text,
  industry text,
  company_size text,
  linkedin_url text,
  icp_fit_score numeric,
  segment_label text,
  response_outcome text,
  fit_rationale text,
  freshness_flag text NOT NULL DEFAULT 'fresh',
  skill_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text UNIQUE
);

-- =====================================================
-- 4) bounce_analysis (bounce-diagnostician output)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.bounce_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_email text,
  smtp_code text,
  provider_message text,
  campaign_id text,
  category text CHECK (category IN ('bad_data','content_filter','auth_failure','gateway_timeout','dns_failure','policy_rejection','unknown')),
  root_cause text,
  recommended_action text,
  provider_detail jsonb,
  skill_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text UNIQUE
);

-- =====================================================
-- 5) deal_patterns (deal-miner output)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.deal_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opportunity_id text,
  status text,
  lead_email text,
  close_date timestamptz,
  win_signature jsonb,
  loss_category text,
  campaign_attribution_score numeric,
  activities jsonb,
  skill_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text UNIQUE
);

-- =====================================================
-- 6) deliverability_snapshots (deliverability-assessor/watchdog)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.deliverability_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id text,
  domain text,
  spf_pass boolean,
  dkim_pass boolean,
  dmarc_pass boolean,
  warmup_health numeric,
  inbox_placement numeric,
  standard_violations jsonb,
  snapshot_type text CHECK (snapshot_type IN ('baseline','drift','sweep')),
  is_baseline boolean NOT NULL DEFAULT false,
  skill_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text UNIQUE
);

-- =====================================================
-- 7) campaign_events (campaign-monitor/pipeline-tracker)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id text,
  event_type text,
  severity text CHECK (severity IN ('CRITICAL','HIGH','WARNING','INFO','HEALTHY')),
  event_data jsonb,
  reward_value numeric,
  attribution_map jsonb,
  source_skill text,
  skill_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text UNIQUE
);

-- =====================================================
-- 8) campaign_daily_metrics (daily campaign performance)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.campaign_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  metric_date date NOT NULL,
  send_count integer NOT NULL DEFAULT 0,
  open_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  bounce_count integer NOT NULL DEFAULT 0,
  meeting_count integer NOT NULL DEFAULT 0,
  unsubscribe_count integer NOT NULL DEFAULT 0,
  open_rate numeric,
  reply_rate numeric,
  bounce_rate numeric,
  skill_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, campaign_id, metric_date)
);

-- =====================================================
-- 9) feature_snapshots (periodic campaign state)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.feature_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id text,
  snapshot_window text,
  metrics jsonb,
  anomaly_flags jsonb,
  severity_tier text,
  skill_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text UNIQUE
);

-- =====================================================
-- 10) intelligence_reports (intelligence-reporter output)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.intelligence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  report_date date,
  report_window_start timestamptz,
  report_window_end timestamptz,
  health_grade text CHECK (health_grade IN ('A+','A','B+','B','C+','C','D','F')),
  composite_score numeric,
  highlights jsonb,
  risks jsonb,
  recommended_actions jsonb,
  unresolved_questions jsonb,
  lineage jsonb,
  coverage_pct numeric NOT NULL DEFAULT 100,
  skill_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- 11) company_profiles (profile-enricher output)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_version integer,
  profile_payload jsonb,
  confidence_score numeric,
  updated_fields jsonb,
  evidence_refs jsonb,
  skill_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- 12) learning_entries (learning system feedback loop)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.learning_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_type text,
  content text,
  confidence_score numeric,
  evidence_count integer,
  valid_from timestamptz,
  valid_until timestamptz,
  last_reinforced_at timestamptz,
  source_campaign_ids jsonb,
  source_skill text,
  skill_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- 13) bandit_states (contextual bandits)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.bandit_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_type text,
  arm_name text,
  alpha numeric NOT NULL DEFAULT 1,
  beta numeric NOT NULL DEFAULT 1,
  total_observations integer NOT NULL DEFAULT 0,
  last_selected_at timestamptz,
  decay_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, campaign_type, arm_name)
);

-- =====================================================
-- 14) campaign_optimization_states (per-campaign optimization)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.campaign_optimization_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id text,
  mode text CHECK (mode IN ('manual','suggest','optimize')),
  learning_phase text CHECK (learning_phase IN ('cold_start','discovery','signal_accumulation','optimization','scaling')),
  signal_quality_score numeric,
  trust_level numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, campaign_id)
);

-- =====================================================
-- 15) action_outcome_pairs (predicted vs actual outcomes)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.action_outcome_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action_type text,
  action_detail jsonb,
  predicted_outcome jsonb,
  actual_outcome jsonb,
  delta jsonb,
  was_approved boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- 16) agent_trace_logs (full execution observability)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.agent_trace_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  skill_name text,
  skill_version text,
  trigger_type text,
  input_params jsonb,
  output_result jsonb,
  duration_ms integer,
  tokens_used integer,
  containers_read jsonb,
  containers_written jsonb,
  approval_required boolean NOT NULL DEFAULT false,
  approval_status text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- Indexes
-- =====================================================
-- every table: (company_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_campaign_copy_analysis_company_created_at ON public.campaign_copy_analysis (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reply_classifications_company_created_at ON public.reply_classifications (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_company_created_at ON public.lead_profiles (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounce_analysis_company_created_at ON public.bounce_analysis (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_patterns_company_created_at ON public.deal_patterns (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliverability_snapshots_company_created_at ON public.deliverability_snapshots (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_events_company_created_at ON public.campaign_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_daily_metrics_company_created_at ON public.campaign_daily_metrics (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_daily_metrics_company_campaign_date ON public.campaign_daily_metrics (company_id, campaign_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_feature_snapshots_company_created_at ON public.feature_snapshots (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intelligence_reports_company_created_at ON public.intelligence_reports (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_profiles_company_created_at ON public.company_profiles (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_entries_company_created_at ON public.learning_entries (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bandit_states_company_created_at ON public.bandit_states (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_optimization_states_company_created_at ON public.campaign_optimization_states (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_outcome_pairs_company_created_at ON public.action_outcome_pairs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_trace_logs_company_created_at ON public.agent_trace_logs (company_id, created_at DESC);

-- requested table-specific indexes
CREATE INDEX IF NOT EXISTS idx_campaign_copy_analysis_company_campaign ON public.campaign_copy_analysis (company_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_reply_classifications_company_campaign ON public.reply_classifications (company_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_reply_classifications_company_category ON public.reply_classifications (company_id, category);

CREATE INDEX IF NOT EXISTS idx_lead_profiles_company_icp_fit_score ON public.lead_profiles (company_id, icp_fit_score DESC);

CREATE INDEX IF NOT EXISTS idx_bounce_analysis_company_category ON public.bounce_analysis (company_id, category);

CREATE INDEX IF NOT EXISTS idx_campaign_events_company_campaign_severity ON public.campaign_events (company_id, campaign_id, severity);

CREATE INDEX IF NOT EXISTS idx_feature_snapshots_company_campaign_created_at ON public.feature_snapshots (company_id, campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intelligence_reports_company_report_date ON public.intelligence_reports (company_id, report_date DESC);

CREATE INDEX IF NOT EXISTS idx_learning_entries_company_entry_type ON public.learning_entries (company_id, entry_type);

CREATE INDEX IF NOT EXISTS idx_bandit_states_company_arm_name ON public.bandit_states (company_id, arm_name);

CREATE INDEX IF NOT EXISTS idx_agent_trace_logs_company_skill_created_at ON public.agent_trace_logs (company_id, skill_name, created_at DESC);

-- =====================================================
-- RLS + Policies (authenticated users scoped by company_id)
-- Service role bypasses RLS automatically in Supabase.
-- =====================================================

ALTER TABLE public.campaign_copy_analysis ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "campaign_copy_analysis_select_own_company"
    ON public.campaign_copy_analysis
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.reply_classifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "reply_classifications_select_own_company"
    ON public.reply_classifications
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.lead_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "lead_profiles_select_own_company"
    ON public.lead_profiles
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.bounce_analysis ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bounce_analysis_select_own_company"
    ON public.bounce_analysis
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.deal_patterns ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "deal_patterns_select_own_company"
    ON public.deal_patterns
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.deliverability_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "deliverability_snapshots_select_own_company"
    ON public.deliverability_snapshots
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "campaign_events_select_own_company"
    ON public.campaign_events
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.campaign_daily_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "campaign_daily_metrics_select_own_company"
    ON public.campaign_daily_metrics
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.feature_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "feature_snapshots_select_own_company"
    ON public.feature_snapshots
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.intelligence_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "intelligence_reports_select_own_company"
    ON public.intelligence_reports
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "company_profiles_select_own_company"
    ON public.company_profiles
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.learning_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "learning_entries_select_own_company"
    ON public.learning_entries
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.bandit_states ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bandit_states_select_own_company"
    ON public.bandit_states
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.campaign_optimization_states ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "campaign_optimization_states_select_own_company"
    ON public.campaign_optimization_states
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.action_outcome_pairs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "action_outcome_pairs_select_own_company"
    ON public.action_outcome_pairs
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.agent_trace_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "agent_trace_logs_select_own_company"
    ON public.agent_trace_logs
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.chat_sessions WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
