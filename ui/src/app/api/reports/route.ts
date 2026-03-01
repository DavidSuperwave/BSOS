import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser, requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const pinned = req.nextUrl.searchParams.get("pinned");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const access = await requireCompanyAccess(companyId);
  if ("error" in access) return access.error;

  try {
    const admin = getAdmin();
    let query = admin
      .from("reports")
      .select("*")
      .eq("company_id", companyId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });

    if (pinned === "true") query = query.eq("pinned", true);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ reports: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch reports" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      companyId,
      title,
      description,
      chart_type,
      data_source,
      query_config,
      chart_config,
      pinned,
    } = body || {};

    if (!companyId || !title || !chart_type || !data_source) {
      return NextResponse.json(
        { error: "companyId, title, chart_type, and data_source are required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if ("error" in access) return access.error;
    const auth = await authenticateUser();

    const admin = getAdmin();
    const { data, error } = await admin
      .from("reports")
      .insert({
        company_id: companyId,
        title,
        description: description || null,
        chart_type,
        data_source,
        query_config: query_config || {},
        chart_config: chart_config || {},
        pinned: Boolean(pinned),
        created_by: auth?.userId || null,
      })
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ report: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create report" },
      { status: 500 }
    );
  }
}
