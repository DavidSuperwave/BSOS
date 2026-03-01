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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = getAdmin();

  const { data: job, error } = await admin
    .from("inboxing_jobs")
    .select("id, company_id, domain_id, payload")
    .eq("id", id)
    .eq("type", "upload")
    .single();
  if (error || !job) {
    return NextResponse.json({ error: "Upload job not found" }, { status: 404 });
  }

  const accessResult = await requireCompanyAccess(job.company_id);
  if ("error" in accessResult) return accessResult.error;

  const { data: domain, error: domainError } = await admin
    .from("inboxing_domains")
    .select("id, inboxing_id, status")
    .eq("id", job.domain_id)
    .single();
  if (domainError || !domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }
  if (domain.status !== "active" || !domain.inboxing_id) {
    return NextResponse.json({ error: "Domain is not upload-ready" }, { status: 400 });
  }

  const payload = (job.payload || {}) as Record<string, any>;
  try {
    const result = await inboxing.uploadDomainToPlatform(domain.inboxing_id, {
      platform_connection_id: payload.platform_connection_id,
      enable_warmup: payload.enable_warmup ?? true,
      sync_tags: payload.sync_tags ?? true,
      skip_verified: payload.skip_verified ?? true,
    });

    const retries = Number(payload.retries || 0) + 1;
    await admin
      .from("inboxing_jobs")
      .update({
        status: "processing",
        payload: { ...payload, retries },
        result: { ...result, stage: result?.stage || "Upload" },
        error: null,
      })
      .eq("id", id);

    return NextResponse.json({ success: true, retries });
  } catch (err: any) {
    await admin
      .from("inboxing_jobs")
      .update({
        status: "failed",
        payload: { ...payload, retries: Number(payload.retries || 0) + 1 },
        error: err.message || "Retry failed",
      })
      .eq("id", id);
    return NextResponse.json(
      { error: err.message || "Retry failed" },
      { status: 500 }
    );
  }
}
