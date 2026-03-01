import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    const status = searchParams.get("status");
    const eventType = searchParams.get("type");
    const limitRaw = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    const admin = getAdmin();
    let query = admin
      .from("events")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);
    if (eventType) query = query.eq("event_type", eventType);

    const { data, error, count } = await query;
    if (error) throw error;

    // Get unread count
    const { count: unreadCount } = await admin
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "unread");

    return NextResponse.json({
      events: data || [],
      unreadCount: unreadCount || 0,
      total: count || 0,
    });
  } catch (err: any) {
    console.error("[Events] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, companyId } = body;

    if (!id || !status || !companyId) {
      return NextResponse.json(
        { error: "id, status, and companyId are required" },
        { status: 400 }
      );
    }

    const allowedStatus = new Set(["unread", "read", "acted", "dismissed"]);
    if (!allowedStatus.has(status)) {
      return NextResponse.json(
        { error: "Invalid status value" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    const admin = getAdmin();
    const { data, error } = await admin
      .from("events")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ event: data });
  } catch (err: any) {
    console.error("[Events] PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
