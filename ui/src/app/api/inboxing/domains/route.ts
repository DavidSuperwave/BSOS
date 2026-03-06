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
 * GET /api/inboxing/domains
 * List all managed domains
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = (page - 1) * limit;

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const accessResult = await requireCompanyAccess(companyId);
  if ("error" in accessResult) return accessResult.error;

  const admin = getAdmin();
  try {
    let query = admin
      .from("inboxing_domains")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    query = query.eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (search) query = query.ilike("domain", `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      domains: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch domains" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inboxing/domains
 * Create domains with inbox provisioning
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      company_id,
      domains: domainList,
      names,
      user_count = 49,
      tags = [],
      auto_upload = false,
      platform_connection_id,
      campaign_id,
      registrar_id,
      redirect_url,
      redirect_type = "NONE",
      cloudflare_credential_id,
    } = body;

    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }
    const accessResult = await requireCompanyAccess(company_id);
    if ("error" in accessResult) return accessResult.error;

    if (!domainList?.length || !names?.length) {
      return NextResponse.json(
        { error: "Missing required fields: domains, names" },
        { status: 400 }
      );
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
    const workflowResult = await runInboxingAutomationWorkflow(
      {
        companyId: company_id,
        domains: domainList,
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
        enforceSlots: false, // Keep backward compatibility for existing callers.
      },
      admin
    );

    return NextResponse.json(
      {
        results: workflowResult.results,
        workflow: workflowResult.workflow,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create domains" },
      { status: 500 }
    );
  }
}
