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
    const { data: assignments, error } = await admin
      .from("inboxing_domain_assignments")
      .select(
        "id, inboxing_id, domain_name, assigned_at, inboxing_domains(id, domain, status, mailbox_count, health_score, dns_spf, dns_dkim, dns_dmarc, created_at)"
      )
      .eq("company_id", auth.companyId)
      .eq("status", "active")
      .order("assigned_at", { ascending: false });

    if (error) throw error;

    const domains = (assignments || []).map((assignment: any) => {
      const localDomain = Array.isArray(assignment.inboxing_domains)
        ? assignment.inboxing_domains[0]
        : assignment.inboxing_domains;

      return {
        id: String(assignment.inboxing_id),
        inboxing_id: String(assignment.inboxing_id),
        domain: assignment.domain_name || localDomain?.domain || null,
        status: localDomain?.status || "assigned",
        mailbox_count: localDomain?.mailbox_count ?? 0,
        health_score: localDomain?.health_score ?? 0,
        dns_spf: localDomain?.dns_spf ?? false,
        dns_dkim: localDomain?.dns_dkim ?? false,
        dns_dmarc: localDomain?.dns_dmarc ?? false,
        created_at: localDomain?.created_at || assignment.assigned_at,
        assigned_at: assignment.assigned_at,
      };
    });

    await logInvocation({
      companyId: auth.companyId,
      toolName: "inboxing/domains",
      toolTier: "proxied",
      status: "success",
      durationMs: Date.now() - start,
      outputSummary: `${domains.length} domains`,
    });

    return NextResponse.json({ domains });
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
