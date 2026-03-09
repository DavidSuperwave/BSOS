import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/bsos/db";
import * as inboxing from "@/lib/inboxing-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * GET /api/admin/inboxing-domains
 * Fetch all domains from Inboxing API (admin only, uses platform key)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const perPage = parseInt(searchParams.get("per_page") || "50");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    // Fetch domains from Inboxing API using platform key
    const inboxingResult = await inboxing.listDomains(
      {
        page,
        per_page: perPage,
        status: status || undefined,
        search: search || undefined,
      },
      { usePlatformKey: true }
    );

    const admin = getAdmin();

    // Get assignment info from database
    const inboxingIds = inboxingResult.data.map((d) => d.id);
    const { data: assignments } = inboxingIds.length > 0
      ? await admin
          .from("inboxing_domain_assignments")
          .select("inboxing_id, company_id, status, assigned_at, companies(id, name, slug)")
          .in("inboxing_id", inboxingIds)
          .eq("status", "active")
      : { data: [] };

    const assignmentMap = new Map(
      (assignments || []).map((a: any) => [
        a.inboxing_id,
        {
          company_id: a.company_id,
          company_name: a.companies?.name,
          company_slug: a.companies?.slug,
          assigned_at: a.assigned_at,
          status: a.status,
        },
      ])
    );

    // Fetch full domain details including redirect URLs (if not in list response)
    // Fetch in parallel batches to get redirect URLs
    const domainDetails = await Promise.allSettled(
      inboxingResult.data.map((d) =>
        inboxing.getDomain(d.id, { usePlatformKey: true }).catch((err) => {
          console.warn(`Failed to fetch details for domain ${d.id}:`, err.message);
          return d; // Fallback to list data
        })
      )
    );

    // Enrich domains with full details and assignment info
    const enrichedDomains = inboxingResult.data.map((domain, index) => {
      const detailResult = domainDetails[index];
      const fullDomain = detailResult.status === "fulfilled" ? detailResult.value : domain;
      const assignment = assignmentMap.get(domain.id);
      
      return {
        ...domain,
        // Use full domain details if available
        ...(typeof fullDomain === "object" && fullDomain !== null ? fullDomain : {}),
        redirect_url: (fullDomain as any)?.redirect_url || (domain as any)?.redirect_url || null,
        redirect_type: (fullDomain as any)?.redirect_type || (domain as any)?.redirect_type || null,
        assigned_to_company_id: assignment?.company_id || null,
        assigned_to_company_name: assignment?.company_name || null,
        assigned_to_company_slug: assignment?.company_slug || null,
        assigned_at: assignment?.assigned_at || null,
        assignment_status: assignment?.status || null,
      };
    });

    return NextResponse.json({
      domains: enrichedDomains,
      pagination: inboxingResult.pagination,
    });
  } catch (error: any) {
    console.error("[Admin Inboxing Domains] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch domains" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/inboxing-domains
 * Assign domain(s) to a company
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { inboxing_ids, company_id, notes } = body;
    const domainNameMap = typeof body?.domain_names === "object" && body?.domain_names !== null
      ? body.domain_names
      : {};

    if (!inboxing_ids || !Array.isArray(inboxing_ids) || inboxing_ids.length === 0) {
      return NextResponse.json({ error: "inboxing_ids array is required" }, { status: 400 });
    }

    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    const admin = getAdmin();

    // Verify company exists
    const { data: company } = await admin
      .from("companies")
      .select("id, name")
      .eq("id", company_id)
      .single();

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Fetch domain details from Inboxing API
    const domainDetails = await Promise.allSettled(
      inboxing_ids.map((id: string) =>
        inboxing.getDomain(id, { usePlatformKey: true })
      )
    );

    const results = [];
    for (let i = 0; i < inboxing_ids.length; i++) {
      const inboxingId = inboxing_ids[i];
      const domainResult = domainDetails[i];

      const fallbackDomainName =
        typeof domainNameMap?.[inboxingId] === "string" && domainNameMap[inboxingId].trim()
          ? domainNameMap[inboxingId].trim()
          : null;

      if (domainResult.status === "rejected" && !fallbackDomainName) {
        results.push({
          inboxing_id: inboxingId,
          success: false,
          error: domainResult.reason?.message || "Failed to fetch domain",
        });
        continue;
      }
      const resolvedDomainName =
        domainResult.status === "fulfilled"
          ? domainResult.value?.domain || fallbackDomainName || `inboxing-${inboxingId}`
          : fallbackDomainName || `inboxing-${inboxingId}`;

      // Check if already assigned
      const { data: existing } = await admin
        .from("inboxing_domain_assignments")
        .select("id, company_id, status")
        .eq("inboxing_id", inboxingId)
        .maybeSingle();

      if (existing) {
        // Update existing assignment
        const { error: updateError } = await admin
          .from("inboxing_domain_assignments")
          .update({
            company_id,
            assigned_by: auth.userId,
            assigned_at: new Date().toISOString(),
            notes: notes || null,
            status: "active",
          })
          .eq("id", existing.id);

        if (updateError) {
          results.push({
            inboxing_id: inboxingId,
            success: false,
            error: updateError.message,
          });
          continue;
        }

      } else {
        // Create new assignment
        const { error: insertError } = await admin
          .from("inboxing_domain_assignments")
          .insert({
            company_id,
            inboxing_id: inboxingId,
            domain_name: resolvedDomainName,
            assigned_by: auth.userId,
            notes: notes || null,
            status: "active",
          });

        if (insertError) {
          results.push({
            inboxing_id: inboxingId,
            success: false,
            error: insertError.message,
          });
          continue;
        }

      }

      results.push({
        inboxing_id: inboxingId,
        domain_name: resolvedDomainName,
        success: true,
      });
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("[Admin Inboxing Domains] Assignment error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to assign domains" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/inboxing-domains
 * Reclaim/unassign domain(s) from companies
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const inboxingIds = Array.isArray(body?.inboxing_ids)
      ? body.inboxing_ids.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    if (inboxingIds.length === 0) {
      return NextResponse.json({ error: "inboxing_ids array is required" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data: activeAssignments, error: queryError } = await admin
      .from("inboxing_domain_assignments")
      .select("id, inboxing_id, domain_name")
      .in("inboxing_id", inboxingIds)
      .eq("status", "active");

    if (queryError) {
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    if (!activeAssignments || activeAssignments.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const reclaimedAt = new Date().toISOString();
    const results = await Promise.all(
      activeAssignments.map(async (assignment) => {
        const { error } = await admin
          .from("inboxing_domain_assignments")
          .update({
            status: "reclaimed",
            notes: `Reclaimed by ${auth.email} on ${reclaimedAt}`,
          })
          .eq("id", assignment.id);

        if (error) {
          return {
            inboxing_id: assignment.inboxing_id,
            domain_name: assignment.domain_name,
            success: false,
            error: error.message,
          };
        }

        return {
          inboxing_id: assignment.inboxing_id,
          domain_name: assignment.domain_name,
          success: true,
        };
      })
    );

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("[Admin Inboxing Domains] Reclaim error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reclaim domains" },
      { status: 500 }
    );
  }
}
