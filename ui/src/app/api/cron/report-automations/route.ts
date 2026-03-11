import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/bsos/cron-runner";
import { runScheduledReportAutomations } from "@/lib/reports/report-automation";

/**
 * GET /api/cron/report-automations
 * Runs hourly and materializes due daily report documents.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const companyId = req.nextUrl.searchParams.get("companyId") || undefined;
    const automationId = req.nextUrl.searchParams.get("automationId") || undefined;
    const force = req.nextUrl.searchParams.get("force") === "true";
    const result = await runScheduledReportAutomations({
      companyId,
      automationId,
      force,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to run report automations" },
      { status: 500 }
    );
  }
}
