import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/bsos/cron-runner";
import { applyDecay } from "@/lib/bsos/bandit-engine";
import { applyConfidenceDecay } from "@/lib/bsos/confidence-lifecycle";
import { getAdminClient } from "@/lib/bsos/db";

/**
 * GET /api/cron/bsos-decay
 * Vercel Cron: Runs monthly (1st of month).
 * Applies Ebbinghaus decay to bandit arms and learning entries.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminClient();
  const { data: companies } = await db
    .from("companies")
    .select("id")
    .eq("status", "active");

  const results = {
    bandit_arms_decayed: 0,
    learnings_decayed: 0,
    learnings_expired: 0,
    companies_processed: 0,
  };

  for (const company of (companies || [])) {
    try {
      const banditDecayed = await applyDecay(company.id);
      const { decayed, expired } = await applyConfidenceDecay(company.id);

      results.bandit_arms_decayed += banditDecayed;
      results.learnings_decayed += decayed;
      results.learnings_expired += expired;
      results.companies_processed++;
    } catch (err: any) {
      console.error(`[Decay] Company ${company.id}:`, err.message);
    }
  }

  return NextResponse.json({ ...results, ran_at: new Date().toISOString() });
}
