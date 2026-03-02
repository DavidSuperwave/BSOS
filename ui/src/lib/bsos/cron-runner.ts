/**
 * BSOS Cron Runner
 * Orchestrates the monitoring cadence:
 * - Every 30 min: failure checks (bounces, health)
 * - Every 2 hours: full finding sync
 * - EOD: end-of-day report after sending hour
 *
 * Called from /api/cron/bsos route (authenticated by CRON_SECRET).
 */

import { getAdminClient } from "./db";
import { syncPlusVibe } from "./plusvibe-sync";
import { runHealthChecks } from "./health-monitor";
import { sendCriticalAlert, sendEODSummary } from "./telegram";
import type { EODReport } from "./types";

export type CronJobType = "health_check" | "full_sync" | "eod_report";

export interface CronRunResult {
  job: CronJobType;
  companies_processed: number;
  errors: string[];
  duration_ms: number;
  triggered_at: string;
}

/**
 * Run health checks for all active companies.
 */
export async function runHealthCheckJob(): Promise<CronRunResult> {
  const start = Date.now();
  const result: CronRunResult = {
    job: "health_check",
    companies_processed: 0,
    errors: [],
    duration_ms: 0,
    triggered_at: new Date().toISOString(),
  };

  try {
    const db = getAdminClient();
    const { data: companies, error } = await db
      .from("companies")
      .select("id, name")
      .eq("is_active", true);

    if (error) throw new Error(`Failed to fetch companies: ${error.message}`);

    for (const company of companies || []) {
      try {
        const { overall, failures } = await runHealthChecks(company.id);
        result.companies_processed++;

        if (overall === "critical") {
          await sendCriticalAlert({
            type: "critical",
            message: `Health check failed for ${company.name}`,
            company_name: company.name,
          });
        }
      } catch (err: any) {
        result.errors.push(`${company.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(err.message);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

/**
 * Run full data sync for all active companies.
 */
export async function runFullSyncJob(): Promise<CronRunResult> {
  const start = Date.now();
  const result: CronRunResult = {
    job: "full_sync",
    companies_processed: 0,
    errors: [],
    duration_ms: 0,
    triggered_at: new Date().toISOString(),
  };

  try {
    const db = getAdminClient();
    const { data: companies, error } = await db
      .from("companies")
      .select("id, name")
      .eq("is_active", true);

    if (error) throw new Error(`Failed to fetch companies: ${error.message}`);

    for (const company of companies || []) {
      try {
        const syncResult = await syncPlusVibe(company.id);
        result.companies_processed++;

        if (syncResult.errors.length > 0) {
          result.errors.push(
            `${company.name}: ${syncResult.errors.slice(0, 3).join("; ")}`
          );
        }
      } catch (err: any) {
        result.errors.push(`${company.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(err.message);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

/**
 * Build and send EOD report for all active companies.
 */
export async function runEODReportJob(): Promise<CronRunResult> {
  const start = Date.now();
  const result: CronRunResult = {
    job: "eod_report",
    companies_processed: 0,
    errors: [],
    duration_ms: 0,
    triggered_at: new Date().toISOString(),
  };

  try {
    const db = getAdminClient();
    const { data: companies, error } = await db
      .from("companies")
      .select("id, name")
      .eq("is_active", true);

    if (error) throw new Error(`Failed to fetch companies: ${error.message}`);

    for (const company of companies || []) {
      try {
        const report = await buildEODReport(company.id);

        // Send Telegram summary
        const totalSent = report.total_sent;
        const totalReplied = report.total_replied;
        const totalBounced = report.total_bounced;

        await sendEODSummary({
          company_name: company.name,
          total_sent: totalSent,
          total_replied: totalReplied,
          total_bounced: totalBounced,
          reply_rate: totalSent > 0 ? `${((totalReplied / totalSent) * 100).toFixed(1)}%` : "0%",
          bounce_rate: totalSent > 0 ? `${((totalBounced / totalSent) * 100).toFixed(1)}%` : "0%",
          quality_score: report.reply_quality.quality_score,
          alerts_count: report.alerts.filter((a) => a.type === "critical").length,
          report_date: report.report_date,
        });

        // Persist report
        await db.from("daily_intelligence_snapshots").insert({
          company_id: company.id,
          snapshot_date: report.report_date,
          summary: report,
          alerts: report.alerts,
          recommendations: report.recommendations,
        });

        result.companies_processed++;
      } catch (err: any) {
        result.errors.push(`${company.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(err.message);
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// ─── EOD Report Builder ───

async function buildEODReport(companyId: string): Promise<EODReport> {
  const db = getAdminClient();
  const today = new Date().toISOString().split("T")[0];
  const todayStart = `${today}T00:00:00Z`;

  // Pull today's signals
  const { data: signals } = await db
    .from("campaign_signals")
    .select("*")
    .eq("company_id", companyId)
    .gte("recorded_at", todayStart);

  const sent = signals?.filter((s) => s.signal_type === "open").length || 0;
  const replied = signals?.filter((s) => s.signal_type === "reply").length || 0;
  const bounced = signals?.filter((s) => s.signal_type === "bounce").length || 0;
  const opened = signals?.filter((s) => s.signal_type === "open").length || 0;

  // Reply quality (simplified)
  const replies = signals?.filter((s) => s.signal_type === "reply") || [];
  const positiveReplies = replies.filter((r) => r.signal_value?.classification?.startsWith("positive_")).length;
  const qualityScore = replied > 0 ? Math.round((positiveReplies / replied) * 100) : 0;

  return {
    company_id: companyId,
    report_date: today,
    total_sent: sent,
    total_replied: replied,
    total_bounced: bounced,
    total_opened: opened,
    reply_quality: {
      total_replies: replied,
      by_classification: {} as any,
      quality_score: qualityScore,
      factor_1_icp_fit: qualityScore,
      factor_2_timing: 50,
      factor_3_offer_strength: 50,
    },
    campaign_summaries: [],
    alerts: [],
    recommendations: [],
    generated_at: new Date().toISOString(),
  };
}
