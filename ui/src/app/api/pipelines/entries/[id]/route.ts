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

const updatableFields = new Set([
  "pipeline_id",
  "stage_id",
  "title",
  "contact_name",
  "contact_email",
  "contact_company",
  "source",
  "source_id",
  "value",
  "priority",
  "assigned_to",
  "custom_fields",
  "media",
  "position",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const companyId = req.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const access = await requireCompanyAccess(companyId);
  if ("error" in access) return access.error;

  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from("pipeline_entries")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (error) {
      return NextResponse.json({ error: "Pipeline entry not found" }, { status: 404 });
    }

    return NextResponse.json({ entry: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch pipeline entry" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await req.json();
    const companyId = body?.companyId;
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const access = await requireCompanyAccess(companyId);
    if ("error" in access) return access.error;

    const updatePayload: Record<string, any> = {};
    for (const key of Object.keys(body || {})) {
      if (updatableFields.has(key)) {
        updatePayload[key] = body[key];
      }
    }
    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }
    if ("stage_id" in updatePayload) {
      updatePayload.moved_at = new Date().toISOString();
    }

    const admin = getAdmin();
    const { data, error } = await admin
      .from("pipeline_entries")
      .update(updatePayload)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ entry: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update pipeline entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const companyId =
    req.nextUrl.searchParams.get("companyId") ||
    (await req.json().catch(() => ({})))?.companyId;

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const access = await requireCompanyAccess(companyId);
  if ("error" in access) return access.error;

  try {
    const admin = getAdmin();
    const { error } = await admin
      .from("pipeline_entries")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete pipeline entry" },
      { status: 500 }
    );
  }
}
