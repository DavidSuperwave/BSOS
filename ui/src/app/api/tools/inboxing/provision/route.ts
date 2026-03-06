import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateAgentRequest } from "@/lib/agent-auth";
import { logInvocation } from "@/lib/tool-logger";
import { runInboxingAutomationWorkflow } from "@/lib/inboxing-automation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * POST /api/tools/inboxing/provision
 * Agent-scoped automated domain provisioning.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const auth = await validateAgentRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      domains,
      names,
      user_count = 49,
      tags = [],
      redirect_url,
      redirect_type = "NONE",
      auto_upload = false,
      platform_connection_id,
      registrar_id,
      campaign_id,
      cloudflare_credential_id,
      notes,
    } = body || {};

    if (!Array.isArray(domains) || domains.length === 0) {
      return NextResponse.json({ error: "domains array is required" }, { status: 400 });
    }
    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: "names array is required" }, { status: 400 });
    }

    const admin = getAdmin();
    if (platform_connection_id) {
      const { data: platform } = await admin
        .from("platform_connections")
        .select("id")
        .eq("id", platform_connection_id)
        .eq("company_id", auth.companyId)
        .single();

      if (!platform) {
        return NextResponse.json({ error: "Platform connection not found" }, { status: 404 });
      }
    }

    const result = await runInboxingAutomationWorkflow(
      {
        companyId: auth.companyId,
        domains,
        names,
        userCount: user_count,
        tags,
        redirectUrl: redirect_url,
        redirectType: redirect_type,
        autoUpload: auto_upload,
        platformConnectionId: platform_connection_id,
        registrarId: registrar_id,
        campaignId: campaign_id,
        cloudflareCredentialId: cloudflare_credential_id,
        createAssignments: true,
        enforceSlots: true,
        notes,
      },
      admin
    );

    await logInvocation({
      companyId: auth.companyId,
      toolName: "inboxing/provision",
      toolTier: "proxied",
      status: "success",
      durationMs: Date.now() - startedAt,
      outputSummary: `${result.workflow.succeeded}/${result.workflow.requested} domains provisioned`,
    });

    return NextResponse.json({
      success: true,
      workflow: result.workflow,
      results: result.results,
    });
  } catch (error: any) {
    const message = error?.message || "Failed to provision domains";
    const isSlotError = String(message).toLowerCase().includes("no available slots");

    await logInvocation({
      companyId: auth.companyId,
      toolName: "inboxing/provision",
      toolTier: "proxied",
      status: "error",
      errorMessage: message,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        error: message,
        code: isSlotError ? "NO_SLOTS_AVAILABLE" : "PROVISION_FAILED",
      },
      { status: isSlotError ? 403 : 500 }
    );
  }
}
