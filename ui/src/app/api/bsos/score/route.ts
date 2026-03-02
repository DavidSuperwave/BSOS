import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { computeHCEScore } from "@/lib/bsos/hce-scoring";
import { getAdminClient } from "@/lib/bsos/db";

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
  const db = getAdminClient();

  try {
    if (campaignId) {
      const score = await computeScoreForCampaign(db, companyId, campaignId);
      return NextResponse.json({ score, computed_in_ms: Date.now() - start });
    }

    const { data: campaignRows } = await db
      .from("campaign_signals")
      .select("campaign_id")
      .eq("company_id", companyId);

    const campaignIds = Array.from(
      new Set((campaignRows || []).map((row) => row.campaign_id).filter(Boolean))
    );
    const scores = await Promise.all(
      campaignIds.map(async (id) => ({
        campaign_id: id,
        score: await computeScoreForCampaign(db, companyId, id),
      }))
    );

    return NextResponse.json({ scores, count: scores.length, computed_in_ms: Date.now() - start });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function computeScoreForCampaign(
  db: ReturnType<typeof getAdminClient>,
  companyId: string,
  campaignId: string
) {
  const { data: signals } = await db
    .from("campaign_signals")
    .select("signal_type, signal_value")
    .eq("company_id", companyId)
    .eq("campaign_id", campaignId);

  const sent = (signals || []).filter((s) => s.signal_type === "open").length;
  const opened = sent;
  const repliedSignals = (signals || []).filter((s) => s.signal_type === "reply");
  const replied = repliedSignals.length;
  const bounced = (signals || []).filter((s) => s.signal_type === "bounce").length;
  const positiveReplies = repliedSignals.filter((s) =>
    (s.signal_value?.classification as string)?.startsWith("positive_")
  ).length;
  const negativeReplies = repliedSignals.filter((s) =>
    (s.signal_value?.classification as string)?.startsWith("negative_")
  ).length;
  const neutralReplies = Math.max(0, replied - positiveReplies - negativeReplies);

  return computeHCEScore({
    sent,
    opened,
    replied,
    bounced,
    positiveReplies,
    neutralReplies,
    negativeReplies,
    actualVolume: sent,
    plannedVolume: sent,
  });
}
