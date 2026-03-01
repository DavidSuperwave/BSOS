import { NextResponse } from "next/server";
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
 * GET /api/admin/metrics
 * Platform-level aggregated metrics. Requires platform owner role.
 */
export async function GET() {
  const auth = await authenticateUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdmin();

  // Verify platform owner: must have role "owner" on any account
  const { data: membership } = await db
    .from("account_members")
    .select("role")
    .eq("user_id", auth.userId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden — platform owner only" }, { status: 403 });
  }

  try {
    // Parallel queries for all metrics
    const [
      { count: totalCompanies },
      { count: activeCompanies },
      { count: totalUsers },
      { data: containerStatuses },
      { count: totalDomains },
      { count: healthyDomains },
      { count: totalSessions },
      { count: totalMessages },
      { data: recentTasks },
    ] = await Promise.all([
      db.from("companies").select("id", { count: "exact", head: true }),
      db
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      db.from("account_members").select("id", { count: "exact", head: true }),
      db.from("companies").select("id, name, slug, container_status, status, created_at"),
      db.from("inboxing_domains").select("id", { count: "exact", head: true }),
      db
        .from("inboxing_domains")
        .select("id", { count: "exact", head: true })
        .gte("health_score", 70),
      db.from("chat_sessions").select("id", { count: "exact", head: true }),
      db.from("chat_messages").select("id", { count: "exact", head: true }),
      db
        .from("agent_tasks")
        .select("id, status, agent_type, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // Container status breakdown
    const containerBreakdown: Record<string, number> = {};
    for (const c of (containerStatuses || []) as any[]) {
      const status = c.container_status || "unknown";
      containerBreakdown[status] = (containerBreakdown[status] || 0) + 1;
    }

    // Task status breakdown
    const taskBreakdown: Record<string, number> = {};
    for (const t of (recentTasks || []) as any[]) {
      taskBreakdown[t.status] = (taskBreakdown[t.status] || 0) + 1;
    }

    return NextResponse.json({
      overview: {
        totalCompanies: totalCompanies || 0,
        activeCompanies: activeCompanies || 0,
        totalUsers: totalUsers || 0,
        totalChatSessions: totalSessions || 0,
        totalChatMessages: totalMessages || 0,
      },
      containers: {
        breakdown: containerBreakdown,
        companies: (containerStatuses || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          containerStatus: c.container_status,
          status: c.status,
          createdAt: c.created_at,
        })),
      },
      domains: {
        total: totalDomains || 0,
        healthy: healthyDomains || 0,
      },
      tasks: {
        recentBreakdown: taskBreakdown,
        recent: recentTasks || [],
      },
    });
  } catch (err: any) {
    console.error("[Admin Metrics] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
