import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { selectArm, updateArm, getBanditSummary } from "@/lib/bsos/bandit-engine";

/**
 * GET /api/bsos/bandit?company_id=X&campaign_type=Y
 * Get bandit state and arm recommendations.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const summary = await getBanditSummary(companyId);
  return NextResponse.json(summary);
}

/**
 * POST /api/bsos/bandit
 * Select an arm or update with observation.
 * Body: { company_id, campaign_type, action: "select" | "update", arm_name?, success? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company_id, campaign_type, action, arm_name, success } = body;

  if (!company_id || !campaign_type) {
    return NextResponse.json({ error: "company_id and campaign_type required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(company_id);
  if (result.error) return result.error;

  if (action === "select") {
    const selection = await selectArm(company_id, campaign_type);
    return NextResponse.json(selection);
  }

  if (action === "update" && arm_name !== undefined && success !== undefined) {
    await updateArm(company_id, campaign_type, arm_name, success);
    return NextResponse.json({ updated: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
