/**
 * BSOS HCE (Holistic Campaign Effectiveness) Scoring
 * Computes a blended campaign score across four dimensions:
 *   Volume (20%) — sending volume relative to plan
 *   Engagement (35%) — opens + replies weighted
 *   Reply Quality (30%) — positive vs negative reply classification
 *   Deliverability (15%) — bounce rate health
 *
 * Score range: 0.0 – 1.0 (higher is better)
 * Threshold: < 0.35 = struggling, 0.35–0.65 = developing, > 0.65 = healthy
 */

import type { HCEScore, HCEDimension, CampaignMetrics } from "./types";

const WEIGHTS = {
  volume: 0.2,
  engagement: 0.35,
  replyQuality: 0.3,
  deliverability: 0.15,
};

/**
 * Compute the HCE score for a campaign given its current metrics.
 */
export function computeHCEScore(metrics: CampaignMetrics): HCEScore {
  const volumeScore = computeVolumeScore(metrics);
  const engagementScore = computeEngagementScore(metrics);
  const replyQualityScore = computeReplyQualityScore(metrics);
  const deliverabilityScore = computeDeliverabilityScore(metrics);

  const overall =
    volumeScore * WEIGHTS.volume +
    engagementScore * WEIGHTS.engagement +
    replyQualityScore * WEIGHTS.replyQuality +
    deliverabilityScore * WEIGHTS.deliverability;

  const dimensions: HCEDimension[] = [
    {
      name: "volume",
      score: volumeScore,
      weight: WEIGHTS.volume,
      contribution: volumeScore * WEIGHTS.volume,
      label: getVolumeLabel(metrics),
    },
    {
      name: "engagement",
      score: engagementScore,
      weight: WEIGHTS.engagement,
      contribution: engagementScore * WEIGHTS.engagement,
      label: getEngagementLabel(metrics),
    },
    {
      name: "reply_quality",
      score: replyQualityScore,
      weight: WEIGHTS.replyQuality,
      contribution: replyQualityScore * WEIGHTS.replyQuality,
      label: getReplyQualityLabel(metrics),
    },
    {
      name: "deliverability",
      score: deliverabilityScore,
      weight: WEIGHTS.deliverability,
      contribution: deliverabilityScore * WEIGHTS.deliverability,
      label: getDeliverabilityLabel(metrics),
    },
  ];

  const status =
    overall < 0.35 ? "struggling" : overall < 0.65 ? "developing" : "healthy";

  return {
    overall: Math.round(overall * 100) / 100,
    status,
    dimensions,
    computedAt: new Date().toISOString(),
  };
}

// --- Volume Score ---

function computeVolumeScore(metrics: CampaignMetrics): number {
  if (!metrics.plannedVolume || metrics.plannedVolume === 0) return 0.5; // neutral if no plan
  const ratio = metrics.actualVolume / metrics.plannedVolume;
  if (ratio >= 0.9) return 1.0;
  if (ratio >= 0.7) return 0.7;
  if (ratio >= 0.5) return 0.4;
  return 0.1;
}

function getVolumeLabel(metrics: CampaignMetrics): string {
  if (!metrics.plannedVolume) return "No volume plan set";
  const pct = Math.round((metrics.actualVolume / metrics.plannedVolume) * 100);
  return `${pct}% of planned volume (${metrics.actualVolume}/${metrics.plannedVolume})`;
}

// --- Engagement Score ---

function computeEngagementScore(metrics: CampaignMetrics): number {
  const openRate = metrics.sent > 0 ? metrics.opened / metrics.sent : 0;
  const replyRate = metrics.sent > 0 ? metrics.replied / metrics.sent : 0;

  // Weighted blend: reply rate matters more than open rate
  const blended = openRate * 0.4 + replyRate * 0.6;

  // Normalize: assume 5% reply rate = excellent (1.0)
  return Math.min(blended / 0.05, 1.0);
}

function getEngagementLabel(metrics: CampaignMetrics): string {
  const replyRate =
    metrics.sent > 0
      ? ((metrics.replied / metrics.sent) * 100).toFixed(2)
      : "0.00";
  const openRate =
    metrics.sent > 0
      ? ((metrics.opened / metrics.sent) * 100).toFixed(1)
      : "0.0";
  return `${replyRate}% reply rate, ${openRate}% open rate`;
}

// --- Reply Quality Score ---

function computeReplyQualityScore(metrics: CampaignMetrics): number {
  const total =
    (metrics.positiveReplies || 0) +
    (metrics.neutralReplies || 0) +
    (metrics.negativeReplies || 0);

  if (total === 0) return 0.5; // neutral if no replies

  const positiveRate = (metrics.positiveReplies || 0) / total;
  const negativeRate = (metrics.negativeReplies || 0) / total;

  // Positive replies boost score, negative replies penalize
  return Math.max(0, Math.min(1, 0.5 + positiveRate * 0.5 - negativeRate * 0.5));
}

function getReplyQualityLabel(metrics: CampaignMetrics): string {
  const total =
    (metrics.positiveReplies || 0) +
    (metrics.neutralReplies || 0) +
    (metrics.negativeReplies || 0);
  if (total === 0) return "No replies yet";
  return `${metrics.positiveReplies || 0} positive / ${metrics.neutralReplies || 0} neutral / ${metrics.negativeReplies || 0} negative`;
}

// --- Deliverability Score ---

function computeDeliverabilityScore(metrics: CampaignMetrics): number {
  const bounceRate = metrics.sent > 0 ? metrics.bounced / metrics.sent : 0;

  if (bounceRate <= 0.02) return 1.0; // excellent
  if (bounceRate <= 0.04) return 0.75;
  if (bounceRate <= 0.07) return 0.4;
  return 0.0; // above 7% is critical
}

function getDeliverabilityLabel(metrics: CampaignMetrics): string {
  const rate =
    metrics.sent > 0
      ? ((metrics.bounced / metrics.sent) * 100).toFixed(2)
      : "0.00";
  return `${rate}% bounce rate (${metrics.bounced} bounces)`;
}

/**
 * Classify overall HCE health.
 */
export function classifyHCEHealth(
  score: number
): "healthy" | "developing" | "struggling" {
  if (score >= 0.65) return "healthy";
  if (score >= 0.35) return "developing";
  return "struggling";
}

/**
 * Get a human-readable summary of the HCE score.
 */
export function summarizeHCEScore(hce: HCEScore): string {
  const pct = Math.round(hce.overall * 100);
  const statusLabel = {
    healthy: "Healthy",
    developing: "Developing",
    struggling: "Struggling",
  }[hce.status];

  const topDimension = [...hce.dimensions].sort(
    (a, b) => b.contribution - a.contribution
  )[0];

  return `HCE Score: ${pct}/100 (${statusLabel}). Top driver: ${topDimension.name} (${Math.round(topDimension.contribution * 100)}pts). ${topDimension.label}.`;
}
