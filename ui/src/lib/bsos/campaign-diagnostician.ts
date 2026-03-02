/**
 * BSOS Campaign Diagnostician
 * Analyzes campaign performance and produces diagnostic results.
 * All recommendations are SUGGESTIONS — agent never takes action unilaterally.
 * Pattern inferences are explicitly labeled.
 */

import { getAdminClient } from "./db";
import type {
  DiagnosticResult,
  DiagnosticFactor,
  DiagnosticRecommendation,
  HCEScore,
  HCEFactor,
  ReplyQualityBreakdown,
  ReplyClassification,
} from "./types";

// ─── Thresholds ───
const THRESHOLDS = {
  reply_rate: { critical: 0.01, warning: 0.03, good: 0.08 },
  bounce_rate: { critical: 0.08, warning: 0.05, good: 0.02 },
  open_rate: { critical: 0.15, warning: 0.25, good: 0.40 },
  health_score: { critical: 50, warning: 70, good: 85 },
  quality_score: { critical: 20, warning: 40, good: 70 },
  hce_score: { critical: 30, warning: 50, good: 70 },
};

/**
 * Compute HCE (Health-Campaign-Engagement) score for a campaign.
 * Weighted composite of volume, engagement, health, and reply quality.
 */
export function computeHCEScore(
  campaignId: string,
  companyId: string,
  metrics: {
    sent: number;
    replied: number;
    bounced: number;
    opened: number;
    health_score: number;
    reply_quality_score: number;
    volume_weight?: number;
    engagement_weight?: number;
    health_weight?: number;
    quality_weight?: number;
  }
): HCEScore {
  const volumeW = metrics.volume_weight ?? 0.20;
  const engagementW = metrics.engagement_weight ?? 0.35;
  const healthW = metrics.health_weight ?? 0.25;
  const qualityW = metrics.quality_weight ?? 0.20;

  // Normalize each dimension to 0-100
  const volumeScore = Math.min(100, (metrics.sent / 1000) * 100); // 1000 sends = 100
  const replyRate = metrics.sent > 0 ? metrics.replied / metrics.sent : 0;
  const engagementScore = Math.min(100, (replyRate / THRESHOLDS.reply_rate.good) * 100);
  const healthScore = Math.min(100, metrics.health_score);
  const qualityScore = Math.min(100, metrics.reply_quality_score);

  const overall =
    volumeScore * volumeW +
    engagementScore * engagementW +
    healthScore * healthW +
    qualityScore * qualityW;

  const factors: HCEFactor[] = [
    {
      name: "volume",
      weight: volumeW,
      raw_value: metrics.sent,
      normalized_value: volumeScore,
      description: `${metrics.sent} emails sent`,
    },
    {
      name: "engagement",
      weight: engagementW,
      raw_value: replyRate,
      normalized_value: engagementScore,
      description: `${(replyRate * 100).toFixed(1)}% reply rate`,
    },
    {
      name: "health",
      weight: healthW,
      raw_value: metrics.health_score,
      normalized_value: healthScore,
      description: `${metrics.health_score}/100 health score`,
    },
    {
      name: "quality",
      weight: qualityW,
      raw_value: metrics.reply_quality_score,
      normalized_value: qualityScore,
      description: `${metrics.reply_quality_score}/100 reply quality`,
    },
  ];

  return {
    campaign_id: campaignId,
    company_id: companyId,
    overall_score: Math.round(overall),
    volume_score: Math.round(volumeScore),
    engagement_score: Math.round(engagementScore),
    health_score: Math.round(healthScore),
    quality_score: Math.round(qualityScore),
    factors,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Diagnose a campaign's performance.
 * Returns structured diagnostic with factors and SUGGESTIONS only.
 */
export async function diagnoseCampaign(
  campaignId: string,
  companyId: string
): Promise<DiagnosticResult> {
  const db = getAdminClient();
  const now = new Date().toISOString();

  // Pull signals from last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: signals } = await db
    .from("campaign_signals")
    .select("*")
    .eq("company_id", companyId)
    .eq("campaign_id", campaignId)
    .gte("recorded_at", sevenDaysAgo);

  const sent = signals?.filter((s) => s.signal_type === "open").length || 0;
  const replied = signals?.filter((s) => s.signal_type === "reply").length || 0;
  const bounced = signals?.filter((s) => s.signal_type === "bounce").length || 0;
  const opened = signals?.filter((s) => s.signal_type === "open").length || 0;

  const replyRate = sent > 0 ? replied / sent : 0;
  const bounceRate = sent > 0 ? bounced / sent : 0;
  const openRate = sent > 0 ? opened / sent : 0;

  // Reply quality
  const replies = signals?.filter((s) => s.signal_type === "reply") || [];
  const positiveReplies = replies.filter((r) =>
    (r.signal_value?.classification as string)?.startsWith("positive_")
  ).length;
  const qualityScore = replied > 0 ? Math.round((positiveReplies / replied) * 100) : 0;

  // Health score from latest snapshot
  const { data: healthSnap } = await db
    .from("account_health_snapshots")
    .select("health_score")
    .eq("company_id", companyId)
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const healthScore = healthSnap?.health_score ?? 80;

  // ─── Factor Analysis ───
  const factors: DiagnosticFactor[] = [];

  // Bounce rate factor
  const bounceStatus =
    bounceRate >= THRESHOLDS.bounce_rate.critical ? "critical" :
    bounceRate >= THRESHOLDS.bounce_rate.warning ? "warning" : "ok";
  factors.push({
    name: "bounce_rate",
    status: bounceStatus,
    value: bounceRate,
    threshold: THRESHOLDS.bounce_rate.warning,
    explanation:
      bounceStatus === "critical"
        ? `Bounce rate ${(bounceRate * 100).toFixed(1)}% is critically high. Domain reputation at risk.`
        : bounceStatus === "warning"
        ? `Bounce rate ${(bounceRate * 100).toFixed(1)}% approaching dangerous levels.`
        : `Bounce rate ${(bounceRate * 100).toFixed(1)}% is within acceptable range.`,
  });

  // Reply rate factor
  const replyStatus =
    replyRate < THRESHOLDS.reply_rate.critical ? "critical" :
    replyRate < THRESHOLDS.reply_rate.warning ? "warning" : "ok";
  factors.push({
    name: "reply_rate",
    status: replyStatus,
    value: replyRate,
    threshold: THRESHOLDS.reply_rate.warning,
    explanation:
      replyStatus === "critical"
        ? `Reply rate ${(replyRate * 100).toFixed(1)}% is very low. Likely ICP or offer problem.`
        : replyStatus === "warning"
        ? `Reply rate ${(replyRate * 100).toFixed(1)}% below target. Review messaging.`
        : `Reply rate ${(replyRate * 100).toFixed(1)}% is healthy.`,
  });

  // Health factor
  const healthStatus =
    healthScore < THRESHOLDS.health_score.critical ? "critical" :
    healthScore < THRESHOLDS.health_score.warning ? "warning" : "ok";
  factors.push({
    name: "health_score",
    status: healthStatus,
    value: healthScore,
    threshold: THRESHOLDS.health_score.warning,
    explanation:
      healthStatus === "critical"
        ? `Domain health ${healthScore}/100 is critical. Immediate action required.`
        : healthStatus === "warning"
        ? `Domain health ${healthScore}/100 needs attention.`
        : `Domain health ${healthScore}/100 is good.`,
  });

  // ─── Overall severity ───
  const criticalCount = factors.filter((f) => f.status === "critical").length;
  const warningCount = factors.filter((f) => f.status === "warning").length;

  const severity =
    criticalCount > 0 ? "critical" :
    warningCount > 0 ? "warning" :
    "healthy";

  // ─── Recommendations (SUGGESTIONS ONLY) ───
  const recommendations: DiagnosticRecommendation[] = [];

  if (bounceStatus === "critical") {
    recommendations.push({
      action: "Pause campaign and verify email list quality",
      rationale: "High bounce rate damages sender reputation and may trigger spam filters.",
      confidence: 0.95,
      is_inference: false, // Direct threshold breach, not inferred
      risk_level: "suggest",
    });
  }

  if (replyStatus === "critical" && sent > 50) {
    recommendations.push({
      action: "Review and revise subject line and opening line",
      rationale: "Very low reply rate with sufficient volume suggests messaging or ICP mismatch.",
      confidence: 0.75,
      is_inference: true, // Pattern inference
      risk_level: "suggest",
    });
  }

  if (healthStatus === "warning" || healthStatus === "critical") {
    recommendations.push({
      action: "Check SPF/DKIM/DMARC configuration and blacklist status",
      rationale: "Domain health issues can cause deliverability problems.",
      confidence: 0.90,
      is_inference: false,
      risk_level: "suggest",
    });
  }

  // Build diagnosis string
  const diagnosis =
    severity === "critical"
      ? `Campaign has ${criticalCount} critical issue(s) requiring attention.`
      : severity === "warning"
      ? `Campaign has ${warningCount} warning(s). Monitor closely.`
      : "Campaign is performing within acceptable parameters.";

  return {
    campaign_id: campaignId,
    company_id: companyId,
    diagnosis,
    severity,
    factors,
    recommendations,
    raw_metrics: {
      sent,
      replied,
      bounced,
      opened,
      reply_rate: replyRate,
      bounce_rate: bounceRate,
      open_rate: openRate,
      quality_score: qualityScore,
      health_score: healthScore,
    },
    diagnosed_at: now,
  };
}

/**
 * Build reply quality breakdown from raw signal data.
 */
export function buildReplyQuality(
  replies: Array<{ signal_value: Record<string, any> }>
): ReplyQualityBreakdown {
  const byClass: Record<string, number> = {};
  let f1Total = 0;
  let f2Total = 0;
  let f3Total = 0;

  for (const r of replies) {
    const cls = (r.signal_value?.classification as ReplyClassification) || "unknown";
    byClass[cls] = (byClass[cls] || 0) + 1;
    f1Total += r.signal_value?.factor_1_icp_fit ?? 50;
    f2Total += r.signal_value?.factor_2_timing ?? 50;
    f3Total += r.signal_value?.factor_3_offer_strength ?? 50;
  }

  const total = replies.length || 1;
  const positive = (byClass["positive_interested"] || 0) + (byClass["positive_referral"] || 0);
  const negative = (byClass["negative_not_interested"] || 0) +
    (byClass["negative_unsubscribe"] || 0) +
    (byClass["negative_hostile"] || 0);

  const qualityScore = Math.round(
    ((positive * 1.0 + (total - positive - negative) * 0.3) / total) * 100
  );

  return {
    total_replies: replies.length,
    by_classification: byClass as any,
    quality_score: Math.min(100, Math.max(0, qualityScore)),
    factor_1_icp_fit: Math.round(f1Total / total),
    factor_2_timing: Math.round(f2Total / total),
    factor_3_offer_strength: Math.round(f3Total / total),
  };
}
