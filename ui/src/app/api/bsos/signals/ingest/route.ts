import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { writeSignals, computeProxyScore } from "@/lib/bsos/signal-pipeline";
import type { CampaignSignal } from "@/lib/bsos/types";

/**
 * POST /api/bsos/signals/ingest
 * Manually ingest signals (for testing or webhook fallback).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company_id, signals } = body;

  if (!company_id || !signals?.length) {
    return NextResponse.json({ error: "company_id and signals[] required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(company_id);
  if (result.error) return result.error;

  // Ensure proxy scores are computed
  const enriched: CampaignSignal[] = signals.map((s: any) => ({
    ...s,
    company_id,
    proxy_score: s.proxy_score ?? computeProxyScore(s.signal_type, s.signal_value),
    recorded_at: s.recorded_at || new Date().toISOString(),
  }));

  const writeResult = await writeSignals(enriched);
  return NextResponse.json(writeResult);
}
