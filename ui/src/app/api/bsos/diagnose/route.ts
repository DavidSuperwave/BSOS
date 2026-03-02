import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { diagnoseCampaign } from "@/lib/bsos/campaign-diagnostician";

/**
 * GET /api/bsos/diagnose?company_id=X&campaign_id=Y
 * Run diagnostics on a specific campaign.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  const campaignId = req.nextUrl.searchParams.get("campaign_id");

  if (!companyId || !campaignId) {
    return NextResponse.json({ error: "company_id and campaign_id required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  try {
    const diagnosis = await diagnoseCampaign(companyId, campaignId);
    return NextResponse.json(diagnosis);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
