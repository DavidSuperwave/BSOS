import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!admin) admin = createClient(supabaseUrl, supabaseServiceKey);
  return admin;
}

/**
 * GET /api/admin/usage?days=7
 * Token usage aggregation by company. Platform owner only.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdmin();

  const { data: membership } = await db
    .from("account_members")
    .select("role")
    .eq("user_id", auth.userId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get("days") || "7", 10), 90);

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const since = sinceDate.toISOString();

  try {
    // Message counts per company in the period
    const { data: messageCounts } = await db
      .from("chat_messages")
      .select("company_id, role")
      .gte("created_at", since);

    // Session counts per company
    const { data: sessionCounts } = await db
      .from("chat_sessions")
      .select("company_id")
      .gte("created_at", since);

    // Task counts per company
    const { data: taskCounts } = await db
      .from("agent_tasks")
      .select("company_id, status")
      .gte("created_at", since);

    // Aggregate by company
    const companyUsage = new Map<
      string,
      {
        messages: number;
        userMessages: number;
        assistantMessages: number;
        sessions: number;
        tasks: number;
        failedTasks: number;
      }
    >();

    const getEntry = (companyId: string) => {
      if (!companyUsage.has(companyId)) {
        companyUsage.set(companyId, {
          messages: 0,
          userMessages: 0,
          assistantMessages: 0,
          sessions: 0,
          tasks: 0,
          failedTasks: 0,
        });
      }
      return companyUsage.get(companyId)!;
    };

    for (const msg of (messageCounts || []) as any[]) {
      if (!msg.company_id) continue;
      const entry = getEntry(msg.company_id);
      entry.messages++;
      if (msg.role === "user") entry.userMessages++;
      if (msg.role === "assistant") entry.assistantMessages++;
    }

    for (const sess of (sessionCounts || []) as any[]) {
      if (!sess.company_id) continue;
      getEntry(sess.company_id).sessions++;
    }

    for (const task of (taskCounts || []) as any[]) {
      if (!task.company_id) continue;
      const entry = getEntry(task.company_id);
      entry.tasks++;
      if (task.status === "failed") entry.failedTasks++;
    }

    // Get company names
    const companyIds = Array.from(companyUsage.keys());
    const { data: companies } = await db
      .from("companies")
      .select("id, name, slug")
      .in("id", companyIds.length > 0 ? companyIds : [""]);

    const nameMap = new Map(
      (companies || []).map((c: any) => [c.id, { name: c.name, slug: c.slug }])
    );

    const usage = Array.from(companyUsage.entries())
      .map(([companyId, stats]) => ({
        companyId,
        companyName: nameMap.get(companyId)?.name || "Unknown",
        companySlug: nameMap.get(companyId)?.slug || "",
        ...stats,
      }))
      .sort((a, b) => b.messages - a.messages);

    // Totals
    const totals = {
      messages: usage.reduce((s, u) => s + u.messages, 0),
      sessions: usage.reduce((s, u) => s + u.sessions, 0),
      tasks: usage.reduce((s, u) => s + u.tasks, 0),
      failedTasks: usage.reduce((s, u) => s + u.failedTasks, 0),
      activeCompanies: usage.length,
    };

    return NextResponse.json({
      period: { days, since },
      totals,
      byCompany: usage,
    });
  } catch (err: any) {
    console.error("[Admin Usage] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
