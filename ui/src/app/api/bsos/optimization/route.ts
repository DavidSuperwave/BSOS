import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import {
  getOptimizationState,
  setOptimizationMode,
  checkPhaseTransitionForCampaign,
  advancePhase,
} from "@/lib/bsos/phase-manager";

/**
 * GET /api/bsos/optimization?company_id=X&campaign_id=Y
 * Get optimization state and phase transition readiness.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  const campaignId = req.nextUrl.searchParams.get("campaign_id");

  if (!companyId || !campaignId) {
    return NextResponse.json({ error: "company_id and campaign_id required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const state = await getOptimizationState(companyId, campaignId);
  const transition = await checkPhaseTransitionForCampaign(companyId, campaignId);

  return NextResponse.json({ state, transition });
}

/**
 * PATCH /api/bsos/optimization
 * Update optimization mode or advance phase.
 * Body: { company_id, campaign_id, action: "set_mode" | "advance_phase", mode? }
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { company_id, campaign_id, action, mode } = body;

  if (!company_id || !campaign_id) {
    return NextResponse.json({ error: "company_id and campaign_id required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(company_id);
  if (result.error) return result.error;

  try {
    if (action === "set_mode" && mode) {
      const state = await setOptimizationMode(company_id, campaign_id, mode);
      return NextResponse.json({ state });
    }

    if (action === "advance_phase") {
      const state = await advancePhase(company_id, campaign_id);
      return NextResponse.json({ state });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
