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
 * GET /api/inboxing/upload/status
 * Check upload status for a domain/email
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const domain = searchParams.get("domain");
  const email = searchParams.get("email");
  const connectionId =
    searchParams.get("connection_id") || searchParams.get("platform_connection_id");
  const status = searchParams.get("status");

  try {
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const accessResult = await requireCompanyAccess(companyId);
    if ("error" in accessResult) return accessResult.error;

    const admin = getAdmin();
    let query = admin
      .from("inboxing_jobs")
      .select(
        "id, domain_id, status, payload, result, error, created_at, inboxing_domains(domain)"
      )
      .eq("company_id", companyId)
      .eq("type", "upload")
      .order("created_at", { ascending: false })
      .limit(200);

    if (status) query = query.eq("status", status);
    if (connectionId) query = query.eq("payload->>platform_connection_id", connectionId);

    const { data, error: dbError } = await query;
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

    const jobs = (data || []).filter((job: any) => {
      const domainName = job.inboxing_domains?.domain || "";
      if (domain && !domainName.toLowerCase().includes(domain.toLowerCase())) return false;
      if (email) {
        const emailDomain = email.split("@")[1]?.toLowerCase();
        if (emailDomain && emailDomain !== domainName.toLowerCase()) return false;
      }
      return true;
    });

    const platformIds = Array.from(
      new Set(
        jobs
          .map((job: any) => job.payload?.platform_connection_id as string | undefined)
          .filter(Boolean)
      )
    );
    const platformNameById = new Map<string, string>();
    if (platformIds.length > 0) {
      const { data: platformRows } = await admin
        .from("platform_connections")
        .select("id,name")
        .in("id", platformIds);
      for (const row of platformRows || []) platformNameById.set(row.id, row.name);
    }

    const mapped = jobs.map((job: any) => {
      const retries = Number(job.payload?.retries || 0);
      const stage = job.result?.stage || "Upload";
      return {
        id: job.id,
        domain_id: job.domain_id,
        domain: job.inboxing_domains?.domain || null,
        status: job.status,
        retries,
        stage,
        platform_name: platformNameById.get(job.payload?.platform_connection_id) || null,
        platform_connection_id: job.payload?.platform_connection_id || null,
        error: job.error || null,
        created_at: job.created_at,
      };
    });

    return NextResponse.json({
      jobs: mapped,
      summary: {
        total: mapped.length,
        completed: mapped.filter((job: any) => job.status === "complete").length,
        failed: mapped.filter((job: any) => job.status === "failed").length,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to check upload status" },
      { status: 500 }
    );
  }
}
