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

export async function POST(request: NextRequest) {
  const admin = getAdmin();
  const body = await request.json();
  const companyId = body.companyId as string | undefined;
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const accessResult = await requireCompanyAccess(companyId);
  if ("error" in accessResult) return accessResult.error;

  const { error } = await admin
    .from("inboxing_jobs")
    .delete()
    .eq("company_id", companyId)
    .eq("type", "upload");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
