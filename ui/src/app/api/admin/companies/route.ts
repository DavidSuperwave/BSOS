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
 * GET /api/admin/companies
 * List all companies with health info. Platform owner only.
 */
export async function GET() {
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

  try {
    const { data: companies, error } = await db
      .from("companies")
      .select(`
        id,
        name,
        slug,
        status,
        agent_status,
        container_status,
        container_url,
        created_at,
        updated_at,
        onboarding_data
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Enrich with member counts and domain counts
    const companyIds = (companies || []).map((c: any) => c.id);

    const [{ data: agents }, { data: domains }] = await Promise.all([
      db
        .from("company_agents")
        .select("company_id, status")
        .in("company_id", companyIds.length > 0 ? companyIds : [""]),
      db
        .from("inboxing_domains")
        .select("company_id, health_score")
        .in("company_id", companyIds.length > 0 ? companyIds : [""]),
    ]);

    // Build lookup maps
    const agentsByCompany = new Map<string, { total: number; active: number }>();
    for (const a of (agents || []) as any[]) {
      const entry = agentsByCompany.get(a.company_id) || { total: 0, active: 0 };
      entry.total++;
      if (a.status === "active") entry.active++;
      agentsByCompany.set(a.company_id, entry);
    }

    const domainsByCompany = new Map<string, { total: number; avgHealth: number }>();
    for (const d of (domains || []) as any[]) {
      const entry = domainsByCompany.get(d.company_id) || { total: 0, avgHealth: 0 };
      entry.total++;
      entry.avgHealth =
        (entry.avgHealth * (entry.total - 1) + (d.health_score || 0)) / entry.total;
      domainsByCompany.set(d.company_id, entry);
    }

    const enriched = (companies || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      status: c.status,
      agentStatus: c.agent_status,
      containerStatus: c.container_status,
      containerUrl: c.container_url,
      industry: c.onboarding_data?.industry || null,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      agents: agentsByCompany.get(c.id) || { total: 0, active: 0 },
      domains: domainsByCompany.get(c.id) || { total: 0, avgHealth: 0 },
    }));

    return NextResponse.json({ companies: enriched });
  } catch (err: any) {
    console.error("[Admin Companies] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
