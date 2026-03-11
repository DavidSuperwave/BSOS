import { NextRequest, NextResponse } from "next/server";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";

function resolveCampaignName(input: Record<string, any>) {
  const candidate =
    input?.camp_name ??
    input?.campaignName ??
    input?.name ??
    input?.title;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function normalizeCampaignStatus(input: any): string {
  const value = String(input || "").toLowerCase().trim();
  if (["active", "running", "launched", "started", "live", "in_progress", "enabled", "on"].includes(value)) {
    return "active";
  }
  if (["paused", "pause", "stopped", "inactive", "disabled", "off"].includes(value)) {
    return "paused";
  }
  if (["complete", "completed", "finished", "done", "ended"].includes(value)) {
    return "complete";
  }
  if (!value || value === "draft" || value === "new" || value === "pending") {
    return "draft";
  }
  return value;
}

export async function GET(request: NextRequest) {
  // Get companyId from query params
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") || undefined;

  try {
    const listData = await plusvibeFetch("/campaign/list-all", companyId, {
      method: "GET",
    });
    const campaignsRaw = Array.isArray(listData)
      ? listData
      : listData?.value || listData?.data || [];
    const campaigns = Array.isArray(campaignsRaw) ? campaignsRaw : [];

    const startDate = "2020-01-01";
    const endDate = "2030-12-31";
    let statsMap: Record<string, any> = {};

    try {
      const statsData = await plusvibeFetch(
        `/analytics/campaign/stats?start_date=${startDate}&end_date=${endDate}`,
        companyId,
        { method: "GET" }
      );
      const statsArr = Array.isArray(statsData) ? statsData : (typeof statsData === "object" && statsData !== null ? Object.values(statsData) : []);
      statsMap = statsArr.reduce((acc: Record<string, any>, stat: any) => {
        if (stat?._id) acc[stat._id] = stat;
        return acc;
      }, {});
    } catch {
      // Non-fatal: render campaigns even when stats endpoint is temporarily unavailable.
    }

    // Merge stats into campaigns
    const campaignsWithStats = campaigns.map((campaign: any) => {
      const campaignId = campaign._id || campaign.id;
      const stats = statsMap[campaignId];
      const normalizedName = campaign?.name || campaign?.camp_name || "Untitled Campaign";
      const normalizedCreatedAt =
        campaign?.createdAt ||
        campaign?.created_at ||
        campaign?.created_on ||
        new Date().toISOString();
      
      if (stats) {
        const sent = stats.sent_count || 0;
        const replies = stats.replied_count || 0;
        const positive = stats.positive_reply_count || 0;
        const opened = stats.unique_opened_count || 0;
        const leadCount = stats.lead_count || 0;
        const contacted = stats.lead_contacted_count || 0;
        
        return {
          ...campaign,
          id: campaignId,
          name: normalizedName,
          status: normalizeCampaignStatus(
            campaign?.status || campaign?.campaign_status || campaign?.state
          ),
          createdAt: normalizedCreatedAt,
          stats: {
            sent,
            replies,
            positive,
            opened,
            leadCount,
            contacted,
            // Calculated rates for UI
            replyRate: sent > 0 ? Math.round((replies / sent) * 100) : 0,
            positiveRate: replies > 0 ? Math.round((positive / replies) * 100) : 0,
            openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
            contactedRate: leadCount > 0 ? Math.round((contacted / leadCount) * 100) : 0,
            // Additional detailed stats
            completed: stats.completed_lead_count || 0,
            bounced: stats.bounced_count || 0,
            unsubscribed: stats.unsubscribed_count || 0,
          }
        };
      }
      
      return {
        ...campaign,
        id: campaignId,
        name: normalizedName,
        status: normalizeCampaignStatus(
          campaign?.status || campaign?.campaign_status || campaign?.state
        ),
        createdAt: normalizedCreatedAt,
        stats: {
          leadCount: 0,
          contacted: 0,
          sent: 0,
          replies: 0,
          positive: 0,
          opened: 0,
          replyRate: 0,
          positiveRate: 0,
          openRate: 0,
          contactedRate: 0,
        }
      };
    });
    
    return NextResponse.json({
      campaigns: campaignsWithStats,
    });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      {
        error: err.message || "Failed to fetch campaigns",
        code: "PLUSVIBE_ERROR",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId") || undefined;

  try {
    const body = await req.json();
    const campName = resolveCampaignName(body);
    if (!campName) {
      return NextResponse.json(
        { error: "Campaign name is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const payload = {
      ...body,
      camp_name: campName,
    };

    const data = await plusvibeFetch("/campaign/add/campaign", companyId, {
      method: "POST",
      body: payload,
    });
    return NextResponse.json(data);
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      {
        error: err.message || "Failed to create campaign",
        code: "PLUSVIBE_ERROR",
      },
      { status: 500 }
    );
  }
}
