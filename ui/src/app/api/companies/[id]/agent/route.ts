import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAgentStatus,
  updateAgent,
  deleteAgent,
  listAgents,
  setAgentFile,
} from "@/lib/openclaw-client";
import { generateWorkspace } from "@/lib/agent-provisioning";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const limiter = createRateLimiter({ limit: 30, window: 60 });

/**
 * GET /api/companies/[id]/agent
 * Returns agent status, config, and health info.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const result = await requireCompanyAccess(id);
  if (result.error) return result.error;

  try {
    const admin = getAdmin();
    const { data: company, error } = await admin
      .from("companies")
      .select("name, slug, agent_status, agent_config, integration_credentials, settings")
      .eq("id", id)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const agentConfig = company.agent_config as Record<string, any> | null;
    if (!agentConfig?.agent_id) {
      return NextResponse.json({
        status: "not_deployed",
        agent_id: null,
        healthy: false,
      });
    }

    // Check OpenClaw gateway health
    const health = await getAgentStatus(agentConfig.agent_id);

    // Check if agent exists in OpenClaw
    let openclawRegistered = false;
    try {
      const agents = await listAgents();
      openclawRegistered = Array.isArray(agents)
        ? agents.some((a: any) => a.name === agentConfig.agent_id || a.id === agentConfig.agent_id)
        : false;
    } catch {
      // OpenClaw unreachable
    }

    return NextResponse.json({
      status: company.agent_status,
      agent_id: agentConfig.agent_id,
      container_tag: agentConfig.container_tag,
      model: agentConfig.model,
      compaction_strategy: agentConfig.compaction_strategy,
      healthy: health.healthy,
      openclaw_registered: openclawRegistered,
      integrations: {
        plusvibe: !!(company.integration_credentials as any)?.plusvibe_api_key,
        calendly: !!(company.integration_credentials as any)?.calendly_api_key,
        close: !!(company.integration_credentials as any)?.close_api_key,
      },
      settings: company.settings || {},
    });
  } catch (err: any) {
    console.error("[Agent API] GET error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to get agent status" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/companies/[id]/agent
 * Update agent configuration (model, tools, settings).
 * Pushes changes to OpenClaw via RPC if available.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const result = await requireCompanyAccess(id);
  if (result.error) return result.error;

  try {
    const admin = getAdmin();
    const body = await req.json();
    const { model, settings, regenerate_workspace } = body;

    const { data: company, error } = await admin
      .from("companies")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const agentConfig = (company.agent_config as Record<string, any>) || {};
    if (!agentConfig.agent_id) {
      return NextResponse.json(
        { error: "Agent not deployed. Deploy first via /deploy-agent." },
        { status: 400 }
      );
    }

    // Update model in config
    if (model) {
      agentConfig.model = model;
    }

    // Merge company settings (auto_analyze, etc.)
    const updatedSettings = {
      ...((company.settings as Record<string, any>) || {}),
      ...(settings || {}),
    };

    // Persist to Supabase
    const { error: updateError } = await admin
      .from("companies")
      .update({
        agent_config: agentConfig,
        settings: updatedSettings,
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // Push changes to OpenClaw
    let openclawUpdated = false;
    try {
      if (model) {
        await updateAgent({ agentId: agentConfig.agent_id, model });
      }

      // Regenerate and push workspace files if requested
      if (regenerate_workspace) {
        const workspace = generateWorkspace({
          id: company.id,
          name: company.name,
          slug: company.slug,
          onboarding_data: company.onboarding_data || {},
        });

        await Promise.all([
          setAgentFile(agentConfig.agent_id, "AGENTS.md", workspace.agentsMd),
          setAgentFile(agentConfig.agent_id, "SOUL.md", workspace.soulMd),
          setAgentFile(agentConfig.agent_id, "TOOLS.md", workspace.toolsMd),
        ]);
      }

      openclawUpdated = true;
    } catch (err) {
      console.warn("[Agent API] OpenClaw RPC unavailable:", err);
    }

    return NextResponse.json({
      success: true,
      agent_id: agentConfig.agent_id,
      model: agentConfig.model,
      settings: updatedSettings,
      openclaw_updated: openclawUpdated,
    });
  } catch (err: any) {
    console.error("[Agent API] PATCH error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update agent" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/companies/[id]/agent
 * Decommission agent — removes from OpenClaw, clears config.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const result = await requireCompanyAccess(id);
  if (result.error) return result.error;

  try {
    const admin = getAdmin();
    const { data: company, error } = await admin
      .from("companies")
      .select("agent_config, agent_status")
      .eq("id", id)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const agentConfig = company.agent_config as Record<string, any> | null;
    if (!agentConfig?.agent_id) {
      return NextResponse.json({ error: "No agent deployed" }, { status: 400 });
    }

    // Remove from OpenClaw
    let openclawDeleted = false;
    try {
      await deleteAgent(agentConfig.agent_id, true);
      openclawDeleted = true;
    } catch (err) {
      console.warn("[Agent API] OpenClaw delete failed:", err);
    }

    // Clear agent config in Supabase
    await admin
      .from("companies")
      .update({
        agent_config: null,
        agent_status: "inactive",
      })
      .eq("id", id);

    return NextResponse.json({
      success: true,
      openclaw_deleted: openclawDeleted,
    });
  } catch (err: any) {
    console.error("[Agent API] DELETE error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete agent" },
      { status: 500 }
    );
  }
}
