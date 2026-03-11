import { NextRequest, NextResponse } from "next/server";
import { getCompanyCredentials } from "@/lib/company-credentials";
import { requireCompanyAccess } from "@/lib/api-auth";
import { fetchCampaignsWithStats, summarizeCampaignStats } from "@/lib/plusvibe-campaigns";

export const dynamic = "force-dynamic";

const CALENDLY_BASE = "https://api.calendly.com";
const EXTERNAL_FETCH_TIMEOUT_MS = 3500;

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function rangeToDays(range: string): number {
  switch (range) {
    case "24h": return 1;
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    default: return 7;
  }
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const range = req.nextUrl.searchParams.get("range") || "7d";
  const days = rangeToDays(range);

  const authResult = await requireCompanyAccess(companyId);
  if (authResult.error) return authResult.error;

  const creds = await getCompanyCredentials(companyId);

  const pvKey = creds.plusvibe_api_key;
  const pvWorkspace = creds.plusvibe_workspace_id;
  const calKey = creds.calendly_api_key;
  const calUserUri = creds.calendly_user_uri;

  // Check if properly configured
  const plusvibeConfigured = !!(pvKey && pvWorkspace);
  const calendlyConfigured = !!(calKey && calUserUri);
  const configured = plusvibeConfigured || calendlyConfigured;

  // Return early with clear error if no credentials
  if (!configured) {
    return NextResponse.json({
      totalReplies: 0,
      positiveReplies: 0,
      activeLeads: 0,
      meetingsBooked: 0,
      activeCampaigns: [],
      totalCampaigns: 0,
      totalSends: 0,
      configured: false,
      errors: [
        !plusvibeConfigured && "PlusVibe not configured - missing API key or workspace ID",
        !calendlyConfigured && "Calendly not configured - missing API key or user URI"
      ].filter(Boolean),
    });
  }

  let totalReplies = 0;
  let positiveReplies = 0;
  let activeLeads = 0;
  let meetingsBooked = 0;
  const activeCampaigns: any[] = [];
  let totalCampaigns = 0;
  let totalSends = 0;
  
  // New PlusVibe aggregated stats
  let plusvibeStats = {
    totalLeads: 0,
    contacted: 0,
    finished: 0,
    replied: 0,
    positive: 0,
    bounced: 0,
    openRate: 0,
  };
  
  const errors: string[] = [];

  // Per-campaign performance for analytics page
  const campaignPerformance: { name: string; sent: number; replies: number; positive: number; rate: number }[] = [];

  const plusvibeTask = (async () => {
    if (!pvKey || !pvWorkspace) return;

    try {
      const endDate = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const { campaigns } = await fetchCampaignsWithStats(companyId, {
        startDate,
        endDate,
      });
      const totals = summarizeCampaignStats(campaigns);

      totalCampaigns = campaigns.length;
      totalSends = totals.sent;
      totalReplies = totals.replies;
      positiveReplies = totals.positive;
      activeLeads = totals.contacted;

      plusvibeStats = {
        totalLeads: totals.leadCount,
        contacted: totals.contacted,
        finished: totals.completed,
        replied: totals.replies,
        positive: totals.positive,
        bounced: totals.bounced,
        openRate: Math.round(totals.openRate),
      };

      for (const campaign of campaigns) {
        if (campaign.status === "active") {
          activeCampaigns.push({
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            lastSent: campaign.last_lead_sent || campaign.lastSent || campaign.modifiedAt,
            lastReplied: campaign.last_lead_replied || campaign.lastReplied,
            createdAt: campaign.createdAt,
            sends: campaign.stats.sent,
            replyRate: campaign.stats.replyRate,
          });
        }

        if (campaign.stats.sent > 0) {
          campaignPerformance.push({
            name: campaign.name,
            sent: campaign.stats.sent,
            replies: campaign.stats.replies,
            positive: campaign.stats.positive,
            rate: campaign.stats.replyRate,
          });
        }
      }

      campaignPerformance.sort((a, b) => b.sent - a.sent);
    } catch (err: any) {
      console.error("Dashboard PlusVibe fetch error:", {
        companyId,
        workspaceId: pvWorkspace,
        error: err.message,
      });
      if (!errors.some((e) => e.includes("PlusVibe"))) {
        errors.push("PlusVibe data unavailable");
      }
    }
  })();

  const calendlyTask = (async () => {
    if (!calKey || !calUserUri) return;

    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const res = await fetchWithTimeout(
        `${CALENDLY_BASE}/scheduled_events?user=${calUserUri}&min_start_time=${weekAgo.toISOString()}&max_start_time=${now.toISOString()}&count=100`,
        {
          headers: {
            Authorization: `Bearer ${calKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) {
        const errorText = await res.text();
        if (res.status === 401) {
          errors.push("Calendly API key invalid");
        } else {
          errors.push(`Calendly API error: ${res.status}`);
        }
        throw new Error(
          `Calendly API error: ${res.status} ${res.statusText} - ${errorText
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 400)}`
        );
      }
      const data = await res.json();
      meetingsBooked = data.collection?.length || 0;
    } catch (err: any) {
      console.error("Dashboard Calendly fetch error:", {
        companyId,
        userUri: calUserUri,
        error: err.message,
      });
      if (!errors.some((e) => e.includes("Calendly"))) {
        errors.push("Calendly data unavailable");
      }
    }
  })();

  await Promise.all([plusvibeTask, calendlyTask]);

  return NextResponse.json({
    totalReplies,
    positiveReplies,
    activeLeads,
    meetingsBooked,
    activeCampaigns,
    totalCampaigns,
    totalSends,
    plusvibeStats,
    campaignPerformance: campaignPerformance.slice(0, 20),
    range,
    configured,
    errors: errors.length > 0 ? errors : undefined,
  });
}
