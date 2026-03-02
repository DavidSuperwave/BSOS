import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, runFailureCheck, runHealthCheckCron } from "@/lib/bsos/cron-runner";

/**
 * GET /api/cron/bsos-failure-check
 * Vercel Cron: Runs every 30 minutes.
 * Quick failure check for bounces and account health.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Run failure check + health check in parallel
    const [failureResult, healthResult] = await Promise.all([
      runFailureCheck(),
      runHealthCheckCron(),
    ]);

    return NextResponse.json({
      failure_check: failureResult,
      health_check: healthResult,
      ran_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[Cron] Failure check error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
