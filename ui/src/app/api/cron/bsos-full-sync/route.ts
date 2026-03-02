import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, runFullSync } from "@/lib/bsos/cron-runner";

/**
 * GET /api/cron/bsos-full-sync
 * Vercel Cron: Runs every 2 hours.
 * Full PlusVibe data sync — campaigns, leads, signals, health.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runFullSync();
    return NextResponse.json({ ...result, ran_at: new Date().toISOString() });
  } catch (err: any) {
    console.error("[Cron] Full sync error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
