import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { runHealthChecks } from "@/lib/bsos/health-monitor";

/**
 * GET /api/bsos/health?company_id=X
 * Run health checks on all external services.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = req.nextUrl.searchParams.get("company_id") || undefined;
  const result = await runHealthChecks(companyId);

  return NextResponse.json(result);
}
