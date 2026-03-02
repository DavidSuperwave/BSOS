import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getAdminClient } from "@/lib/bsos/db";

/**
 * GET /api/bsos/account-health?company_id=X
 * Get latest account health snapshots.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const db = getAdminClient();

  // Get latest snapshot per account
  const { data, error } = await db
    .from("account_health_snapshots")
    .select("*")
    .eq("company_id", companyId)
    .order("snapshot_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduplicate — latest per email_account
  const latest = new Map<string, any>();
  for (const snap of (data || [])) {
    if (!latest.has(snap.email_account)) {
      latest.set(snap.email_account, snap);
    }
  }

  const accounts = Array.from(latest.values());
  const avgHealth = accounts.reduce((s, a) => s + a.health_score, 0) / Math.max(accounts.length, 1);

  return NextResponse.json({
    accounts,
    count: accounts.length,
    avg_health_score: Math.round(avgHealth),
  });
}
