import { NextRequest, NextResponse } from "next/server";
import { getProjectCredentials } from "@/lib/plusvibe-project";

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

function sanitizePlusVibeErrorDetails(raw: string) {
  // Keep diagnostics concise and avoid leaking oversized payloads to the client.
  return raw.replace(/\s+/g, " ").trim().slice(0, 400);
}

function resolveCampaignName(input: Record<string, any>) {
  const candidate =
    input?.camp_name ??
    input?.campaignName ??
    input?.name ??
    input?.title;
  return typeof candidate === "string" ? candidate.trim() : "";
}

export async function GET(request: NextRequest) {
  // Get companyId from query params
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") || undefined;

  const credentials = await getProjectCredentials(companyId);
  
  if (!credentials) {
    return NextResponse.json(
      { error: "PlusVibe API key not configured", code: "MISSING_KEY" },
      { status: 503 }
    );
  }

  try {
    // Fetch campaign list
    const listRes = await fetch(
      `${PLUSVIBE_BASE}/campaign/list?workspace_id=${credentials.workspaceId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": credentials.apiKey,
        },
      }
    );
    
    if (!listRes.ok) {
      const errorText = await listRes.text();
      return NextResponse.json(
        {
          error: `PlusVibe API error: ${listRes.status}`,
          code: "PLUSVIBE_ERROR",
          details: sanitizePlusVibeErrorDetails(errorText),
        },
        { status: listRes.status }
      );
    }
    
    const listData = await listRes.json();
    const campaigns = listData.value || listData.data || listData;

    // Fetch campaign stats
    const startDate = "2020-01-01";
    const endDate = "2030-12-31";
    const statsRes = await fetch(
      `${PLUSVIBE_BASE}/campaign/stats?workspace_id=${credentials.workspaceId}&start_date=${startDate}&end_date=${endDate}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": credentials.apiKey,
        },
      }
    );

    let statsMap: Record<string, any> = {};
    
    if (statsRes.ok) {
      const statsData = await statsRes.json();
      if (Array.isArray(statsData)) {
        // Create a map of campaign_id -> stats
        statsMap = statsData.reduce((acc: Record<string, any>, stat: any) => {
          if (stat._id) {
            acc[stat._id] = stat;
          }
          return acc;
        }, {});
      }
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
      credentialsSource: credentials.source,
    });
  } catch (err: any) {
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

  const credentials = await getProjectCredentials(companyId);
  
  if (!credentials) {
    return NextResponse.json(
      { error: "PlusVibe API key not configured", code: "MISSING_KEY" },
      { status: 503 }
    );
  }

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
      workspace_id: credentials.workspaceId,
    };

    const res = await fetch(`${PLUSVIBE_BASE}/campaigns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credentials.apiKey,
      },
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        {
          error: `PlusVibe API error: ${res.status}`,
          code: "PLUSVIBE_ERROR",
          details: sanitizePlusVibeErrorDetails(errorText),
        },
        { status: res.status }
      );
    }
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err.message || "Failed to create campaign",
        code: "PLUSVIBE_ERROR",
      },
      { status: 500 }
    );
  }
}
