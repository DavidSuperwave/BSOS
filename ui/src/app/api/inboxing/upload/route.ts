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
 * POST /api/inboxing/upload
 * Upload domain mailboxes to PlusVibe/platform
 */
export async function POST(req: NextRequest) {
  const admin = getAdmin();
  try {
    const body = await req.json();
    const {
      companyId,
      domain_id,
      domain_ids,
      emails,
      platform_connection_id,
      enable_warmup = true,
      sync_tags = true,
      skip_verified = true,
    } = body;

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }
    const accessResult = await requireCompanyAccess(companyId);
    if ("error" in accessResult) return accessResult.error;

    const { data: platform } = await admin
      .from("platform_connections")
      .select("id")
      .eq("id", platform_connection_id)
      .eq("company_id", companyId)
      .single();
    if (!platform) {
      return NextResponse.json({ error: "Platform connection not found" }, { status: 404 });
    }

    if ((!domain_id && !Array.isArray(domain_ids) && !Array.isArray(emails)) || !platform_connection_id) {
      return NextResponse.json(
        { error: "domain_id/domain_ids/emails and platform_connection_id required" },
        { status: 400 }
      );
    }

    const requestedDomainIds = new Set<string>();
    if (domain_id) requestedDomainIds.add(domain_id);
    if (Array.isArray(domain_ids)) {
      for (const id of domain_ids) requestedDomainIds.add(id);
    }

    const emailDomains = Array.isArray(emails)
      ? Array.from(
          new Set(
            emails
              .map((email: string) => (email.includes("@") ? email.split("@")[1].toLowerCase() : ""))
              .filter(Boolean)
          )
        )
      : [];

    const uploadTargets = new Map<
      string,
      {
        local_id: string | null;
        domain: string;
        inboxing_id: string;
        status: string | null;
      }
    >();

    const ids = Array.from(requestedDomainIds);
    if (ids.length > 0 || emailDomains.length > 0) {
      const localQueries = [];
      if (ids.length > 0) {
        localQueries.push(
          admin
            .from("inboxing_domains")
            .select("id, domain, inboxing_id, status")
            .eq("company_id", companyId)
            .in("id", ids),
          admin
            .from("inboxing_domains")
            .select("id, domain, inboxing_id, status")
            .eq("company_id", companyId)
            .in("inboxing_id", ids)
        );
      }
      if (emailDomains.length > 0) {
        localQueries.push(
          admin
            .from("inboxing_domains")
            .select("id, domain, inboxing_id, status")
            .eq("company_id", companyId)
            .in("domain", emailDomains)
        );
      }

      const localResults = await Promise.all(localQueries);
      for (const result of localResults) {
        for (const row of result.data || []) {
          if (!row.inboxing_id) continue;
          uploadTargets.set(row.inboxing_id, {
            local_id: row.id,
            domain: row.domain,
            inboxing_id: row.inboxing_id,
            status: row.status || null,
          });
        }
      }
    }

    if (ids.length > 0 || emailDomains.length > 0) {
      const assignmentQueries = [];
      if (ids.length > 0) {
        assignmentQueries.push(
          admin
            .from("inboxing_domain_assignments")
            .select("inboxing_id, domain_name")
            .eq("company_id", companyId)
            .eq("status", "active")
            .in("inboxing_id", ids)
        );
      }
      if (emailDomains.length > 0) {
        assignmentQueries.push(
          admin
            .from("inboxing_domain_assignments")
            .select("inboxing_id, domain_name")
            .eq("company_id", companyId)
            .eq("status", "active")
            .in("domain_name", emailDomains)
        );
      }

      const assignmentResults = await Promise.all(assignmentQueries);
      for (const result of assignmentResults) {
        for (const row of result.data || []) {
          if (!row.inboxing_id || uploadTargets.has(row.inboxing_id)) continue;
          uploadTargets.set(row.inboxing_id, {
            local_id: null,
            domain: row.domain_name || row.inboxing_id,
            inboxing_id: row.inboxing_id,
            status: null,
          });
        }
      }
    }

    if (uploadTargets.size === 0) {
      return NextResponse.json({ error: "No matching domains to upload" }, { status: 400 });
    }

    const results = [];
    for (const target of uploadTargets.values()) {
      let liveDomain = target.domain;
      let liveStatus = target.status;

      if (liveStatus !== "active") {
        try {
          const providerDomain = await inboxing.getDomain(target.inboxing_id, { usePlatformKey: true });
          liveDomain = providerDomain.domain || liveDomain;
          liveStatus = providerDomain.status || liveStatus;
        } catch {
          liveStatus = liveStatus || "unknown";
        }
      }

      if (liveStatus !== "active") {
        continue;
      }

      const result = await inboxing.uploadDomainToPlatform(target.inboxing_id, {
        platform_connection_id,
        enable_warmup,
        sync_tags,
        skip_verified,
      });

      const jobPayload = {
        platform_connection_id,
        enable_warmup,
        sync_tags,
        skip_verified,
        retries: 0,
      };

      const stage = result?.stage || "upload";
      await admin.from("inboxing_jobs").insert({
        company_id: companyId,
        domain_id: target.local_id,
        type: "upload",
        status: "processing",
        payload: jobPayload,
        result: { ...result, stage },
      });

      results.push({ domain: liveDomain, stage, result });
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: "No active domains are eligible for upload" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      jobs_created: results.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Upload failed" },
      { status: 500 }
    );
  }
}
