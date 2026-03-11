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

type DomainSource = "local" | "assignment";

async function getDomainWithAccess(id: string) {
  const admin = getAdmin();
  const { data: domain } = await admin
    .from("inboxing_domains")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (domain) {
    const accessResult = await requireCompanyAccess(domain.company_id);
    if ("error" in accessResult) return { error: accessResult.error };
    return { admin, domain, source: "local" as DomainSource };
  }

  const { data: assignment } = await admin
    .from("inboxing_domain_assignments")
    .select("*")
    .eq("inboxing_id", id)
    .eq("status", "active")
    .maybeSingle();

  if (assignment) {
    const accessResult = await requireCompanyAccess(assignment.company_id);
    if ("error" in accessResult) return { error: accessResult.error };
    return { admin, domain: assignment, source: "assignment" as DomainSource };
  }

  return { error: NextResponse.json({ error: "Domain not found" }, { status: 404 }) };
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
  const { admin, domain, source } = result;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (Array.isArray(body.tags)) updates.tags = body.tags;
  if (body.redirect_url !== undefined) updates.redirect_url = body.redirect_url;
  if (body.redirect_type !== undefined) updates.redirect_type = body.redirect_type;

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    if (source === "assignment" && !domain.inboxing_domain_id) {
      return NextResponse.json(
        { error: "Assigned domains cannot be edited until they are synced locally." },
        { status: 400 }
      );
    }

    const table = "inboxing_domains";
    const matchField = source === "local" ? "id" : "id";
    const matchValue = source === "local" ? id : domain.inboxing_domain_id;
    const { error } = await admin.from(table).update(updates).eq(matchField, matchValue);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (Array.isArray(body.names)) {
    await admin.from("inboxing_jobs").insert({
      company_id: domain.company_id,
      domain_id: source === "local" ? domain.id : domain.inboxing_domain_id || null,
      type: "inbox_provision",
      status: "pending",
      payload: {
        action: "names_update",
        names: body.names,
        inboxing_id: source === "local" ? domain.inboxing_id : domain.inboxing_id,
        domain: source === "local" ? domain.domain : domain.domain_name,
      },
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
  const { admin, domain, source } = result;

  if (source === "assignment") {
    const { error } = await admin
      .from("inboxing_domain_assignments")
      .update({
        status: "reclaimed",
        notes: "Reclaimed through domain delete route",
      })
      .eq("inboxing_id", id)
      .eq("status", "active");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Assignment reclaimed" });
  }

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

  if (domain.inboxing_id) {
    await admin
      .from("inboxing_domain_assignments")
      .update({ status: "reclaimed", notes: "Auto-reclaimed on domain deletion" })
      .eq("inboxing_id", domain.inboxing_id)
      .eq("status", "active");
  }

  return NextResponse.json({ success: true, message: "Deletion initiated" });
}
