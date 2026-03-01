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
 * GET /api/inboxing/domains/:id/status
 * Get domain provisioning status (syncs with Inboxing API)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = getAdmin();

  try {
    // Get local domain record
    const { data: domain, error } = await admin
      .from("inboxing_domains")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const accessResult = await requireCompanyAccess(domain.company_id);
    if ("error" in accessResult) return accessResult.error;

    // Sync with Inboxing API if we have an external ID
    let apiStatus = null;
    if (domain.inboxing_id) {
      try {
        apiStatus = await inboxing.getDomainStatus(domain.inboxing_id);

        // Update local record if status changed
        if (apiStatus.status !== domain.status) {
          await admin
            .from("inboxing_domains")
            .update({
              status: apiStatus.status,
              mailbox_count: apiStatus.mailbox_count || domain.mailbox_count,
              nameservers: apiStatus.nameservers || domain.nameservers,
              csv_available_at: apiStatus.csv_available_at,
            })
            .eq("id", id);
        }
      } catch (e: any) {
        console.warn("[Inboxing] Status sync failed:", e.message);
      }
    }

    // Get related jobs
    const { data: jobs } = await admin
      .from("inboxing_jobs")
      .select("*")
      .eq("domain_id", id)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      domain: {
        ...domain,
        ...(apiStatus && { api_status: apiStatus }),
      },
      jobs: jobs || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to get status" },
      { status: 500 }
    );
  }
}
