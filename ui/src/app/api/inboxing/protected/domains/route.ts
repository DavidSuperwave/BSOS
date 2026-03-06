import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import * as inboxing from "@/lib/inboxing-client";
import { getCompanyAssignedDomains } from "@/lib/inboxing-slots";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * GET /api/inboxing/protected/domains
 * List domains assigned to the company (slot-protected)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const accessResult = await requireCompanyAccess(companyId);
  if ("error" in accessResult) return accessResult.error;

  try {
    // Get only domains assigned to this company
    const assignedInboxingIds = await getCompanyAssignedDomains(companyId);

    if (assignedInboxingIds.length === 0) {
      return NextResponse.json({ domains: [], pagination: { total: 0, page: 1, total_pages: 1 } });
    }

    // Fetch only assigned domain IDs, never full platform inventory.
    const details = await Promise.allSettled(
      assignedInboxingIds.map((id) => inboxing.getDomain(id, { usePlatformKey: true }))
    );
    const filteredDomains = details
      .filter((result): result is PromiseFulfilledResult<any> => result.status === "fulfilled")
      .map((result) => result.value);

    return NextResponse.json({
      domains: filteredDomains,
      pagination: {
        total: filteredDomains.length,
        page: 1,
        total_pages: 1,
      },
    });
  } catch (error: any) {
    console.error("[Protected Inboxing Domains] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch domains" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inboxing/protected/domains
 * Create domain (slot-protected, checks available slots)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { company_id, domain, names, user_count = 49, redirect_url, redirect_type, tags } = body;

    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    const accessResult = await requireCompanyAccess(company_id);
    if ("error" in accessResult) return accessResult.error;

    // Check available slots
    const { hasAvailableSlots } = await import("@/lib/inboxing-slots");
    const hasSlots = await hasAvailableSlots(company_id, 1);

    if (!hasSlots) {
      return NextResponse.json(
        {
          error: "No available slots. Please purchase more slots or contact support.",
          code: "NO_SLOTS_AVAILABLE",
        },
        { status: 403 }
      );
    }

    // Create domain via Inboxing API (using platform key for managed domains)
    const inboxingResult = await inboxing.createDomain(
      {
        domain,
        names,
        user_count,
        redirect_url,
        redirect_type: redirect_type || "NONE",
        tags: tags || [],
      },
      { usePlatformKey: true }
    );

    const admin = getAdmin();

    // Store in inboxing_domains table
    const { data: domainRecord, error: insertError } = await admin
      .from("inboxing_domains")
      .insert({
        company_id,
        domain,
        status: inboxingResult.status,
        inboxing_id: inboxingResult.id,
        user_count,
        mailbox_count: inboxingResult.mailbox_count || 0,
        tags: tags || [],
        redirect_url,
        redirect_type: redirect_type || "NONE",
        nameservers: inboxingResult.nameservers || [],
        csv_available_at: inboxingResult.csv_available_at || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[Protected Inboxing Domains] DB insert error:", insertError);
      // Domain was created in Inboxing but failed to store locally
      // This is a problem but we'll continue
    }

    // Create assignment record
    if (domainRecord) {
      await admin.from("inboxing_domain_assignments").insert({
        company_id,
        inboxing_domain_id: domainRecord.id,
        inboxing_id: inboxingResult.id,
        domain_name: domain,
        status: "active",
      });

      // Increment used slots
      const { incrementUsedSlots } = await import("@/lib/inboxing-slots");
      await incrementUsedSlots(company_id);
    }

    return NextResponse.json({ domain: inboxingResult }, { status: 201 });
  } catch (error: any) {
    console.error("[Protected Inboxing Domains] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create domain" },
      { status: 500 }
    );
  }
}
