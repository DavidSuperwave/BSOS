import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getActiveLearnings, recordLearning } from "@/lib/bsos/confidence-lifecycle";

/**
 * GET /api/bsos/learnings?company_id=X&type=Y
 * Get active learning entries for a company.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const entryType = req.nextUrl.searchParams.get("type") || undefined;
  const learnings = await getActiveLearnings(companyId, entryType);

  return NextResponse.json({ learnings, count: learnings.length });
}

/**
 * POST /api/bsos/learnings
 * Record a new learning entry.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company_id, entry_type, content, source_campaign_id, confidence } = body;

  if (!company_id || !entry_type || !content) {
    return NextResponse.json({ error: "company_id, entry_type, and content required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(company_id);
  if (result.error) return result.error;

  const entry = await recordLearning(company_id, entry_type, content, source_campaign_id || "", confidence);
  return NextResponse.json(entry, { status: 201 });
}
