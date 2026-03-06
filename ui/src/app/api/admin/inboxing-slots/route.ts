import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/bsos/db";
import * as inboxing from "@/lib/inboxing-client";
import { allocateSlots } from "@/lib/inboxing-slots";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * GET /api/admin/inboxing-slots
 * Get slot information from Inboxing API (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    if (view === "allocations") {
      const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);
      const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
      const search = (searchParams.get("search") || "").trim().toLowerCase();

      const admin = getAdmin();
      const { data, error } = await admin
        .from("inboxing_slot_allocations")
        .select(
          "company_id, total_slots, used_slots, free_slots, allocation_type, expires_at, updated_at, companies(id, name, slug)"
        )
        .order("updated_at", { ascending: false })
        .limit(500);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = (data || []).filter((row: any) => {
        if (!search) return true;
        const name = String(row?.companies?.name || "").toLowerCase();
        const slug = String(row?.companies?.slug || "").toLowerCase();
        return name.includes(search) || slug.includes(search);
      });

      const offset = (page - 1) * limit;
      const paged = rows.slice(offset, offset + limit).map((row: any) => ({
        company_id: row.company_id,
        company_name: row?.companies?.name || null,
        company_slug: row?.companies?.slug || null,
        total_slots: row.total_slots,
        used_slots: row.used_slots,
        free_slots: row.free_slots,
        allocation_type: row.allocation_type,
        expires_at: row.expires_at,
        updated_at: row.updated_at,
      }));

      return NextResponse.json({
        allocations: paged,
        pagination: {
          page,
          limit,
          total: rows.length,
          pages: Math.max(1, Math.ceil(rows.length / limit)),
        },
      });
    }

    // Get slots from Inboxing API using platform key
    const slots = await inboxing.getSlots({ usePlatformKey: true });

    return NextResponse.json({ slots });
  } catch (error: any) {
    console.error("[Admin Inboxing Slots] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch slots" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/inboxing-slots
 * Allocate total slots to a company (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const companyId = String(body?.company_id || "");
    const totalSlots = Number(body?.total_slots);
    const allocationType =
      body?.allocation_type === "purchased" || body?.allocation_type === "trial"
        ? body.allocation_type
        : "free";
    const expiresAt = body?.expires_at ? new Date(body.expires_at) : undefined;

    if (!companyId) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }
    if (!Number.isInteger(totalSlots) || totalSlots < 0) {
      return NextResponse.json({ error: "total_slots must be a non-negative integer" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data: existing, error: existingError } = await admin
      .from("inboxing_slot_allocations")
      .select("used_slots")
      .eq("company_id", companyId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const usedSlots = Number(existing?.used_slots || 0);
    if (totalSlots < usedSlots) {
      return NextResponse.json(
        { error: `total_slots cannot be less than currently used slots (${usedSlots})` },
        { status: 400 }
      );
    }

    await allocateSlots(companyId, totalSlots, allocationType, expiresAt);

    const { data: updated, error: fetchError } = await admin
      .from("inboxing_slot_allocations")
      .select(
        "company_id, total_slots, used_slots, free_slots, allocation_type, expires_at, updated_at, companies(id, name, slug)"
      )
      .eq("company_id", companyId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    return NextResponse.json({
      allocation: {
        company_id: updated.company_id,
        company_name: (updated as any)?.companies?.name || null,
        company_slug: (updated as any)?.companies?.slug || null,
        total_slots: updated.total_slots,
        used_slots: updated.used_slots,
        free_slots: updated.free_slots,
        allocation_type: updated.allocation_type,
        expires_at: updated.expires_at,
        updated_at: updated.updated_at,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to allocate slots" },
      { status: 500 }
    );
  }
}
