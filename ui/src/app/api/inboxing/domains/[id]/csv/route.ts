import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as inboxing from "@/lib/inboxing-client";
import { requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * GET /api/inboxing/domains/:id/csv
 * Download mailbox credentials CSV
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = getAdmin();

  try {
    const { data: domain, error } = await admin
      .from("inboxing_domains")
      .select("company_id, inboxing_id, domain, status, csv_available_at")
      .eq("id", id)
      .single();

    if (error || !domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    if (!domain.inboxing_id) {
      return NextResponse.json(
        { error: "Domain not linked to Inboxing API" },
        { status: 400 }
      );
    }

    const accessResult = await requireCompanyAccess(domain.company_id);
    if ("error" in accessResult) return accessResult.error;

    if (domain.status !== "active") {
      return NextResponse.json(
        { error: `Domain is ${domain.status}, must be active for CSV download` },
        { status: 400 }
      );
    }

    // Check warmup period
    if (domain.csv_available_at && new Date(domain.csv_available_at) > new Date()) {
      const hours = Math.ceil(
        (new Date(domain.csv_available_at).getTime() - Date.now()) / 3600000
      );
      return NextResponse.json(
        { error: `CSV will be available in ~${hours} hours (24-hour warmup)` },
        { status: 403 }
      );
    }

    const csv = await inboxing.getDomainCsv(domain.inboxing_id, { usePlatformKey: true });

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${domain.domain}-credentials.csv"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to download CSV" },
      { status: 500 }
    );
  }
}
