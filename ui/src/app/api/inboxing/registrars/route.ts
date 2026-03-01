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
 * GET /api/inboxing/registrars
 * List all registrar connections
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const accessResult = await requireCompanyAccess(companyId);
  if ("error" in accessResult) return accessResult.error;
  const admin = getAdmin();

  try {
    let query = admin
      .from("registrar_credentials")
      .select("id, company_id, provider, name, is_active, last_tested_at, status, created_at")
      .order("created_at", { ascending: false });

    query = query.eq("company_id", companyId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ registrars: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch registrars" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inboxing/registrars
 * Connect a new domain registrar
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { company_id, provider, name, api_key, api_secret } = body;

    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }
    const accessResult = await requireCompanyAccess(company_id);
    if ("error" in accessResult) return accessResult.error;

    if (!provider || !name || !api_key) {
      return NextResponse.json(
        { error: "Missing required fields: provider, name, api_key" },
        { status: 400 }
      );
    }

    // Also register with Inboxing API if configured
    let inboxingResult = null;
    try {
      inboxingResult = await inboxing.createRegistrar({
        registrar: provider,
        name,
        api_key,
        api_secret,
      });
    } catch (e: any) {
      console.warn("[Inboxing] Registrar sync failed:", e.message);
    }

    // Store in local DB
    const admin = getAdmin();
    const { data, error } = await admin
      .from("registrar_credentials")
      .insert({
        company_id,
        provider,
        name,
        api_key,
        api_secret,
        status: "connected",
        last_tested_at: new Date().toISOString(),
      })
      .select("id, company_id, provider, name, is_active, status, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json(
      { registrar: data, inboxing: inboxingResult },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create registrar" },
      { status: 500 }
    );
  }
}
