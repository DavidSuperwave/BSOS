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

async function getDomainWithAccess(id: string) {
  const admin = getAdmin();
  const { data: domain, error } = await admin
    .from("inboxing_domains")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !domain) return { error: NextResponse.json({ error: "Domain not found" }, { status: 404 }) };

  const accessResult = await requireCompanyAccess(domain.company_id);
  if ("error" in accessResult) return { error: accessResult.error };

  return { admin, domain };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getDomainWithAccess(id);
  if ("error" in result) return result.error;
  return NextResponse.json({ domain: result.domain });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getDomainWithAccess(id);
  if ("error" in result) return result.error;
  const { admin, domain } = result;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (Array.isArray(body.tags)) updates.tags = body.tags;
  if (body.redirect_url !== undefined) updates.redirect_url = body.redirect_url;
  if (body.redirect_type !== undefined) updates.redirect_type = body.redirect_type;

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error } = await admin.from("inboxing_domains").update(updates).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (Array.isArray(body.names)) {
    await admin.from("inboxing_jobs").insert({
      company_id: domain.company_id,
      domain_id: domain.id,
      type: "inbox_provision",
      status: "pending",
      payload: { action: "names_update", names: body.names },
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getDomainWithAccess(id);
  if ("error" in result) return result.error;
  const { admin, domain } = result;

  if (domain.inboxing_id) {
    try {
      await inboxing.deleteDomain(domain.inboxing_id);
    } catch (err) {
      console.warn("[Inboxing] deleteDomain failed", err);
    }
  }

  await admin.from("inboxing_jobs").insert({
    company_id: domain.company_id,
    domain_id: domain.id,
    type: "domain_delete",
    status: "processing",
    payload: { domain: domain.domain },
  });

  const { error } = await admin.from("inboxing_domains").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Deletion initiated" });
}
