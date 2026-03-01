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
  const companyId = req.nextUrl.searchParams.get("companyId");
  const context = req.nextUrl.searchParams.get("context");
  const contextId = req.nextUrl.searchParams.get("contextId");
  const fileType = req.nextUrl.searchParams.get("fileType");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const access = await requireCompanyAccess(companyId);
  if ("error" in access) return access.error;

  try {
    const admin = getAdmin();
    let query = admin
      .from("media_files")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (context) query = query.eq("context", context);
    if (contextId) query = query.eq("context_id", contextId);
    if (fileType) query = query.eq("file_type", fileType);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ media: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch media list" },
      { status: 500 }
    );
  }
}
