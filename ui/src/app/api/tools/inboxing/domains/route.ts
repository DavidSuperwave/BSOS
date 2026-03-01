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

  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from("inboxing_domains")
      .select("id, domain, status, mailbox_count, health_score, dns_spf, dns_dkim, dns_dmarc, created_at")
      .eq("company_id", auth.companyId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    await logInvocation({
      companyId: auth.companyId,
      toolName: "inboxing/domains",
      toolTier: "proxied",
      status: "success",
      durationMs: Date.now() - start,
      outputSummary: `${data?.length || 0} domains`,
    });

    return NextResponse.json({ domains: data || [] });
  } catch (err: any) {
    await logInvocation({
      companyId: auth.companyId,
      toolName: "inboxing/domains",
      toolTier: "proxied",
      status: "error",
      errorMessage: err.message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
