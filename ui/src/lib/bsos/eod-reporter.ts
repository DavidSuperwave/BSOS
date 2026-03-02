/**
 * BSOS End-of-Day Reporter
 * Generates comprehensive EOD reports after sending hours.
 * Aggregates all campaign data, reply quality, and health metrics.
 * Stores in daily_intelligence_snapshots and sends via Telegram.
 */

import { getAdminClient } from "./db";
import { classifyReply, computeReplyQuality } from "./reply-classifier";
import { sendEODSummary, sendCriticalAlert } from "./telegram";
import { diagnoseCampaign } from "./campaign-diagnostician";
import type {
  EODReport,
  CampaignSummary,
  AlertItem,
  ReplyQualityBreakdown,
  DiagnosticRecommendation,
} from "./types";

/**
 * Generate and store the EOD report for a company.
 */
export async function generateEODReport(companyId: string): Promise<EODReport> {
  const db = getAdminClient();
  const today = new Date().toISOString().split("T")[0];
  const startOfDay = `${today}T00:00:00Z`;
  const now = new Date().toISOString();

  // 1. Get company info
  const { data: company } = await db
    .from("companies")
    .select("name, slug")
    .eq("id", companyId)
    .single();

  const companyName = company?.name || "Unknown";

  // 2. Pull today's signals
  const { data: signals } = await db
    .from("campaign_signals")
    .select("*")
    .eq("company_id", companyId)
    .gte("recorded_at", startOfDay);

  const allSignals = signals || [];

  // 3. Pull today's bounces
  const { data: bounces } = await db
    .from("bounce_events")
    .select("*")
    .eq("company_id", companyId)
    .gte("recorded_at", startOfDay);

  const allBounces = bounces || [];

  // 4. Aggregate totals
  const totalSent = allSignals.filter((s) => s.signal_type === "open").length;
  const totalReplied = allSignals.filter((s) => s.signal_type === "reply").length;
  const totalBounced = allBounces.length;
  const totalOpened = allSignals.filter((s) => s.signal_type === "open").length;
  const replyRate = totalSent > 0 ? totalReplied / totalSent : 0;
  const bounceRate = totalSent > 0 ? totalBounced / totalSent : 0;

  // 5. Get active campaigns
  const { data: campaigns } = await db
    .from("campaigns")
    .select("id, name, status")
    .eq("company_id", companyId)
    .eq("status", "active");

  const activeCampaigns = campaigns || [];

  // 6. Build per-campaign summaries
  const campaignSummaries: CampaignSummary[] = [];

  for (const campaign of activeCampaigns) {
    const campSignals = allSignals.filter((s) => s.campaign_id === campaign.id);
    const campBounces = allBounces.filter((b) => b.campaign_id === campaign.id);

    const sent = campSignals.filter((s) => s.signal_type === "open").length;
    const replied = campSignals.filter((s) => s.signal_type === "reply").length;
    const bounced = campBounces.length;
    const opened = campSignals.filter((s) => s.signal_type === "open").length;

    // Get reply texts for quality analysis
    const replyTexts = campSignals
      .filter((s) => s.signal_type === "reply" && s.metadata?.reply_text)
      .map((s) => s.metadata.reply_text as string);

    let replyQuality: ReplyQualityBreakdown | null = null;
    if (replyTexts.length > 0) {
      const classifications = await Promise.all(replyTexts.map((text) => classifyReply(text)));
      replyQuality = computeReplyQuality(classifications);
    }

    // Run diagnostics
    const diagnostics = await diagnoseCampaign(companyId, campaign.id);

    campaignSummaries.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      sent,
      opened,
      replied,
      bounced,
      replyRate: sent > 0 ? replied / sent : 0,
      bounceRate: sent > 0 ? bounced / sent : 0,
      replyQuality,
      diagnostics,
    });
  }

  // 7. Build alerts
  const alerts: AlertItem[] = [];

  if (bounceRate > 0.05) {
    alerts.push({
      severity: "critical",
      type: "high_bounce_rate",
      message: `Bounce rate is ${(bounceRate * 100).toFixed(1)}% — above 5% threshold`,
      campaignId: null,
    });
  }

  if (replyRate < 0.01 && totalSent > 100) {
    alerts.push({
      severity: "warning",
      type: "low_reply_rate",
      message: `Reply rate is only ${(replyRate * 100).toFixed(2)}% across all campaigns`,
      campaignId: null,
    });
  }

  for (const summary of campaignSummaries) {
    if (summary.bounceRate > 0.08) {
      alerts.push({
        severity: "critical",
        type: "campaign_high_bounce",
        message: `Campaign "${summary.campaignName}" has ${(summary.bounceRate * 100).toFixed(1)}% bounce rate`,
        campaignId: summary.campaignId,
      });
    }
  }

  // 8. Collect top recommendations
  const allRecommendations: DiagnosticRecommendation[] = campaignSummaries
    .flatMap((s) => s.diagnostics?.recommendations || [])
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);

  // 9. Build the report
  const report: EODReport = {
    companyId,
    companyName,
    date: today,
    generatedAt: now,
    totals: {
      sent: totalSent,
      opened: totalOpened,
      replied: totalReplied,
      bounced: totalBounced,
      replyRate,
      bounceRate,
    },
    campaigns: campaignSummaries,
    alerts,
    topRecommendations: allRecommendations,
  };

  // 10. Store in DB
  await db.from("daily_intelligence_snapshots").insert({
    company_id: companyId,
    snapshot_date: today,
    report_json: report,
    created_at: now,
  });

  // 11. Send Telegram notifications
  if (alerts.some((a) => a.severity === "critical")) {
    const criticalAlerts = alerts.filter((a) => a.severity === "critical");
    await sendCriticalAlert(companyId, criticalAlerts);
  }

  await sendEODSummary(companyId, report);

  return report;
}

