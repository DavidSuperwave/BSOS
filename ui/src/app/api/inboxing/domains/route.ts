import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as inboxing from "@/lib/inboxing-client";
import { requireCompanyAccess } from "@/lib/api-auth";

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
    const results = [];

    for (const domainName of domainList) {
      // Create via Inboxing API
      let inboxingResult = null;
      try {
        inboxingResult = await inboxing.createDomain({
          domain: domainName,
          names,
          user_count,
          redirect_url,
          redirect_type,
          tags,
          upload_to_platform: auto_upload,
          platform_connection_id: platform_connection_id || undefined,
          cloudflare_credential_id: cloudflare_credential_id || undefined,
          registrar_credential_id: registrar_id || undefined,
        });
      } catch (e: any) {
        console.error(`[Inboxing] Failed to create ${domainName}:`, e.message);
      }

      // Store in local DB
      const { data, error } = await admin
        .from("inboxing_domains")
        .insert({
          company_id,
          domain: domainName,
          status: inboxingResult?.status || "pending",
          inboxing_id: inboxingResult?.id,
          registrar_id,
          platform_connection_id,
          user_count,
          mailbox_count: inboxingResult?.mailbox_count || 0,
          tags,
          campaign_id,
          redirect_url,
          redirect_type,
          cloudflare_id: cloudflare_credential_id || null,
          nameservers: inboxingResult?.nameservers || [],
          csv_available_at: inboxingResult?.csv_available_at || null,
        })
        .select()
        .single();

      if (error) {
        console.error(`[DB] Failed to store ${domainName}:`, error.message);
        results.push({ domain: domainName, status: "error", error: error.message });
        continue;
      }

      // Create tracking job
      await admin.from("inboxing_jobs").insert({
        company_id,
        domain_id: data.id,
        type: "domain_create",
        status: "processing",
        payload: { domain: domainName, user_count, names, auto_upload },
      });

      results.push({
        domain: domainName,
        status: inboxingResult?.status || "pending",
        id: data.id,
        inboxing_id: inboxingResult?.id,
      });
    }

    return NextResponse.json({ results }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create domains" },
      { status: 500 }
    );
  }
}
