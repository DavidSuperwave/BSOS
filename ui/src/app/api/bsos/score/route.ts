import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { computeHCEScore, computeAllHCEScores } from "@/lib/bsos/hce-scoring";

/**
 * GET /api/bsos/score?company_id=X&campaign_id=Y
 * Compute HCE score for a campaign. Target: <50ms.
 * If no campaign_id, returns scores for all campaigns.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const campaignId = req.nextUrl.searchParams.get("campaign_id");
  const start = Date.now();

  try {
    if (campaignId) {
      const score = await computeHCEScore(companyId, campaignId);
      return NextResponse.json({ score, computed_in_ms: Date.now() - start });
    }

    const scores = await computeAllHCEScores(companyId);
    return NextResponse.json({ scores, count: scores.length, computed_in_ms: Date.now() - start });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
