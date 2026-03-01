import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser, requireCompanyAccess, verifyCompanyAccess } from "@/lib/api-auth";

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
    const companyId = searchParams.get("companyId");
    const sessionId = searchParams.get("sessionId");
    const sessionType = searchParams.get("sessionType") || "main";

    const admin = getAdmin();

    if (sessionId) {
      const { data, error } = await admin
        .from("chat_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      if (data.user_id && data.user_id !== auth.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const access = await verifyCompanyAccess(auth.userId, data.company_id);
      if (!access) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Also fetch messages for backwards compatibility
      const { data: messages } = await admin
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .eq("is_compacted", false)
        .order("created_at", { ascending: true });

      return NextResponse.json({
        session: { ...data, messages: messages || [] },
      });
    }

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }
    const access = await verifyCompanyAccess(auth.userId, companyId);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // List sessions for company
    let query = admin
      .from("chat_sessions")
      .select("id, title, session_type, status, message_count, created_at, updated_at")
      .eq("company_id", companyId)
      .eq("session_type", sessionType)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(50);
    query = query.or(`user_id.eq.${auth.userId},user_id.is.null`);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ sessions: data || [] });
  } catch (err: any) {
    console.error("[Chat Sessions] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, title, sessionType = "main", contextRef } = body;
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }
    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    const admin = getAdmin();

    const insertData: Record<string, any> = {
      company_id: companyId,
      user_id: auth.userId,
      session_type: sessionType,
      title: title || "New Chat",
      status: "active",
    };
    if (contextRef) insertData.context_ref = contextRef;

    const { data, error } = await admin
      .from("chat_sessions")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ session: data }, { status: 201 });
  } catch (err: any) {
    console.error("[Chat Sessions] POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateUser();
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");
    const hardDelete = searchParams.get("hard") === "true";

    if (!sessionId) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data: session, error: sessionError } = await admin
      .from("chat_sessions")
      .select("id, company_id, user_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
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

    if (hardDelete) {
      // Hard delete removes both the session and its messages from the DB.
      const { error: deleteMessagesError } = await admin
        .from("chat_messages")
        .delete()
        .eq("session_id", sessionId);
      if (deleteMessagesError) throw deleteMessagesError;

      const { error: deleteSessionError } = await admin
        .from("chat_sessions")
        .delete()
        .eq("id", sessionId);
      if (deleteSessionError) throw deleteSessionError;

      return NextResponse.json({ success: true, hardDeleted: true });
    }

    // Soft delete — archive the session
    const { error } = await admin
      .from("chat_sessions")
      .update({ status: "archived" })
      .eq("id", sessionId);

    if (error) throw error;
    return NextResponse.json({ success: true, hardDeleted: false });
  } catch (err: any) {
    console.error("[Chat Sessions] DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
