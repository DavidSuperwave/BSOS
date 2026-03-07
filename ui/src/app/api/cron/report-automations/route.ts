import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronSecret } from "@/lib/bsos/cron-runner";
import {
  buildReportMarkdown,
  computeNextRunAt,
  loadReportData,
  normalizeAutomationChannels,
  type ReportRow,
  type ScheduleConfigInput,
} from "@/lib/reporting";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

function normalizeScheduleConfig(raw: any): ScheduleConfigInput {
  const presetText = String(raw?.preset || "daily").toLowerCase();
  const preset =
    presetText === "hourly" || presetText === "weekly" ? presetText : "daily";
  return {
    preset,
    timeOfDay: typeof raw?.timeOfDay === "string" ? raw.timeOfDay : "08:00",
    dayOfWeek:
      typeof raw?.dayOfWeek === "number" && Number.isFinite(raw.dayOfWeek)
        ? Math.trunc(raw.dayOfWeek)
        : undefined,
    timezone: typeof raw?.timezone === "string" ? raw.timezone : "UTC",
  };
}

function toMarkdownContent(content: any): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    try {
      return `\`\`\`json\n${JSON.stringify(content, null, 2)}\n\`\`\``;
    } catch {
      return String(content);
    }
  }
  return "";
}

async function runReportAutomation(admin: any, job: any, triggeredAtIso: string) {
  const startedAt = Date.now();
  const config = (job?.config || {}) as any;
  const scheduleConfig = normalizeScheduleConfig(config?.schedule || {});
  const channels = normalizeAutomationChannels(config?.channels);
  const warnings: string[] = [];
  let runId: string | null = null;

  const { data: runningRow } = await admin
    .from("job_runs")
    .insert({
      job_id: job.id,
      company_id: job.company_id,
      status: "running",
      started_at: triggeredAtIso,
    })
    .select("id")
    .single();
  runId = runningRow?.id || null;

  try {
    const markdownSections: string[] = [];
    let reportId: string | null = null;
    let documentId: string | null = null;

    if (config?.reportId) {
      reportId = String(config.reportId);
      const { data: report, error: reportError } = await admin
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .eq("company_id", job.company_id)
        .maybeSingle();
      if (reportError) throw new Error(reportError.message);
      if (!report) throw new Error(`Report ${reportId} not found`);

      const reportData = await loadReportData({
        admin,
        companyId: job.company_id,
        report: report as ReportRow,
        range: config?.range || report.query_config?.range || "7d",
      });
      markdownSections.push(
        buildReportMarkdown({
          report: report as ReportRow,
          data: reportData,
          range: config?.range || report.query_config?.range || "7d",
          generatedAt: triggeredAtIso,
        })
      );
    }

    if (config?.documentId) {
      documentId = String(config.documentId);
      const { data: document, error: documentError } = await admin
        .from("documents")
        .select("id, title, content")
        .eq("id", documentId)
        .eq("company_id", job.company_id)
        .maybeSingle();
      if (documentError) throw new Error(documentError.message);
      if (!document) throw new Error(`Document ${documentId} not found`);

      const markdown = toMarkdownContent(document.content);
      markdownSections.push(`## ${document.title}\n\n${markdown}`);
    }

    if (markdownSections.length === 0) {
      throw new Error("Automation config must include reportId and/or documentId");
    }

    const markdownPayload = markdownSections.join("\n\n---\n\n");
    const deliveredChannels: string[] = [];

    if (channels.includes("inbox")) {
      const { error: eventError } = await admin.from("events").insert({
        company_id: job.company_id,
        event_type: "cron_result",
        title: `Scheduled report: ${job.name}`,
        description: markdownPayload.slice(0, 12000),
        priority: "low",
        status: "unread",
        actions: [
          {
            type: "open_reports",
            label: "Open Reports",
            href: "/analytics",
          },
          reportId ? { type: "open_report", reportId } : null,
          documentId ? { type: "open_document", documentId } : null,
        ].filter(Boolean),
      });
      if (eventError) throw new Error(eventError.message);
      deliveredChannels.push("inbox");
    }

    if (channels.includes("slack")) {
      const slackWebhookUrl = config?.delivery?.slackWebhookUrl || null;
      if (!slackWebhookUrl) {
        warnings.push("Slack channel requested but no slackWebhookUrl configured.");
      } else {
        const slackText = markdownPayload.length > 3600
          ? `${markdownPayload.slice(0, 3600)}\n\n...truncated`
          : markdownPayload;
        const slackResponse = await fetch(String(slackWebhookUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `*${job.name}*\n\n${slackText}`,
          }),
        });
        if (!slackResponse.ok) {
          throw new Error(`Slack webhook failed with status ${slackResponse.status}`);
        }
        deliveredChannels.push("slack");
      }
    }

    if (channels.includes("email")) {
      warnings.push("Email delivery requested but not configured in this environment.");
    }

    const nextRunAt = computeNextRunAt(scheduleConfig).toISOString();
    const { error: jobUpdateError } = await admin
      .from("scheduled_jobs")
      .update({
        status: "active",
        last_run_at: triggeredAtIso,
        next_run_at: nextRunAt,
        run_count: Number(job.run_count || 0) + 1,
        last_error: warnings.length > 0 ? warnings.join(" ") : null,
      })
      .eq("id", job.id);
    if (jobUpdateError) throw new Error(jobUpdateError.message);

    if (runId) {
      const { error: runUpdateError } = await admin
        .from("job_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          result: {
            deliveredChannels,
            warnings,
            reportId,
            documentId,
            range: config?.range || "7d",
          },
        })
        .eq("id", runId);
      if (runUpdateError) throw new Error(runUpdateError.message);
    }

    return {
      jobId: job.id,
      name: job.name,
      status: "completed" as const,
      deliveredChannels,
      warnings,
      nextRunAt,
    };
  } catch (error: any) {
    const errorMessage = error?.message || "Automation run failed";

    await admin
      .from("scheduled_jobs")
      .update({
        status: "error",
        last_run_at: triggeredAtIso,
        last_error: errorMessage,
      })
      .eq("id", job.id);

    if (runId) {
      await admin
        .from("job_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          error: errorMessage,
        })
        .eq("id", runId);
    }

    return {
      jobId: job.id,
      name: job.name,
      status: "failed" as const,
      error: errorMessage,
    };
  }
}

/**
 * GET /api/cron/report-automations
 * Execute due scheduled report/document automations.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const companyId = req.nextUrl.searchParams.get("companyId");
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || "50");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.trunc(limitRaw))) : 50;

  try {
    const admin = getAdmin();
    let query = admin
      .from("scheduled_jobs")
      .select("*")
      .eq("status", "active")
      .lte("next_run_at", nowIso)
      .order("next_run_at", { ascending: true })
      .limit(limit);

    if (companyId) query = query.eq("company_id", companyId);

    const { data: jobs, error } = await query;
    if (error) throw new Error(error.message);

    const automations = (jobs || []).filter((job: any) => job?.config?.kind === "report_automation");
    const results: any[] = [];

    for (const job of automations) {
      const result = await runReportAutomation(admin, job, nowIso);
      results.push(result);
    }

    return NextResponse.json({
      triggered_at: nowIso,
      due_jobs: automations.length,
      completed: results.filter((r) => r.status === "completed").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to execute report automations" },
      { status: 500 }
    );
  }
}
