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

const updatableFields = new Set([
  "title",
  "content",
  "embedded_reports",
  "category",
  "status",
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
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    return NextResponse.json({ document: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch document" },
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
    const auth = await authenticateUser();

    const payload: Record<string, any> = {
      last_edited_by: auth?.userId || null,
    };
    for (const key of Object.keys(body || {})) {
      if (updatableFields.has(key)) payload[key] = body[key];
    }
    if (Object.keys(payload).length === 1 && payload.last_edited_by) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data, error } = await admin
      .from("documents")
      .update(payload)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ document: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update document" },
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
      .from("documents")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete document" },
      { status: 500 }
    );
  }
}
