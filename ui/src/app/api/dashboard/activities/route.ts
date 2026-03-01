import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const OUTBOUND_EVENT_TYPES = [
  "email_reply",
  "meeting_booked",
  "opportunity_created",
];

type RangeFilter = "today" | "yesterday" | "week";
type SortFilter = "date_desc" | "date_asc";

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

function getRangeBounds(range: RangeFilter) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const companyId = params.get("companyId");
    const range = (params.get("range") || "today") as RangeFilter;
    const sort = (params.get("sort") || "date_desc") as SortFilter;
    const search = params.get("search")?.trim();
    const limitRaw = parseInt(params.get("limit") || "25", 10);
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    if (!["today", "yesterday", "week"].includes(range)) {
      return NextResponse.json({ error: "Invalid range value" }, { status: 400 });
    }

    if (!["date_desc", "date_asc"].includes(sort)) {
      return NextResponse.json({ error: "Invalid sort value" }, { status: 400 });
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    const { startIso, endIso } = getRangeBounds(range);
    const admin = getAdmin();

    let query = admin
      .from("events")
      .select("id, company_id, event_type, title, description, actions, priority, status, created_at")
      .eq("company_id", companyId)
      .in("event_type", OUTBOUND_EVENT_TYPES)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: sort === "date_asc" })
      .limit(limit);

    if (search) {
      const escaped = search.replace(/[%_]/g, "");
      query = query.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      activities: data || [],
      meta: { range, sort, limit },
    });
  } catch (err: any) {
    console.error("[Dashboard Activities] GET error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch activities" },
      { status: 500 }
    );
  }
}
