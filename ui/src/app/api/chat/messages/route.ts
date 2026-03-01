import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser, verifyCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const includeCompacted = searchParams.get("includeCompacted") === "true";

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const admin = getAdmin();
    const { data: session } = await admin
      .from("chat_sessions")
      .select("id, company_id, user_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.user_id && session.user_id !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await verifyCompanyAccess(auth.userId, session.company_id);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let query = admin
      .from("chat_messages")
      .select("*", { count: "exact" })
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (!includeCompacted) {
      query = query.eq("is_compacted", false);
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      messages: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: any) {
    console.error("[Chat Messages] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
