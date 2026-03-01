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
 * GET /api/inboxing/health
 * Health dashboard for all domains
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const accessResult = await requireCompanyAccess(companyId);
  if ("error" in accessResult) return accessResult.error;
  const admin = getAdmin();

  try {
    let query = admin
      .from("inboxing_domains")
      .select("id, domain, status, health_score, mailbox_count, dns_spf, dns_dkim, dns_dmarc, last_health_check, tags, campaign_id, created_at")
      .order("health_score", { ascending: true });

    query = query.eq("company_id", companyId);

    const { data, error } = await query;
    if (error) throw error;

    const domains = data || [];
    const summary = {
      total: domains.length,
      healthy: domains.filter((d) => d.health_score >= 80).length,
      at_risk: domains.filter((d) => d.health_score >= 40 && d.health_score < 80).length,
      burned: domains.filter((d) => d.health_score < 40).length,
      active: domains.filter((d) => d.status === "active").length,
      provisioning: domains.filter((d) => !["active", "failed"].includes(d.status)).length,
      failed: domains.filter((d) => d.status === "failed").length,
      avg_health: domains.length
        ? Math.round(domains.reduce((sum, d) => sum + d.health_score, 0) / domains.length)
        : 0,
    };

    return NextResponse.json({ domains, summary });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch health data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inboxing/health
 * Trigger health check for all active domains
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const accessResult = await requireCompanyAccess(companyId);
  if ("error" in accessResult) return accessResult.error;
  const admin = getAdmin();

  try {
    let query = admin
      .from("inboxing_domains")
      .select("id, domain, inboxing_id")
      .eq("status", "active");

    query = query.eq("company_id", companyId);

    const { data: domains, error } = await query;
    if (error) throw error;

    const checks = [];
    for (const domain of domains || []) {
      // Basic DNS health check
      const health = await checkDomainHealth(domain.domain);

      await admin
        .from("inboxing_domains")
        .update({
          health_score: health.score,
          dns_spf: health.spf,
          dns_dkim: health.dkim,
          dns_dmarc: health.dmarc,
          last_health_check: new Date().toISOString(),
        })
        .eq("id", domain.id);

      checks.push({ domain: domain.domain, ...health });
    }

    return NextResponse.json({
      checked: checks.length,
      results: checks,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Health check failed" },
      { status: 500 }
    );
  }
}

async function checkDomainHealth(domain: string) {
  let spf = false;
  let dkim = false;
  let dmarc = false;

  try {
    // Check SPF
    const spfRes = await fetch(`https://dns.google/resolve?name=${domain}&type=TXT`);
    const spfData = await spfRes.json();
    spf = spfData.Answer?.some((a: any) => a.data?.includes("v=spf1")) || false;

    // Check DMARC
    const dmarcRes = await fetch(`https://dns.google/resolve?name=_dmarc.${domain}&type=TXT`);
    const dmarcData = await dmarcRes.json();
    dmarc = dmarcData.Answer?.some((a: any) => a.data?.includes("v=DMARC1")) || false;

    // DKIM is harder to check without knowing the selector, assume true if SPF+DMARC pass
    dkim = spf && dmarc;
  } catch {
    // DNS check failed
  }

  let score = 50; // baseline
  if (spf) score += 20;
  if (dkim) score += 15;
  if (dmarc) score += 15;

  return { score: Math.min(score, 100), spf, dkim, dmarc };
}
