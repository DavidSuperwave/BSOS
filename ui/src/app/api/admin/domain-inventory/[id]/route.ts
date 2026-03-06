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

interface RouteParams {
  params: { id: string };
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const admin = getAdmin();
    const domainId = params.id;
    const body = await request.json();

    const allowedFields = ["status", "sale_price", "assigned_to_company_id", "tags", "notes", "domain_type"] as const;
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
    }

    const status = updates.status as string | undefined;
    const assignedToCompanyId = updates.assigned_to_company_id as string | undefined;
    const isAssigning = Boolean(assignedToCompanyId && status === "assigned");
    const isReclaiming = status === "reclaimed" || status === "available";

    if (isAssigning) {
      updates.assigned_at = new Date().toISOString();
    }

    if (isReclaiming) {
      updates.assigned_to_company_id = null;
      updates.assigned_at = null;
    }

    const { data: updatedDomain, error: updateError } = await admin
      .from("domain_inventory")
      .update(updates)
      .eq("id", domainId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (isAssigning && updatedDomain) {
      const transactionPayload = {
        company_id: assignedToCompanyId,
        domain_inventory_id: updatedDomain.id,
        amount_paid: 0,
        currency: "usd",
        type: "admin_assign",
        status: "completed",
        metadata: {
          assigned_by: auth.email,
          assigned_at: updates.assigned_at,
        },
      };

      const { error: txError } = await admin.from("domain_transactions").insert(transactionPayload);
      if (txError) {
        return NextResponse.json({ error: txError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ domain: updatedDomain });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update domain" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const admin = getAdmin();
    const domainId = params.id;

    const { data: domain, error: fetchError } = await admin
      .from("domain_inventory")
      .select("id, domain_name, status, inboxing_id")
      .eq("id", domainId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    if (domain.status !== "available") {
      return NextResponse.json({ error: "Only available domains can be removed" }, { status: 400 });
    }

    if (domain.inboxing_id) {
      try {
        await inboxing.deleteDomain(domain.inboxing_id, { usePlatformKey: true });
      } catch (inboxingError) {
        return NextResponse.json(
          { error: inboxingError instanceof Error ? inboxingError.message : "Failed to remove domain from inboxing" },
          { status: 500 }
        );
      }
    }

    const { error: deleteError } = await admin.from("domain_inventory").delete().eq("id", domainId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete domain" },
      { status: 500 }
    );
  }
}
