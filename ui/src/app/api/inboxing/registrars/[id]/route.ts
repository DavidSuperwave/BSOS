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
 * DELETE /api/inboxing/registrars/:id
 * Remove a registrar connection
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const admin = getAdmin();
    const { data: registrar, error: fetchError } = await admin
      .from("registrar_credentials")
      .select("id, company_id")
      .eq("id", id)
      .single();
    if (fetchError || !registrar) {
      return NextResponse.json({ error: "Registrar not found" }, { status: 404 });
    }
    const accessResult = await requireCompanyAccess(registrar.company_id);
    if ("error" in accessResult) return accessResult.error;

    const { error } = await admin
      .from("registrar_credentials")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete registrar" },
      { status: 500 }
    );
  }
}
