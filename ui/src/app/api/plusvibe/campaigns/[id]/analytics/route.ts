import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getProjectCredentials } from "@/lib/plusvibe-project";

const PLUSVIBE_API = "https://server.plusvibe.com/api/v1";

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
    // Fetch campaign stats and analytics from PlusVibe
    const [statsRes, analyticsRes] = await Promise.all([
      fetch(`${PLUSVIBE_API}/campaigns/${campaignId}/stats`, {
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${PLUSVIBE_API}/campaigns/${campaignId}/analytics`, {
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    let stats: any = {};
    let analytics: any = {};

    if (statsRes.ok) {
      stats = await statsRes.json();
    }

    if (analyticsRes.ok) {
      analytics = await analyticsRes.json();
    }

    // Build daily stats from analytics data
    const dailyStats = (analytics.daily || analytics.daily_stats || []).map(
      (d: any) => ({
        date: d.date,
        newLead: d.new_leads || d.new_lead || 0,
        followUp: d.follow_ups || d.follow_up || 0,
      })
    );

    // Build daily metrics
    const dailyMetrics = (analytics.daily || analytics.daily_stats || []).map(
      (d: any) => ({
        date: d.date,
        reply: d.replies || d.reply || 0,
        replyWithOOO: (d.replies || 0) + (d.ooo || 0),
        positive: d.positive || 0,
        bounce: d.bounced || d.bounce || 0,
      })
    );

    // Build step stats
    const stepStats = (analytics.steps || analytics.sequence_steps || stats.steps || []).map(
      (s: any, i: number) => ({
        id: s.id || `step-${i + 1}`,
        title: s.title || s.name || `Step ${i + 1}`,
        sent: s.sent || s.emails_sent || 0,
        replied: s.replied || s.replies || 0,
        positive: s.positive || s.positive_replies || 0,
      })
    );

    // Totals from stats
    const sent = stats.sent || stats.emails_sent || stats.total_sent || 0;
    const contacted = stats.contacted || stats.leads_contacted || 0;
    const completed = stats.completed || stats.leads_completed || 0;
    const replies = stats.replies || stats.total_replies || 0;
    const positive = stats.positive || stats.positive_replies || 0;
    const bounced = stats.bounced || stats.total_bounced || 0;
    const opened = stats.opened || stats.total_opened || 0;
    const unsubscribed = stats.unsubscribed || 0;

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
    console.error("[PlusVibe Analytics] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
