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
      .from("media_files")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }
    return NextResponse.json({ media: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch media" },
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
    const { data: media, error: readError } = await admin
      .from("media_files")
      .select("id, storage_path")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();
    if (readError || !media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    if (media.storage_path) {
      const { error: storageError } = await admin.storage
        .from("media")
        .remove([media.storage_path]);
      if (storageError) {
        return NextResponse.json(
          { error: storageError.message || "Failed to delete storage object" },
          { status: 500 }
        );
      }
    }

    const { error: deleteError } = await admin
      .from("media_files")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete media" },
      { status: 500 }
    );
  }
}
