import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateAgentRequest } from "@/lib/agent-auth";
import { logInvocation } from "@/lib/tool-logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const auth = await validateAgentRequest(req);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  try {
    const admin = getAdmin();
    let query = admin
      .from("knowledge_documents")
      .select("id, title, content, category, metadata, created_at, updated_at")
      .eq("company_id", auth.companyId)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) throw error;

    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/knowledge",
      toolTier: "proxied",
      status: "success",
      durationMs: Date.now() - start,
      outputSummary: `${data?.length || 0} documents`,
    });

    return NextResponse.json({ documents: data || [] });
  } catch (err: any) {
    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/knowledge",
      toolTier: "proxied",
      status: "error",
      errorMessage: err.message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
