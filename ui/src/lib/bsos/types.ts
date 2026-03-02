/**
 * BSOS Core Type Definitions
 * Central types for the entire BSOS intelligence layer.
 */

// ─── Signal Types ───
export type SignalType =
  | "open"
  | "click"
  | "reply"
  | "bounce"
  | "unsubscribe"
  | "meeting_booked"
  | "meeting_cancelled"
  | "deal_created"
  | "deal_won"
  | "deal_lost"
  | "warmup_health"
  | "domain_health"
  | "spam_complaint";

export type BounceClassification =
  | "hard_bounce"
  | "soft_bounce"
  | "mailbox_full"
  | "dns_failure"
  | "policy_rejection"
  | "spam_block"
  | "unknown";

export type ReplyClassification =
  | "positive_interested"
  | "positive_referral"
  | "neutral_info_request"
  | "neutral_ooo"
  | "negative_not_interested"
  | "negative_unsubscribe"
  | "negative_hostile"
  | "auto_reply"
  | "unknown";

export type SourcePlatform = "plusvibe" | "instantly" | "email_bison" | "close" | "calendly";

// ─── Campaign Optimization ───
export type OptimizationMode = "manual" | "suggest" | "optimize";
export type LearningPhase =
  | "cold_start"
  | "discovery"
  | "signal_accumulation"
  | "optimization"
  | "scaling";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type SkillRiskLevel = "observe" | "suggest" | "act_with_approval" | "act_autonomous";

// ─── Core Interfaces ───
export interface CampaignSignal {
  id?: string;
  company_id: string;
  campaign_id: string;
  signal_type: SignalType;
  signal_value: Record<string, any>;
  proxy_score: number;
  source_platform: SourcePlatform;
  recorded_at: string;
}

export interface BounceEvent {
  id?: string;
  company_id: string;
  campaign_id: string;
  email_account: string;
  domain: string;
  bounce_type: string;
  bounce_code: string;
  bounce_msg: string | null;
  classification: BounceClassification;
  recorded_at: string;
}

export interface AccountHealthSnapshot {
  id?: string;
  company_id: string;
  domain: string;
  email_account: string;
  health_score: number;
  inbox_placement_rate: number | null;
  blacklist_status: Record<string, any>;
  spf_pass: boolean;
  dkim_pass: boolean;
  dmarc_pass: boolean;
  snapshot_at: string;
}

export interface LearningEntry {
  id?: string;
  company_id: string;
  entry_type: string;
  content: string;
  confidence_score: number;
  evidence_count: number;
  valid_from: string;
  valid_until: string | null;
  last_reinforced_at: string;
  source_campaign_ids: string[];
}

export interface DailyIntelligenceSnapshot {
  id?: string;
  company_id: string;
  snapshot_date: string;
  summary: Record<string, any>;
  alerts: any[];
  recommendations: any[];
}

export interface ApprovalQueueItem {
  id?: string;
  company_id: string;
  skill_name: string;
  action_type: string;
  action_payload: Record<string, any>;
  rationale: string;
  confidence_score: number;
  predicted_impact: Record<string, any>;
  status: ApprovalStatus;
  submitted_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  feedback: string | null;
}

export interface AgentTraceLog {
  id?: string;
  company_id: string;
  skill_name: string;
  skill_version: string;
  trigger_type: string;
  input_params: Record<string, any>;
  output_result: Record<string, any>;
  duration_ms: number;
  tokens_used: number;
  containers_read: string[];
  containers_written: string[];
  approval_required: boolean;
  approval_status: ApprovalStatus | null;
  error: string | null;
}

export interface BanditState {
  id?: string;
  company_id: string;
  campaign_type: string;
  arm_name: string;
  alpha: number;
  beta: number;
  total_observations: number;
  last_selected_at: string | null;
  decay_applied_at: string | null;
}

export interface CampaignOptimizationState {
  id?: string;
  company_id: string;
  campaign_id: string;
  mode: OptimizationMode;
  learning_phase: LearningPhase;
  signal_quality_score: number;
  trust_level: number;
  created_at?: string;
  updated_at?: string;
}

export interface ActionOutcomePair {
  id?: string;
  company_id: string;
  action_type: string;
  action_detail: Record<string, any>;
  predicted_outcome: Record<string, any>;
  actual_outcome: Record<string, any>;
  delta: Record<string, any>;
  was_approved: boolean;
  created_at?: string;
}

// ─── HCE Scoring ───
export interface HCEScore {
  campaign_id: string;
  company_id: string;
  overall_score: number;
  volume_score: number;
  engagement_score: number;
  health_score: number;
  quality_score: number;
  factors: HCEFactor[];
  computed_at: string;
}

export interface HCEFactor {
  name: string;
  weight: number;
  raw_value: number;
  normalized_value: number;
  description: string;
}

// ─── Reply Quality Breakdown ───
export interface ReplyQualityBreakdown {
  total_replies: number;
  by_classification: Record<ReplyClassification, number>;
  quality_score: number; // 0-100 based on positive/total weighted
  factor_1_icp_fit: number; // 0-100
  factor_2_timing: number; // 0-100
  factor_3_offer_strength: number; // 0-100
}

// ─── Diagnostic Result ───
export interface DiagnosticResult {
  campaign_id: string;
  company_id: string;
  diagnosis: string;
  severity: "critical" | "warning" | "info" | "healthy";
  factors: DiagnosticFactor[];
  recommendations: DiagnosticRecommendation[];
  raw_metrics: Record<string, any>;
  diagnosed_at: string;
}

export interface DiagnosticFactor {
  name: string;
  status: "critical" | "warning" | "ok";
  value: any;
  threshold: any;
  explanation: string;
}

export interface DiagnosticRecommendation {
  action: string;
  rationale: string;
  confidence: number;
  is_inference: boolean; // true = pattern inference, must be labeled
  risk_level: SkillRiskLevel;
}

// ─── EOD Report ───
export interface EODReport {
  company_id: string;
  report_date: string;
  total_sent: number;
  total_replied: number;
  total_bounced: number;
  total_opened: number;
  reply_quality: ReplyQualityBreakdown;
  campaign_summaries: CampaignSummary[];
  alerts: AlertItem[];
  recommendations: DiagnosticRecommendation[];
  generated_at: string;
}

export interface CampaignSummary {
  campaign_id: string;
  campaign_name: string;
  sent: number;
  replied: number;
  bounced: number;
  opened: number;
  reply_rate: number;
  bounce_rate: number;
  open_rate: number;
  hce_score: number | null;
  reply_quality: ReplyQualityBreakdown | null;
  status: string;
}

export interface AlertItem {
  type: "critical" | "warning" | "info";
  message: string;
  campaign_id?: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

// ─── Telegram ───
export interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
}
