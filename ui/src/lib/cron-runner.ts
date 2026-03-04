// Cron runner for BSOS scheduled jobs
import { getAdminClient } from "@/lib/bsos/db";

export interface CronJobResult {
  job: string;
  company_id: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  success: boolean;
  skipped?: boolean;
  reason?: string;
  details?: Record<string, any>;
}

const JOB_SKILL_MAP: Record<string, string[]> = {
  signal_ingest: ["campaign-monitor", "reply-miner"],
  deliverability_check: ["deliverability-watchdog"],
  pipeline_sync: ["pipeline-tracker"],
  daily_closeout: ["intelligence-reporter", "profile-enricher"],
  icp_validation: ["icp-validator"],
  onboarding_sweep: ["bounce-diagnostician", "lead-profiler"],
  memory_prune: ["lifecycle-maintenance"],
};

const JOB_INTERVAL_MS: Record<string, number> = {
  signal_ingest: 60 * 60 * 1000,
  deliverability_check: 2 * 60 * 60 * 1000,
  pipeline_sync: 6 * 60 * 60 * 1000,
  daily_closeout: 24 * 60 * 60 * 1000,
  icp_validation: 7 * 24 * 60 * 60 * 1000,
  onboarding_sweep: 4 * 60 * 60 * 1000,
  memory_prune: 7 * 24 * 60 * 60 * 1000,
};

function isKnownJob(jobName: string): boolean {
  return Object.prototype.hasOwnProperty.call(JOB_SKILL_MAP, jobName);
}

export async function getActiveCompanies(): Promise<{ id: string; slug: string; name: string }[]> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("companies")
    .select("id, slug, name")
    .in("status", ["active", "onboarding"]);

  if (error) {
    throw new Error(`Failed to load active companies: ${error.message}`);
  }

  return (data ?? []) as { id: string; slug: string; name: string }[];
}

export function isSendingWindow(_companyId?: string): boolean {
  const now = new Date();
  const utcHour = now.getUTCHours();
  return utcHour >= 8 && utcHour < 18;
}

export function validateCronSecret(headerValue: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  if (!headerValue) return false;
  return headerValue === expected;
}

export async function shouldRunJob(jobName: string, companyId: string): Promise<boolean> {
  if (!isKnownJob(jobName)) {
    return false;
  }

  if ((jobName === "signal_ingest" || jobName === "daily_closeout") && !isSendingWindow(companyId)) {
    return false;
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("bsos_cron_log")
    .select("ran_at")
    .eq("company_id", companyId)
    .eq("job_name", jobName)
    .eq("status", "success")
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // If we cannot read history, fail open and allow run.
    return true;
  }

  if (!data?.ran_at) {
    return true;
  }

  const lastRunAt = new Date(data.ran_at).getTime();
  const interval = JOB_INTERVAL_MS[jobName] ?? 60 * 60 * 1000;
  return Date.now() - lastRunAt >= interval;
}

async function executeJobSkills(jobName: string, companyId: string): Promise<Record<string, any>> {
  const skills = JOB_SKILL_MAP[jobName] ?? [];
  const supabase = getAdminClient();

  const skillResults: Array<{ skill: string; status: string; message?: string }> = [];

  for (const skill of skills) {
    const { error } = await supabase.from("skill_executions").insert({
      company_id: companyId,
      skill_id: skill,
      agent_type: "main",
      status: "queued",
      params: {
        trigger: "cron",
        trigger_job: jobName,
      },
      executed_at: new Date().toISOString(),
    });

    if (error) {
      skillResults.push({ skill, status: "error", message: error.message });
    } else {
      skillResults.push({ skill, status: "queued" });
    }
  }

  return { skills: skillResults };
}

export async function runCronJob(jobName: string, companyId: string): Promise<CronJobResult> {
  const startedAt = new Date();

  if (!isKnownJob(jobName)) {
    const finishedAt = new Date();
    return {
      job: jobName,
      company_id: companyId,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      success: false,
      skipped: true,
      reason: "unknown_job",
    };
  }

  const canRun = await shouldRunJob(jobName, companyId);
  if (!canRun) {
    const finishedAt = new Date();
    return {
      job: jobName,
      company_id: companyId,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      success: true,
      skipped: true,
      reason: "cadence_or_window_guard",
    };
  }

  let success = true;
  let details: Record<string, any> = {};
  let reason: string | undefined;

  try {
    details = await executeJobSkills(jobName, companyId);
  } catch (error: any) {
    success = false;
    reason = error?.message ?? "execution_failed";
  }

  const finishedAt = new Date();
  const result: CronJobResult = {
    job: jobName,
    company_id: companyId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    success,
    reason,
    details,
  };

  const supabase = getAdminClient();
  await supabase.from("bsos_cron_log").insert({
    company_id: companyId,
    job_name: jobName,
    status: result.success ? "success" : "failed",
    result_json: result.details ?? {},
    error_message: result.reason ?? null,
    duration_ms: result.duration_ms,
    ran_at: result.finished_at,
  });

  return result;
}

export async function runForAllCompanies(
  jobName: string,
): Promise<{ results: CronJobResult[]; total_duration_ms: number }> {
  const started = Date.now();
  const companies = await getActiveCompanies();

  const results: CronJobResult[] = [];
  for (const company of companies) {
    const result = await runCronJob(jobName, company.id);
    results.push(result);
  }

  return {
    results,
    total_duration_ms: Date.now() - started,
  };
}
