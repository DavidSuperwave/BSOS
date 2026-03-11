import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";
import { fetchCampaignDetail } from "@/lib/plusvibe-campaigns";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const companyId = req.nextUrl.searchParams.get("companyId");
  const lead = req.nextUrl.searchParams.get("lead");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  try {
    let emails: any[] = [];
    let data: any = null;

    if (lead?.trim()) {
      const query = new URLSearchParams({
        campaign_id: campaignId,
        lead: lead.trim(),
      });

      data = await plusvibeFetch(
        `/unibox/campaign-emails?${query.toString()}`,
        companyId,
        { method: "GET" }
      );

      emails = Array.isArray(data)
        ? data
        : data?.emails || data?.data || data?.value || [];
    }

    const detail = await fetchCampaignDetail(companyId, campaignId);

    return NextResponse.json({
      emails: Array.isArray(emails) ? emails : [],
      campaign: detail.campaign,
      data,
    });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: err?.message || "Failed to fetch campaign copy" },
      { status: 500 }
    );
  }
}
