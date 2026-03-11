import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";

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

  try {
    const startDate = "2020-01-01";
    const endDate = "2030-12-31";
    const raw = await plusvibeFetch(
      `/analytics/campaign/stats?campaign_id=${encodeURIComponent(campaignId)}&start_date=${startDate}&end_date=${endDate}`,
      companyId,
      { method: "GET" }
    );

    const arr = Array.isArray(raw) ? raw : (typeof raw === "object" && raw !== null ? Object.values(raw) : []);
    const stats: any = arr[0] || {};

    const dailyStats: { date: string; newLead: number; followUp: number }[] = [];
    const dailyMetrics: { date: string; reply: number; replyWithOOO: number; positive: number; bounce: number }[] = [];
    const stepStats = (stats.steps || stats.sequences || []).map((s: any, i: number) => ({
      id: s.id || `step-${i + 1}`,
      title: s.title || s.name || `Step ${i + 1}`,
      sent: s.sent || s.emails_sent || s.sent_count || 0,
      replied: s.replied || s.replies || s.replied_count || 0,
      positive: s.positive || s.positive_replies || s.positive_reply_count || 0,
    }));

    // Totals from stats (Get campaign stats response shape)
    const sent = stats.sent_count ?? stats.sent ?? stats.emails_sent ?? stats.total_sent ?? 0;
    const contacted = stats.lead_contacted_count ?? stats.contacted ?? stats.leads_contacted ?? 0;
    const completed = stats.completed_lead_count ?? stats.completed ?? stats.leads_completed ?? 0;
    const replies = stats.replied_count ?? stats.replies ?? stats.total_replies ?? 0;
    const positive = stats.positive_reply_count ?? stats.positive ?? stats.positive_replies ?? 0;
    const bounced = stats.bounced_count ?? stats.bounced ?? stats.total_bounced ?? 0;
    const opened = stats.unique_opened_count ?? stats.opened ?? stats.total_opened ?? 0;
    const unsubscribed = stats.unsubscribed_count ?? stats.unsubscribed ?? 0;

    return NextResponse.json({
      dailyStats,
      dailyMetrics,
      stepStats,
      totals: {
        sent,
        contacted,
        completed,
        replyRate: sent > 0 ? Number(((replies / sent) * 100).toFixed(1)) : 0,
        positiveRate: sent > 0 ? Number(((positive / sent) * 100).toFixed(1)) : 0,
        bounceRate: sent > 0 ? Number(((bounced / sent) * 100).toFixed(1)) : 0,
        openRate: sent > 0 ? Number(((opened / sent) * 100).toFixed(1)) : 0,
        unsubscribeRate: sent > 0 ? Number(((unsubscribed / sent) * 100).toFixed(1)) : 0,
      },
    });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    console.error("[PlusVibe Analytics] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
