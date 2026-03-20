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

    const admin = getAdmin();
    const { count: assignedTotal } = await admin
      .from("inboxing_domain_assignments")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    try {
      const inboxingResult = await inboxing.listDomains(
        {
          page,
          per_page: perPage,
          status: status || undefined,
          search: search || undefined,
        },
        { usePlatformKey: true }
      );

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

      const enrichedDomains = inboxingResult.data.map((domain) => {
        const assignment = assignmentMap.get(domain.id);
        
        return {
          ...domain,
          redirect_url: (domain as any)?.redirect_url ?? null,
          redirect_type: (domain as any)?.redirect_type ?? null,
          assigned_to_company_id: assignment?.company_id ?? null,
          assigned_to_company_name: assignment?.company_name ?? null,
          assigned_to_company_slug: assignment?.company_slug ?? null,
          assigned_at: assignment?.assigned_at ?? null,
          assignment_status: assignment?.status ?? null,
        };
      });

      return NextResponse.json({
        domains: enrichedDomains,
        pagination: inboxingResult.pagination,
        assigned_total: assignedTotal ?? 0,
      });
    } catch (providerError: any) {
      const { data: assignments, error: assignmentError } = await admin
        .from("inboxing_domain_assignments")
        .select(
          "inboxing_id, domain_name, assigned_at, status, company_id, companies(id, name, slug), inboxing_domains(status, mailbox_count, redirect_url, redirect_type, created_at)"
        )
        .eq("status", "active")
        .order("assigned_at", { ascending: false });

      if (assignmentError) {
        throw providerError;
      }

      const fallbackDomains = (assignments || [])
        .map((assignment: any) => {
          const localDomain = Array.isArray(assignment.inboxing_domains)
            ? assignment.inboxing_domains[0]
            : assignment.inboxing_domains;
          const domainStatus = localDomain?.status || assignment.status || "assigned";

          return {
            id: assignment.inboxing_id,
            domain: assignment.domain_name || assignment.inboxing_id,
            status: domainStatus,
            user_count: 0,
            mailbox_count: localDomain?.mailbox_count ?? 0,
            tags: [],
            nameservers: [],
            csv_available_at: null,
            created_at: localDomain?.created_at || assignment.assigned_at,
            redirect_url: localDomain?.redirect_url || null,
            redirect_type: localDomain?.redirect_type || null,
            assigned_to_company_id: assignment.company_id,
            assigned_to_company_name: assignment.companies?.name || null,
            assigned_to_company_slug: assignment.companies?.slug || null,
            assigned_at: assignment.assigned_at || null,
            assignment_status: assignment.status || null,
          };
        })
        .filter((domain) => {
          const matchesStatus = !status || domain.status === status;
          const matchesSearch =
            !search || domain.domain.toLowerCase().includes(search.trim().toLowerCase());
          return matchesStatus && matchesSearch;
        });

      const start = (page - 1) * perPage;
      const paginatedDomains = fallbackDomains.slice(start, start + perPage);

      return NextResponse.json({
        domains: paginatedDomains,
        pagination: {
          page,
          per_page: perPage,
          total: fallbackDomains.length,
          total_pages: Math.max(1, Math.ceil(fallbackDomains.length / perPage)),
        },
        assigned_total: assignedTotal ?? 0,
        provider_error: providerError.message || "Live Inboxing sync unavailable",
      });
    }
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

    const results = [];
    for (let i = 0; i < inboxing_ids.length; i++) {
      const inboxingId = inboxing_ids[i];
      const resolvedDomainName =
        typeof domainNameMap?.[inboxingId] === "string" && domainNameMap[inboxingId].trim()
          ? domainNameMap[inboxingId].trim()
          : `domain-${inboxingId}`;

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
