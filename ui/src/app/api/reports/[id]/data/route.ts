import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

function resolveRangeStart(range: string | null): string | null {
  const now = new Date();
  if (range === "24h") {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "90d") {
    return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "7d" || !range) {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

function toDateKey(ts: string) {
  return new Date(ts).toISOString().slice(0, 10);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const companyId = req.nextUrl.searchParams.get("companyId");
  const range = req.nextUrl.searchParams.get("range");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const access = await requireCompanyAccess(companyId);
  if ("error" in access) return access.error;

  try {
    const admin = getAdmin();
    const { data: report, error: reportError } = await admin
      .from("reports")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();
    if (reportError || !report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const rangeStart = resolveRangeStart(range || report.query_config?.range || null);
    const dataSource = report.data_source as string;

    let data: any[] = [];

    if (dataSource === "campaigns") {
      let query = admin
        .from("inbox_messages")
        .select("campaign_id, campaign_name, sentiment, created_at")
        .eq("company_id", companyId);
      if (rangeStart) query = query.gte("created_at", rangeStart);
      const { data: rows, error } = await query;
      if (error) throw error;

      const byCampaign = new Map<string, any>();
      for (const row of rows || []) {
        const key = row.campaign_id || row.campaign_name || "unknown";
        const current = byCampaign.get(key) || {
          id: row.campaign_id || null,
          name: row.campaign_name || "Unknown campaign",
          replies: 0,
          positive: 0,
          neutral: 0,
          negative: 0,
        };
        current.replies += 1;
        if (row.sentiment === "positive") current.positive += 1;
        if (row.sentiment === "neutral") current.neutral += 1;
        if (row.sentiment === "negative") current.negative += 1;
        byCampaign.set(key, current);
      }
      data = Array.from(byCampaign.values());
    } else if (dataSource === "inbox") {
      let query = admin
        .from("inbox_messages")
        .select("sentiment, intent, created_at")
        .eq("company_id", companyId);
      if (rangeStart) query = query.gte("created_at", rangeStart);
      const { data: rows, error } = await query;
      if (error) throw error;

      const byDay = new Map<string, any>();
      for (const row of rows || []) {
        const day = toDateKey(row.created_at);
        const current = byDay.get(day) || {
          day,
          replies: 0,
          positive: 0,
          neutral: 0,
          negative: 0,
          interested: 0,
        };
        current.replies += 1;
        if (row.sentiment === "positive") current.positive += 1;
        if (row.sentiment === "neutral") current.neutral += 1;
        if (row.sentiment === "negative") current.negative += 1;
        if (row.intent === "interested") current.interested += 1;
        byDay.set(day, current);
      }
      data = Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
    } else if (dataSource === "pipeline") {
      let query = admin
        .from("pipeline_entries")
        .select("stage_id, value, created_at")
        .eq("company_id", companyId);
      if (rangeStart) query = query.gte("created_at", rangeStart);
      const { data: rows, error } = await query;
      if (error) throw error;

      const stageIds = Array.from(new Set((rows || []).map((row) => row.stage_id)));
      const { data: stages } = await admin
        .from("pipeline_stages")
        .select("id, name")
        .in("id", stageIds);
      const nameById = new Map((stages || []).map((s: any) => [s.id, s.name]));

      const byStage = new Map<string, any>();
      for (const row of rows || []) {
        const stageId = row.stage_id || "unknown";
        const current = byStage.get(stageId) || {
          stageId,
          stage: nameById.get(stageId) || "Unknown",
          count: 0,
          totalValue: 0,
        };
        current.count += 1;
        current.totalValue += Number(row.value || 0);
        byStage.set(stageId, current);
      }
      data = Array.from(byStage.values());
    } else if (dataSource === "events") {
      let query = admin
        .from("events")
        .select("event_type, priority, created_at")
        .eq("company_id", companyId);
      if (rangeStart) query = query.gte("created_at", rangeStart);
      const { data: rows, error } = await query;
      if (error) throw error;

      const byDay = new Map<string, any>();
      for (const row of rows || []) {
        const day = toDateKey(row.created_at);
        const current = byDay.get(day) || {
          day,
          total: 0,
          high: 0,
          medium: 0,
          low: 0,
        };
        current.total += 1;
        if (row.priority === "high" || row.priority === "urgent") current.high += 1;
        else if (row.priority === "low") current.low += 1;
        else current.medium += 1;
        byDay.set(day, current);
      }
      data = Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
    } else if (dataSource === "custom") {
      data = Array.isArray(report.query_config?.staticData)
        ? report.query_config.staticData
        : [];
    }

    return NextResponse.json({
      report,
      data,
      meta: {
        count: data.length,
        range: range || report.query_config?.range || "7d",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch report data" },
      { status: 500 }
    );
  }
}
