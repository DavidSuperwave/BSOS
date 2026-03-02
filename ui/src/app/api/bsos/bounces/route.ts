import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getAdminClient } from "@/lib/bsos/db";

/**
 * GET /api/bsos/bounces?company_id=X&campaign_id=Y&days=7
 * Fetch bounce events with classification.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const campaignId = req.nextUrl.searchParams.get("campaign_id");
  const days = parseInt(req.nextUrl.searchParams.get("days") || "7", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const db = getAdminClient();
  let query = db
    .from("bounce_events")
    .select("*")
    .eq("company_id", companyId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: false })
    .limit(500);

  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate by classification
  const byClassification: Record<string, number> = {};
  for (const b of (data || [])) {
    byClassification[b.classification] = (byClassification[b.classification] || 0) + 1;
  }

  return NextResponse.json({
    bounces: data || [],
    count: data?.length || 0,
    by_classification: byClassification,
  });
}
