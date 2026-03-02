import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { initializeColdStart, checkColdStartGraduation } from "@/lib/bsos/cold-start";

/**
 * GET /api/bsos/cold-start?company_id=X&campaign_id=Y
 * Check cold start graduation status.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  const campaignId = req.nextUrl.searchParams.get("campaign_id");

  if (!companyId || !campaignId) {
    return NextResponse.json({ error: "company_id and campaign_id required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const status = await checkColdStartGraduation(companyId, campaignId);
  return NextResponse.json(status);
}

/**
 * POST /api/bsos/cold-start
 * Initialize cold start for a new campaign.
 * Body: { company_id, campaign_id, campaign_type, variants: string[] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company_id, campaign_id, campaign_type } = body;

  if (!company_id || !campaign_id || !campaign_type) {
    return NextResponse.json({
      error: "company_id, campaign_id, and campaign_type required"
    }, { status: 400 });
  }

  const result = await requireCompanyAccess(company_id);
  if (result.error) return result.error;

  const coldStart = await initializeColdStart(
    company_id,
    campaign_type
  );

  return NextResponse.json(
    { ...coldStart, campaign_id, campaign_type },
    { status: 201 }
  );
}
