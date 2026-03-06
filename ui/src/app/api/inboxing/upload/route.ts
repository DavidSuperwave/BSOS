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

    const domainIdsToUpload = new Set<string>();
    if (domain_id) domainIdsToUpload.add(domain_id);
    if (Array.isArray(domain_ids)) {
      for (const id of domain_ids) domainIdsToUpload.add(id);
    }

    if (Array.isArray(emails)) {
      const domainsFromEmails = Array.from(
        new Set(
          emails
            .map((email: string) => (email.includes("@") ? email.split("@")[1].toLowerCase() : ""))
            .filter(Boolean)
        )
      );
      if (domainsFromEmails.length > 0) {
        const { data: matchedDomains } = await admin
          .from("inboxing_domains")
          .select("id")
          .eq("company_id", companyId)
          .in("domain", domainsFromEmails);
        for (const row of matchedDomains || []) domainIdsToUpload.add(row.id);
      }
    }

    const ids = Array.from(domainIdsToUpload);
    if (ids.length === 0) {
      return NextResponse.json({ error: "No matching domains to upload" }, { status: 400 });
    }

    const { data: domains, error } = await admin
      .from("inboxing_domains")
      .select("*")
      .eq("company_id", companyId)
      .in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const validDomains = (domains || []).filter(
      (domain) => domain.status === "active" && Boolean(domain.inboxing_id)
    );
    if (validDomains.length === 0) {
      return NextResponse.json(
        { error: "No active domains are eligible for upload" },
        { status: 400 }
      );
    }

    const results = [];
    for (const domain of validDomains) {
      const result = await inboxing.uploadDomainToPlatform(domain.inboxing_id, {
        platform_connection_id,
        enable_warmup,
        sync_tags: false,
        skip_verified,
      });

      const jobPayload = {
        platform_connection_id,
        enable_warmup,
        sync_tags: false,
        skip_verified,
        retries: 0,
      };

      const stage = result?.stage || "upload";
      await admin.from("inboxing_jobs").insert({
        company_id: domain.company_id,
        domain_id: domain.id,
        type: "upload",
        status: "processing",
        payload: jobPayload,
        result: { ...result, stage },
      });

      results.push({ domain: domain.domain, stage, result });
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
