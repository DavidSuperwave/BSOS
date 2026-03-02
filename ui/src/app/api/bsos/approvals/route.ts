import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess, authenticateUser } from "@/lib/api-auth";
import { getPendingApprovals, resolveApproval, submitForApproval } from "@/lib/bsos/approval-manager";

/**
 * GET /api/bsos/approvals?company_id=X
 * Get pending approval queue items.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const approvals = await getPendingApprovals(companyId);
  return NextResponse.json({ approvals, count: approvals.length });
}

/**
 * POST /api/bsos/approvals
 * Submit a new action for approval.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company_id, skill_name, action_type, action_payload, rationale, confidence_score } = body;

  if (!company_id || !skill_name) {
    return NextResponse.json({ error: "company_id and skill_name required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(company_id);
  if (result.error) return result.error;

  const approval = await submitForApproval({
    company_id,
    skill_name,
    action_type: action_type || "manual",
    action_payload: action_payload || {},
    rationale: rationale || "",
    confidence_score: confidence_score || 0.5,
    predicted_impact: {},
  });

  return NextResponse.json(approval, { status: 201 });
}
