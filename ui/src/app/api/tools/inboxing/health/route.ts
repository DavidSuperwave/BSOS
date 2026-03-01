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
      .select("id, domain, status, health_score, dns_spf, dns_dkim, dns_dmarc, last_health_check")
      .eq("company_id", auth.companyId);

    if (error) throw error;

    const domains = data || [];
    const active = domains.filter((d) => d.status === "active");
    const avgHealth =
      active.length > 0
        ? Math.round(
            active.reduce((sum, d) => sum + (d.health_score || 0), 0) /
              active.length
          )
        : 0;

    const summary = {
      total: domains.length,
      active: active.length,
      healthy: active.filter((d) => (d.health_score || 0) >= 80).length,
      at_risk: active.filter(
        (d) => (d.health_score || 0) >= 50 && (d.health_score || 0) < 80
      ).length,
      burned: active.filter((d) => (d.health_score || 0) < 50).length,
      avg_health: avgHealth,
    };

    await logInvocation({
      companyId: auth.companyId,
      toolName: "inboxing/health",
      toolTier: "proxied",
      status: "success",
      durationMs: Date.now() - start,
      outputSummary: `${summary.total} domains, avg health ${summary.avg_health}`,
    });

    return NextResponse.json({ domains, summary });
  } catch (err: any) {
    await logInvocation({
      companyId: auth.companyId,
      toolName: "inboxing/health",
      toolTier: "proxied",
      status: "error",
      errorMessage: err.message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
