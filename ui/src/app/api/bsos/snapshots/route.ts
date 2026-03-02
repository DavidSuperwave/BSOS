import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getAdminClient } from "@/lib/bsos/db";

/**
 * GET /api/bsos/snapshots?company_id=X&days=30
 * Get daily intelligence snapshots.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const days = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const db = getAdminClient();
  const { data, error } = await db
    .from("daily_intelligence_snapshots")
    .select("*")
    .eq("company_id", companyId)
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ snapshots: data || [], count: data?.length || 0 });
}
