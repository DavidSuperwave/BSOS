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

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const companyId = searchParams.get("companyId");
  const pipelineId = searchParams.get("pipelineId");
  const stageId = searchParams.get("stageId");
  const search = (searchParams.get("search") || "").trim();

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const access = await requireCompanyAccess(companyId);
  if ("error" in access) return access.error;

  try {
    const admin = getAdmin();
    let query = admin
      .from("pipeline_entries")
      .select("*")
      .eq("company_id", companyId)
      .order("position", { ascending: true });

    if (pipelineId) query = query.eq("pipeline_id", pipelineId);
    if (stageId) query = query.eq("stage_id", stageId);
    if (search) query = query.ilike("title", `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ entries: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch pipeline entries" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      companyId,
      pipeline_id,
      stage_id,
      title,
      contact_name,
      contact_email,
      contact_company,
      source,
      source_id,
      value,
      priority,
      assigned_to,
      custom_fields,
      media,
      position,
    } = body || {};

    if (!companyId || !pipeline_id || !stage_id || !title) {
      return NextResponse.json(
        { error: "companyId, pipeline_id, stage_id, and title are required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if ("error" in access) return access.error;

    const admin = getAdmin();
    const { data, error } = await admin
      .from("pipeline_entries")
      .insert({
        company_id: companyId,
        pipeline_id,
        stage_id,
        title,
        contact_name: contact_name || null,
        contact_email: contact_email || null,
        contact_company: contact_company || null,
        source: source || "manual",
        source_id: source_id || null,
        value: typeof value === "number" ? value : null,
        priority: priority || "medium",
        assigned_to: assigned_to || null,
        custom_fields: custom_fields || {},
        media: Array.isArray(media) ? media : [],
        position: typeof position === "number" ? position : 0,
      })
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ entry: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create pipeline entry" },
      { status: 500 }
    );
  }
}
