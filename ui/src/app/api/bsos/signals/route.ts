import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getAdminClient } from "@/lib/bsos/db";

/**
 * GET /api/bsos/signals?company_id=...
 * Returns recent campaign signals for the company.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("company_id");

  if (!companyId) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  const authResult = await requireCompanyAccess(request, companyId);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const db = getAdminClient();
  const since = searchParams.get("since") || new Date(Date.now() - 86400000).toISOString();

  const { data, error } = await db
    .from("campaign_signals")
    .select("*")
    .eq("company_id", companyId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signals: data || [] });
}
