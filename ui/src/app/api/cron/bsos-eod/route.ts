import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/bsos/cron-runner";
import { runEODReports } from "@/lib/bsos/eod-reporter";

/**
 * GET /api/cron/bsos-eod
 * Vercel Cron: Runs daily at 11:00 PM UTC (after sending hours).
 * Generates end-of-day reports for all companies.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runEODReports();
    return NextResponse.json({ ...result, ran_at: new Date().toISOString() });
  } catch (err: any) {
    console.error("[Cron] EOD report error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
