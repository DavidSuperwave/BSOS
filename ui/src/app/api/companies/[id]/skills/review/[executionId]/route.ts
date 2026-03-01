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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; executionId: string }> }
) {
  const { id: companyId, executionId } = await params;
  const auth = await requireCompanyAccess(companyId);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const action = String(body.action || "").toLowerCase();
    const reviewerNote = String(body.note || "").trim();

    if (!["approve", "reject", "modify"].includes(action)) {
      return NextResponse.json(
        { error: "action must be approve, reject, or modify" },
        { status: 400 }
      );
    }

    const admin = getAdmin();
    const { data: existing, error: existingError } = await admin
      .from("skill_executions")
      .select("output_summary")
      .eq("id", executionId)
      .eq("company_id", companyId)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }

    const nextSummary = [
      String(existing.output_summary || ""),
      "",
      `review_status=${action}`,
      reviewerNote ? `review_note=${reviewerNote}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { error } = await admin
      .from("skill_executions")
      .update({
        output_summary: nextSummary,
      })
      .eq("id", executionId)
      .eq("company_id", companyId);

    if (error) throw error;

    return NextResponse.json({ success: true, executionId, action });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update review status" },
      { status: 500 }
    );
  }
}

