import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getProjectCredentials } from "@/lib/plusvibe-project";

const PLUSVIBE_API = "https://api.plusvibe.ai/api/v1";

function toCampaignArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.campaigns)) return payload.campaigns;
  if (Array.isArray(payload?.data?.campaigns)) return payload.data.campaigns;
  return [];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const companyId = req.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const creds = await getProjectCredentials(companyId);
  if (!creds) {
    return NextResponse.json({ error: "PlusVibe not configured" }, { status: 400 });
  }

  try {
    const headers = {
      "x-api-key": creds.apiKey,
      "Content-Type": "application/json",
    };

    const [statsByCampaignRes, allStatsRes, campaignDetailsRes, leadsRes] = await Promise.all([
      fetch(
        `${PLUSVIBE_API}/campaign/${campaignId}/stats?workspace_id=${encodeURIComponent(
          creds.workspaceId
        )}`,
        {
          headers,
          signal: AbortSignal.timeout(10000),
        }
      ),
      fetch(
        `${PLUSVIBE_API}/campaign/stats?workspace_id=${encodeURIComponent(creds.workspaceId)}`,
        {
          headers,
          signal: AbortSignal.timeout(10000),
        }
      ),
      fetch(
        `${PLUSVIBE_API}/campaign/list-all?workspace_id=${encodeURIComponent(
          creds.workspaceId
        )}&campaign_id=${encodeURIComponent(campaignId)}`,
        {
          headers,
          signal: AbortSignal.timeout(10000),
        }
      ),
      fetch(
        `${PLUSVIBE_API}/lead/workspace-leads?workspace_id=${encodeURIComponent(
          creds.workspaceId
        )}&campaign_id=${encodeURIComponent(campaignId)}&limit=500`,
        {
          headers,
          signal: AbortSignal.timeout(10000),
        }
      ),
    ]);

    let stats: any = {};
    if (statsByCampaignRes.ok) {
      stats = await statsByCampaignRes.json();
    } else if (allStatsRes.ok) {
      const allStatsPayload = await allStatsRes.json();
      const allStats = Array.isArray(allStatsPayload)
        ? allStatsPayload
        : Array.isArray(allStatsPayload?.value)
          ? allStatsPayload.value
          : Array.isArray(allStatsPayload?.data)
            ? allStatsPayload.data
            : [];
      stats =
        allStats.find((entry: any) => String(entry?._id || entry?.campaign_id || entry?.id) === campaignId) ||
        {};
    }

    const campaignDetailsPayload = campaignDetailsRes.ok ? await campaignDetailsRes.json() : {};
    const campaignDetails =
      toCampaignArray(campaignDetailsPayload).find(
        (entry: any) => String(entry?._id || entry?.id || entry?.campaign_id) === campaignId
      ) || null;
    const sequences = Array.isArray(campaignDetails?.sequences) ? campaignDetails.sequences : [];

    const leadsPayload = leadsRes.ok ? await leadsRes.json() : {};
    const leads = Array.isArray(leadsPayload?.value)
      ? leadsPayload.value
      : Array.isArray(leadsPayload?.data)
        ? leadsPayload.data
        : Array.isArray(leadsPayload)
          ? leadsPayload
          : [];

    const dailyStats = [] as Array<{ date: string; newLead: number; followUp: number }>;
    const dailyMetrics = [] as Array<{
      date: string;
      reply: number;
      replyWithOOO: number;
      positive: number;
      bounce: number;
    }>;

    const stepStats = sequences.map((step: any, i: number) => ({
      id: String(step?.id || `step-${i + 1}`),
      title: step?.name || `Step ${Number(step?.step || i + 1)}`,
      sent: 0,
      replied: 0,
      positive: 0,
    }));

    const sent = Number(stats.sent_count || stats.sent || stats.total_sent || 0);
    const contacted = Number(
      stats.lead_contacted_count || stats.contacted || stats.leads_contacted || 0
    );
    const completed = Number(stats.completed_lead_count || stats.completed || 0);
    const replies = Number(stats.replied_count || stats.replies || stats.total_replies || 0);
    const positive = Number(
      stats.positive_reply_count || stats.positive || stats.positive_replies || 0
    );
    const bounced = Number(stats.bounced_count || stats.bounced || stats.total_bounced || 0);
    const opened = Number(stats.unique_opened_count || stats.opened || stats.total_opened || 0);
    const unsubscribed = Number(stats.unsubscribed_count || stats.unsubscribed || 0);
    const totalLeads = Number(stats.lead_count || leads.length || 0);

    return NextResponse.json({
      dailyStats,
      dailyMetrics,
      stepStats,
      totals: {
        sent,
        contacted: contacted || Math.max(replies, 0),
        completed,
        replyRate: sent > 0 ? Number(((replies / sent) * 100).toFixed(1)) : 0,
        positiveRate: sent > 0 ? Number(((positive / sent) * 100).toFixed(1)) : 0,
        bounceRate: sent > 0 ? Number(((bounced / sent) * 100).toFixed(1)) : 0,
        openRate: sent > 0 ? Number(((opened / sent) * 100).toFixed(1)) : 0,
        unsubscribeRate: sent > 0 ? Number(((unsubscribed / sent) * 100).toFixed(1)) : 0,
        totalLeads,
      },
    });
  } catch (err: any) {
    console.error("[PlusVibe Analytics] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
