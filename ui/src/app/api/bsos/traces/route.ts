import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getAdminClient } from "@/lib/bsos/db";

/**
 * GET /api/bsos/traces?company_id=X&skill=Y&limit=50
 * Get agent trace logs for observability.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const skillName = req.nextUrl.searchParams.get("skill");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);

  const db = getAdminClient();
  let query = db
    .from("agent_trace_log")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200));

  if (skillName) query = query.eq("skill_name", skillName);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ traces: data || [], count: data?.length || 0 });
}
