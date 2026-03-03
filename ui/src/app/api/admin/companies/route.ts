import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/api-auth";
import { deleteAgent } from "@/lib/openclaw-client";
import { sshExec } from "@/lib/ssh";
import { releaseSupermemoryKeyForCompany } from "@/lib/supermemory-key-pool";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!admin) admin = createClient(supabaseUrl, supabaseServiceKey);
  return admin;
}

async function assertPlatformOwner() {
  const auth = await authenticateUser();
  if (!auth) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
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
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, auth };
}

async function decommissionCompanyResources(
  db: ReturnType<typeof createClient>,
  companyId: string,
  options?: {
    disableCompany?: boolean;
    releaseSupermemoryKey?: boolean;
  }
) {
  const { data: company, error: companyError } = await db
    .from("companies")
    .select("id, slug, status, container_name, container_status, agent_config, integration_credentials")
    .eq("id", companyId)
    .single();
  if (companyError || !company) {
    throw companyError || new Error("Company not found");
  }

  const warnings: string[] = [];
  let openclawDeleted = false;
  let containerRemoved = false;
  const agentId = (company.agent_config as Record<string, any> | null)?.agent_id;

  if (agentId) {
    try {
      await deleteAgent(agentId, true);
      openclawDeleted = true;
    } catch (err: any) {
      warnings.push(`Failed to delete OpenClaw agent ${agentId}: ${err?.message || "unknown error"}`);
    }
  }

  const containerName =
    company.container_name || (company.slug ? `openclaw-${company.slug}` : null);
  const socatSvcName = containerName ? `socat-${containerName}` : null;
  const remotePath = company.slug ? `/opt/openclaw/${company.slug}` : null;
  if (containerName && remotePath && company.container_status !== "none") {
    try {
      await sshExec([
        `systemctl stop ${socatSvcName}.service 2>/dev/null || true`,
        `systemctl disable ${socatSvcName}.service 2>/dev/null || true`,
        `rm -f /etc/systemd/system/${socatSvcName}.service`,
        `systemctl daemon-reload`,
      ]);
      await sshExec([
        `cd ${remotePath} 2>/dev/null || true`,
        `docker compose down -v 2>/dev/null || true`,
        `docker rm -f ${containerName} 2>/dev/null || true`,
        `rm -rf ${remotePath} 2>/dev/null || true`,
      ]);
      containerRemoved = true;
    } catch (err: any) {
      warnings.push(`Failed to remove container resources for ${containerName}: ${err?.message || "unknown error"}`);
    }
  }

  const integrationCredentials =
    ((company.integration_credentials as Record<string, any> | null) || {}) as Record<
      string,
      any
    >;
  if (options?.releaseSupermemoryKey) {
    try {
      await releaseSupermemoryKeyForCompany(db, companyId);
      delete integrationCredentials.supermemory_api_key;
    } catch (err: any) {
      warnings.push(`Failed to release Supermemory key assignment: ${err?.message || "unknown error"}`);
    }
  }

  const updates: Record<string, any> = {
    agent_config: null,
    agent_status: options?.disableCompany ? "disabled" : "inactive",
    container_status: "none",
    container_name: null,
    container_port: null,
    container_url: null,
    provisioned_at: null,
    integration_credentials: integrationCredentials,
  };
  if (options?.disableCompany) {
    updates.status = "inactive";
  }

  const { error: updateError } = await db
    .from("companies")
    .update(updates)
    .eq("id", companyId);
  if (updateError) {
    throw updateError;
  }

  return {
    companyId,
    openclawDeleted,
    containerRemoved,
    warnings,
  };
}

/**
 * GET /api/admin/companies
 * List all companies with health info. Platform owner only.
 */
export async function GET() {
  const guard = await assertPlatformOwner();
  if (!guard.ok) return guard.response;
  const db = getAdmin();

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

/**
 * PATCH /api/admin/companies
 * Company lifecycle actions:
 * - disable_and_decommission
 * - decommission_only
 * - enable_company
 */
export async function PATCH(req: NextRequest) {
  const guard = await assertPlatformOwner();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const db = getAdmin();

    if (action === "disable_and_decommission") {
      const result = await decommissionCompanyResources(db, companyId, {
        disableCompany: true,
      });
      return NextResponse.json({ success: true, result });
    }

    if (action === "decommission_only") {
      const result = await decommissionCompanyResources(db, companyId, {
        disableCompany: false,
      });
      return NextResponse.json({ success: true, result });
    }

    if (action === "enable_company") {
      const { error } = await db
        .from("companies")
        .update({
          status: "active",
          agent_status: "inactive",
        })
        .eq("id", companyId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Invalid action. Use disable_and_decommission, decommission_only, or enable_company." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[Admin Companies] PATCH error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to process company action" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/companies
 * Full reset utility: keeps one admin email and removes other users + company data.
 */
export async function POST(req: NextRequest) {
  const guard = await assertPlatformOwner();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json();
    const confirmToken = typeof body.confirmToken === "string" ? body.confirmToken : "";
    const preserveEmail = typeof body.preserveEmail === "string" ? body.preserveEmail : "";
    if (confirmToken !== "RESET_SINGLE_ADMIN_MODE") {
      return NextResponse.json(
        { error: "Invalid confirmToken" },
        { status: 400 }
      );
    }
    if (!preserveEmail) {
      return NextResponse.json(
        { error: "preserveEmail is required" },
        { status: 400 }
      );
    }

    const db = getAdmin();
    const listResult = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listResult.error) throw listResult.error;

    const users = listResult.data?.users || [];
    const preservedUser = users.find(
      (u) => (u.email || "").toLowerCase() === preserveEmail.toLowerCase()
    );
    if (!preservedUser) {
      return NextResponse.json(
        { error: `Preserve user not found: ${preserveEmail}` },
        { status: 404 }
      );
    }

    // Decommission all companies before deletion to stop remote resources.
    const { data: companies } = await db
      .from("companies")
      .select("id");
    const companyIds = (companies || []).map((row: any) => row.id as string);
    const decommissionResults: Array<Record<string, any>> = [];
    for (const companyId of companyIds) {
      try {
        const result = await decommissionCompanyResources(db, companyId, {
          disableCompany: false,
          releaseSupermemoryKey: true,
        });
        decommissionResults.push(result);
      } catch (err: any) {
        decommissionResults.push({
          companyId,
          error: err?.message || "Failed to decommission",
        });
      }
    }

    // Remove all companies (cascades to most tenant-scoped data).
    const { error: deleteCompaniesError } = await db
      .from("companies")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteCompaniesError) throw deleteCompaniesError;

    // Keep membership only for preserved user.
    await db
      .from("account_members")
      .delete()
      .neq("user_id", preservedUser.id);

    // Optional cleanup for profile rows (table may not exist on older schemas).
    try {
      await db
        .from("profiles")
        .delete()
        .neq("id", preservedUser.id);
    } catch {
      // Non-blocking.
    }

    // Remove non-preserved auth users.
    let deletedUsers = 0;
    for (const user of users) {
      if (user.id === preservedUser.id) continue;
      const deleteResult = await db.auth.admin.deleteUser(user.id);
      if (!deleteResult.error) deletedUsers++;
    }

    return NextResponse.json({
      success: true,
      preservedEmail: preservedUser.email,
      deletedUsers,
      decommissionResults,
    });
  } catch (err: any) {
    console.error("[Admin Companies] POST reset error:", err);
    return NextResponse.json(
      { error: err?.message || "Reset failed" },
      { status: 500 }
    );
  }
}
