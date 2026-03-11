import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { evaluateCampaign } from "@/lib/chess-engine/evaluator";
import type { CampaignEvalInput } from "@/lib/chess-engine/types";
import { envConfig } from "@/lib/env";
import { fetchCampaignDetail } from "@/lib/plusvibe-campaigns";
import { PlusVibeError } from "@/lib/plusvibe-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!admin) admin = createClient(supabaseUrl, supabaseServiceKey);
  return admin;
}

/**
 * GET /api/campaigns/[id]/score?companyId=xxx
 * Returns chess engine evaluation for a campaign.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const db = getAdmin();

  // Fetch company data for supporting systems and evaluation context
  const { data: company } = await db
    .from("companies")
    .select("slug, integration_credentials, onboarding_data")
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    const { campaign } = await fetchCampaignDetail(companyId, campaignId);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found in PlusVibe" },
        { status: 404 }
      );
    }

    // Check domain health from inboxing
    const { data: domains } = await db
      .from("inboxing_domains")
      .select("health_score")
      .eq("company_id", companyId)
      .not("health_score", "is", null);

    const avgDomainHealth =
      domains && domains.length > 0
        ? domains.reduce(
            (sum: number, d: any) => sum + (d.health_score || 0),
            0
          ) / domains.length
        : 50;

    // Check infrastructure
    const hasBookingLink = Boolean(
      company.integration_credentials?.calendly_api_key ||
        envConfig.calendly.apiKey()
    );
    const hasCrmConnection = Boolean(
      company.integration_credentials?.close_api_key ||
        envConfig.close.apiKey()
    );

    // Check inbox messages for engagement data
    const { count: replyCount } = await db
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("campaign_id", campaignId);

    // Build evaluation input
    const totalLeads = campaign.stats.leadCount || 0;
    const contacted = campaign.stats.contacted || 0;
    const replied = campaign.stats.replies || replyCount || 0;
    const positive = campaign.stats.positive || 0;
    const bounced = campaign.stats.bounced || 0;
    const opened = campaign.stats.opened || 0;
    const clicked = 0;

    const createdAt = campaign.createdAt
      ? new Date(campaign.createdAt)
      : new Date();
    const daysSinceStart = Math.max(
      0,
      Math.floor(
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    // Estimate ICP match from onboarding data
    const icpMatchRate = company.onboarding_data?.icp_titles?.length > 0 ? 0.7 : 0.5;

    const targetAcv = company.onboarding_data?.target_acv || 50000;

    const evalInput: CampaignEvalInput = {
      campaignId,
      campaignName: campaign.name || "Untitled Campaign",
      totalLeads,
      verifiedLeads: Math.max(0, totalLeads - bounced),
      engagedLeads: replied,
      bouncedLeads: bounced,
      sequenceSteps:
        campaign.sequence_count ||
        campaign.steps?.length ||
        campaign.sequences?.length ||
        3,
      hasPersonalization: Boolean(
        campaign.personalization_enabled || campaign.has_personalization
      ),
      domainHealth: avgDomainHealth,
      hasBookingLink,
      hasCrmConnection,
      openRate: contacted > 0 ? opened / contacted : 0,
      clickRate: contacted > 0 ? clicked / contacted : 0,
      replyRate: contacted > 0 ? replied / contacted : 0,
      positiveReplyRate: contacted > 0 ? positive / contacted : 0,
      bounceRate: totalLeads > 0 ? bounced / totalLeads : 0,
      icpMatchRate,
      daysSinceStart,
      targetAcv,
      alternativeSequences: 1, // default, could query PlusVibe for variants
      untappedSegments: 3, // default estimate
      activeChannels: 1, // email only for V1
    };

    const evaluation = evaluateCampaign(evalInput);

    return NextResponse.json(evaluation);
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    console.error("[Campaign Score] Error:", err);
    return NextResponse.json(
      { error: err.message || "Evaluation failed" },
      { status: 500 }
    );
  }
}
