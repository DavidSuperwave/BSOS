import { NextRequest, NextResponse } from "next/server";
import { getCompanyCredentials } from "@/lib/company-credentials";
import { requireCompanyAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";
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

function parseCampaignList(rawData: any): any[] {
  if (Array.isArray(rawData)) return rawData;
  if (Array.isArray(rawData?.value)) return rawData.value;
  if (Array.isArray(rawData?.data)) return rawData.data;
  if (Array.isArray(rawData?.collection)) return rawData.collection;
  return [];
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
      const [campaignResult, statsResult] = await Promise.allSettled([
        fetchWithTimeout(
          `${PLUSVIBE_BASE}/campaign/list?workspace_id=${pvWorkspace}`,
          {
            headers: {
              "Content-Type": "application/json",
              "x-api-key": pvKey,
            },
          }
        ),
        fetchWithTimeout(
          `${PLUSVIBE_BASE}/campaign/stats?workspace_id=${pvWorkspace}&start_date=${startDate}&end_date=${endDate}`,
          {
            headers: {
              "Content-Type": "application/json",
              "x-api-key": pvKey,
            },
          }
        ),
      ]);

      if (campaignResult.status === "fulfilled" && campaignResult.value.ok) {
        const rawData = await campaignResult.value.json();
        const campaigns = parseCampaignList(rawData);

        totalCampaigns = campaigns.length;

        for (const c of campaigns) {
          // PlusVibe campaign list doesn't include stats, so we count by status
          const isActive = c.status === "ACTIVE" || c.status === "active";
          const hasReplied = !!c.last_lead_replied;
          const sendCount = c.sent_count || c.total_sent || 0;

          if (isActive) {
            activeCampaigns.push({
              id: c._id || c.id,
              name: c.name,
              status: c.status,
              lastSent: c.last_lead_sent,
              lastReplied: c.last_lead_replied,
              createdAt: c.created_at,
              sends: sendCount,
            });
          }

          // Aggregate total sends
          totalSends += typeof sendCount === "number" ? sendCount : 0;

          // Count campaigns with replies as proxy for reply count
          if (hasReplied) {
            totalReplies++;
          }
        }

        // Active leads = campaigns that have sent leads recently
        activeLeads = campaigns.filter((c: any) => c.last_lead_sent).length;
      } else if (campaignResult.status === "fulfilled") {
        const errorText = await campaignResult.value.text();
        if (
          campaignResult.value.status === 401 ||
          errorText.toLowerCase().includes("invalid")
        ) {
          errors.push("PlusVibe API key invalid - check integration_credentials");
        } else {
          errors.push(`PlusVibe API error: ${campaignResult.value.status}`);
        }
      } else if (!errors.some((e) => e.includes("PlusVibe"))) {
        errors.push("PlusVibe campaign API timeout/unreachable");
      }

      if (statsResult.status === "fulfilled" && statsResult.value.ok) {
        const statsData = await statsResult.value.json();

        if (Array.isArray(statsData)) {
          // Aggregate stats across all campaigns
          let totalLeads = 0;
          let totalContacted = 0;
          let totalFinished = 0;
          let totalRepliedCount = 0;
          let totalPositive = 0;
          let totalBounced = 0;
          let totalOpened = 0;
          let totalSent = 0;

          statsData.forEach((c: any) => {
            totalLeads += c.lead_count || 0;
            totalContacted += c.lead_contacted_count || 0;
            totalFinished += c.completed_lead_count || 0;
            totalRepliedCount += c.replied_count || 0;
            totalPositive += c.positive_reply_count || 0;
            totalBounced += c.bounced_count || 0;
            totalOpened += c.unique_opened_count || 0;
            totalSent += c.sent_count || 0;
          });

          plusvibeStats = {
            totalLeads,
            contacted: totalContacted,
            finished: totalFinished,
            replied: totalRepliedCount,
            positive: totalPositive,
            bounced: totalBounced,
            openRate:
              totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
          };

          // Update totals for backward compatibility
          totalReplies = totalRepliedCount;
          positiveReplies = totalPositive;

          // Build per-campaign performance
          for (const c of statsData) {
            const cSent = c.sent_count || 0;
            const cReplied = c.replied_count || 0;
            const cPositive = c.positive_reply_count || 0;
            if (cSent > 0) {
              campaignPerformance.push({
                name: c.campaign_name || c.name || c._id || "Unknown",
                sent: cSent,
                replies: cReplied,
                positive: cPositive,
                rate: parseFloat(((cReplied / cSent) * 100).toFixed(1)),
              });
            }
          }
          // Sort by sent count descending
          campaignPerformance.sort((a, b) => b.sent - a.sent);
        }
      } else if (
        statsResult.status === "fulfilled" &&
        !errors.some((e) => e.includes("PlusVibe API error"))
      ) {
        errors.push(`PlusVibe stats API error: ${statsResult.value.status}`);
      } else if (!errors.some((e) => e.includes("PlusVibe stats"))) {
        errors.push("PlusVibe stats API timeout/unreachable");
      }
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
