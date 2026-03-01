import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";

/**
 * POST /api/inboxing/domains/check
 * Check domain availability (basic DNS check)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyId, domains } = body;

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }
    const accessResult = await requireCompanyAccess(companyId);
    if ("error" in accessResult) return accessResult.error;

    if (!domains?.length) {
      return NextResponse.json({ error: "domains array required" }, { status: 400 });
    }

    // Note: True availability checks require registrar API integration.
    // This is a lightweight heuristic check.
    const results = [];

    for (const domain of domains.slice(0, 50)) {
      try {
        // Try DNS resolution - if it resolves, domain is taken
        const dnsRes = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
        const dnsData = await dnsRes.json();

        const hasDns = dnsData.Answer && dnsData.Answer.length > 0;

        results.push({
          domain,
          availability: hasDns ? "unavailable" : "likely_available",
          has_dns: hasDns,
        });
      } catch {
        results.push({
          domain,
          availability: "unknown",
          has_dns: false,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to check domains" },
      { status: 500 }
    );
  }
}
