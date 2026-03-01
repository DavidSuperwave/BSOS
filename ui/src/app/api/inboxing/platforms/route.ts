import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * GET /api/inboxing/platforms
 * List platform connections (PlusVibe, Instantly, etc.)
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
      .from("platform_connections")
      .select("id, company_id, platform, name, verification_status, created_at")
      .order("created_at", { ascending: false });

    query = query.eq("company_id", companyId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ platforms: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch platforms" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inboxing/platforms
 * Connect a new email platform
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { company_id, platform, name, username, password, api_key, workspace_id } = body;

    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }
    const accessResult = await requireCompanyAccess(company_id);
    if ("error" in accessResult) return accessResult.error;

    if (!platform || !name) {
      return NextResponse.json(
        { error: "platform and name are required" },
        { status: 400 }
      );
    }

    const admin = getAdmin();
    const { data, error } = await admin
      .from("platform_connections")
      .insert({
        company_id,
        platform,
        name,
        username,
        password,
        api_key,
        workspace_id,
        verification_status: "pending",
      })
      .select("id, company_id, platform, name, verification_status, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ platform: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create platform connection" },
      { status: 500 }
    );
  }
}
