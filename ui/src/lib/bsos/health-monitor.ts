/**
 * BSOS Health Monitor
 * Checks connectivity to all external services and internal DB.
 * Reports failures via Telegram.
 */

import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { bsosConfig } from "./env-bsos";
import { sendHealthAlert } from "./telegram";
import { getProjectCredentials } from "@/lib/plusvibe-project";

interface HealthCheckResult {
  service: string;
  status: "ok" | "degraded" | "down";
  latency_ms: number;
  error?: string;
}

/**
 * Run all health checks. Returns results + alerts on failure.
 */
export async function runHealthChecks(companyId?: string): Promise<{
  results: HealthCheckResult[];
  overall: "healthy" | "degraded" | "critical";
  failures: string[];
}> {
  const results: HealthCheckResult[] = [];

  // 1. Supabase check
  results.push(await checkSupabase());

  // 2. PlusVibe check
  results.push(await checkPlusVibe(companyId));

  // 3. Telegram check
  results.push(await checkTelegram());

  // 4. OpenClaw check
  results.push(await checkOpenClaw());

  const failures = results
    .filter((r) => r.status === "down")
    .map((r) => `${r.service}: ${r.error || "unreachable"}`);

  const degraded = results.filter((r) => r.status === "degraded");

  let overall: "healthy" | "degraded" | "critical" = "healthy";
  if (failures.length > 0) overall = "critical";
  else if (degraded.length > 0) overall = "degraded";

  // Auto-alert on critical
  if (overall === "critical") {
    await sendHealthAlert(failures);
  }

  return { results, overall, failures };
}

async function checkSupabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const url = envConfig.supabase.url();
    const key = envConfig.supabase.serviceRoleKey();
    if (!url || !key) return { service: "supabase", status: "down", latency_ms: 0, error: "Missing env vars" };

    const db = createClient(url, key);
    const { error } = await db.from("companies").select("id").limit(1);
    const latency = Date.now() - start;

    if (error) return { service: "supabase", status: "down", latency_ms: latency, error: error.message };
    return { service: "supabase", status: latency > 5000 ? "degraded" : "ok", latency_ms: latency };
  } catch (err: any) {
    return { service: "supabase", status: "down", latency_ms: Date.now() - start, error: err.message };
  }
}

async function checkPlusVibe(companyId?: string): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const creds = await getProjectCredentials(companyId);
    if (!creds) return { service: "plusvibe", status: "down", latency_ms: 0, error: "No credentials" };

    const res = await fetch(
      `https://api.plusvibe.ai/api/v1/campaign/list?workspace_id=${creds.workspaceId}&limit=1`,
      { headers: { "Content-Type": "application/json", "x-api-key": creds.apiKey } }
    );
    const latency = Date.now() - start;

    if (!res.ok) return { service: "plusvibe", status: "down", latency_ms: latency, error: `HTTP ${res.status}` };
    return { service: "plusvibe", status: latency > 5000 ? "degraded" : "ok", latency_ms: latency };
  } catch (err: any) {
    return { service: "plusvibe", status: "down", latency_ms: Date.now() - start, error: err.message };
  }
}

async function checkTelegram(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const token = bsosConfig.telegram.botToken();
    if (!token) return { service: "telegram", status: "down", latency_ms: 0, error: "No bot token" };

    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const latency = Date.now() - start;

    if (!res.ok) return { service: "telegram", status: "down", latency_ms: latency, error: `HTTP ${res.status}` };
    return { service: "telegram", status: latency > 3000 ? "degraded" : "ok", latency_ms: latency };
  } catch (err: any) {
    return { service: "telegram", status: "down", latency_ms: Date.now() - start, error: err.message };
  }
}

async function checkOpenClaw(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const url = envConfig.openclaw.url();
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;

    if (!res.ok) return { service: "openclaw", status: "degraded", latency_ms: latency, error: `HTTP ${res.status}` };
    return { service: "openclaw", status: latency > 5000 ? "degraded" : "ok", latency_ms: latency };
  } catch (err: any) {
    // OpenClaw might not be deployed yet — treat as degraded, not critical
    return { service: "openclaw", status: "degraded", latency_ms: Date.now() - start, error: err.message };
  }
}
