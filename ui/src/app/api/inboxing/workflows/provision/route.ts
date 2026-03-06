import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { runInboxingAutomationWorkflow } from "@/lib/inboxing-automation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * POST /api/inboxing/workflows/provision
 * Orchestrated provisioning flow:
 * domain creation -> nameserver automation -> mailbox provisioning ->
 * optional platform upload + sequencer-ready metadata tracking.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      company_id,
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
      enforce_slots = true,
      notes,
    } = body;

    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    const accessResult = await requireCompanyAccess(company_id);
    if ("error" in accessResult) return accessResult.error;

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
        .eq("company_id", company_id)
        .single();

      if (!platform) {
        return NextResponse.json({ error: "Platform connection not found" }, { status: 404 });
      }
    }

    const result = await runInboxingAutomationWorkflow(
      {
        companyId: company_id,
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
        requestedBy: accessResult.auth.userId,
        createAssignments: true,
        enforceSlots: Boolean(enforce_slots),
        notes,
      },
      admin
    );

    return NextResponse.json(
      {
        success: true,
        workflow: result.workflow,
        results: result.results,
      },
      { status: 201 }
    );
  } catch (error: any) {
    const message = error?.message || "Failed to run inboxing provisioning workflow";
    const isSlotError = String(message).toLowerCase().includes("no available slots");
    return NextResponse.json(
      {
        error: message,
        code: isSlotError ? "NO_SLOTS_AVAILABLE" : "WORKFLOW_FAILED",
      },
      { status: isSlotError ? 403 : 500 }
    );
  }
}
