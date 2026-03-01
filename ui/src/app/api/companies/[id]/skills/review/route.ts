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
  const { id: companyId } = await params;
  const auth = await requireCompanyAccess(companyId);
  if (auth.error) return auth.error;

  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from("skill_executions")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const reviewItems = (data || []).filter((row: any) => {
      const summary = String(row.output_summary || "").toLowerCase();
      return summary.includes("pending_review") || summary.includes("requires_review");
    });

    return NextResponse.json({ items: reviewItems });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch review queue" },
      { status: 500 }
    );
  }
}

