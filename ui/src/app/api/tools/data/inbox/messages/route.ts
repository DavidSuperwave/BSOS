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
  const sentiment = searchParams.get("sentiment");
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  try {
    const admin = getAdmin();
    let query = admin
      .from("inbox_messages")
      .select("id, campaign_id, campaign_name, from_email, from_name, subject, sentiment, intent, status, priority, ai_summary, created_at")
      .eq("company_id", auth.companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (sentiment) query = query.eq("sentiment", sentiment);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;

    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/inbox/messages",
      toolTier: "proxied",
      status: "success",
      durationMs: Date.now() - start,
      outputSummary: `${data?.length || 0} messages`,
    });

    return NextResponse.json({ messages: data || [] });
  } catch (err: any) {
    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/inbox/messages",
      toolTier: "proxied",
      status: "error",
      errorMessage: err.message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
