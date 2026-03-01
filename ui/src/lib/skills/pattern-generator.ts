export interface CampaignMetrics {
  reply_rate: number;
  positive_rate: number;
  volume?: number;
  variance?: number;
  trend?: "up" | "down" | "flat";
  ooo_rate?: number;
}

export type PerformancePattern =
  | "high_volume_low_quality"
  | "high_quality_low_volume"
  | "consistent_performer"
  | "volatile"
  | "declining_trend"
  | "improving_trend";

export function detectPerformancePattern(metrics: CampaignMetrics): PerformancePattern {
  const replyRate = Number(metrics.reply_rate || 0);
  const positiveRate = Number(metrics.positive_rate || 0);
  const volume = Number(metrics.volume || 0);
  const variance = Number(metrics.variance || 0);
  const trend = metrics.trend || "flat";
  const oooRate = Number(metrics.ooo_rate || 0);

  if (replyRate >= 15 && oooRate >= 60) {
    return "high_volume_low_quality";
  }

  if (replyRate >= 10 && positiveRate < 20) {
    return "high_volume_low_quality";
  }

  if (replyRate < 4 && positiveRate >= 45) {
    return "high_quality_low_volume";
  }

  if (trend === "down") return "declining_trend";
  if (trend === "up") return "improving_trend";

  if (variance >= 0.25) return "volatile";

  if (replyRate >= 4 && positiveRate >= 30 && variance < 0.2) {
    return "consistent_performer";
  }

  return volume > 0 ? "consistent_performer" : "volatile";
}
