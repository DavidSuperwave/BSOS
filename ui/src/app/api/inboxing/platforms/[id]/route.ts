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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = getAdmin();

  const { data: row, error } = await admin
    .from("platform_connections")
    .select("id, company_id")
    .eq("id", id)
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const accessResult = await requireCompanyAccess(row.company_id);
  if ("error" in accessResult) return accessResult.error;

  const { error: deleteError } = await admin
    .from("platform_connections")
    .delete()
    .eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
