import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { generateEODReport } from "@/lib/bsos/eod-reporter";
import { getAdminClient } from "@/lib/bsos/db";

/**
 * GET /api/bsos/eod?company_id=X&date=YYYY-MM-DD
 * Get EOD report. If date not provided, generates fresh for today.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const date = req.nextUrl.searchParams.get("date");

  if (date) {
    // Fetch stored snapshot
    const db = getAdminClient();
    const { data } = await db
      .from("daily_intelligence_snapshots")
      .select("*")
      .eq("company_id", companyId)
      .eq("snapshot_date", date)
      .single();

    if (data) return NextResponse.json(data);
    return NextResponse.json({ error: "No report for that date" }, { status: 404 });
  }

  // Generate fresh report
  const report = await generateEODReport(companyId);
  return NextResponse.json(report);
}