/**
 * Trigger EOD reports for all active companies.
 * Called by a cron job after sending hours.
 */
export async function triggerAllEODReports(): Promise<void> {
  const db = getAdminClient();

  const { data: companies } = await db
    .from("companies")
    .select("id")
    .eq("status", "active");

  if (!companies || companies.length === 0) return;

  const results = await Promise.allSettled(
    companies.map((c) => generateEODReport(c.id))
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(`[EOD Reporter] ${failed.length} companies failed EOD reporting`);
    failed.forEach((f) => console.error(f));
  }
}

/**
 * Get the latest EOD report for a company.
 */
export async function getLatestEODReport(
  companyId: string
): Promise<EODReport | null> {
  const db = getAdminClient();

  const { data } = await db
    .from("daily_intelligence_snapshots")
    .select("report_json")
    .eq("company_id", companyId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .single();

  return data?.report_json || null;
}

/**
 * Get EOD reports for a date range.
 */
export async function getEODReports(
  companyId: string,
  startDate: string,
  endDate: string
): Promise<EODReport[]> {
  const db = getAdminClient();

  const { data } = await db
    .from("daily_intelligence_snapshots")
    .select("report_json")
    .eq("company_id", companyId)
    .gte("snapshot_date", startDate)
    .lte("snapshot_date", endDate)
    .order("snapshot_date", { ascending: false });

  return (data || []).map((d) => d.report_json);
}

export async function runEODReports(): Promise<{
  companies_processed: number;
  errors: string[];
}> {
  const db = getAdminClient();
  const errors: string[] = [];
  let companiesProcessed = 0;

  const { data: companies } = await db
    .from("companies")
    .select("id")
    .eq("status", "active");

  for (const company of companies || []) {
    try {
      await generateEODReport(company.id);
      companiesProcessed++;
    } catch (err: any) {
      errors.push(`${company.id}: ${err?.message || String(err)}`);
    }
  }

  return { companies_processed: companiesProcessed, errors };
}
