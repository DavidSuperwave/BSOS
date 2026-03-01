import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateAgentRequest } from "@/lib/agent-auth";
import { logInvocation } from "@/lib/tool-logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const auth = await validateAgentRequest(req);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const eventType = searchParams.get("type");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  try {
    const admin = getAdmin();
    let query = admin
      .from("events")
      .select("*")
      .eq("company_id", auth.companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);
    if (eventType) query = query.eq("event_type", eventType);

    const { data, error } = await query;
    if (error) throw error;

    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/events",
      toolTier: "proxied",
      status: "success",
      durationMs: Date.now() - start,
      outputSummary: `${data?.length || 0} events`,
    });

    return NextResponse.json({ events: data || [] });
  } catch (err: any) {
    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/events",
      toolTier: "proxied",
      status: "error",
      errorMessage: err.message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const auth = await validateAgentRequest(req);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      event_type,
      title,
      description,
      priority = "medium",
      actions,
      session_id,
    } = body;

    if (!event_type || !title) {
      return NextResponse.json(
        { error: "event_type and title are required" },
        { status: 400 }
      );
    }

    const admin = getAdmin();
    const { data, error } = await admin
      .from("events")
      .insert({
        company_id: auth.companyId,
        session_id: session_id || null,
        event_type,
        title,
        description: description || null,
        priority,
        actions: actions || [],
        status: "unread",
      })
      .select()
      .single();

    if (error) throw error;

    await logInvocation({
      companyId: auth.companyId,
      sessionId: session_id,
      toolName: "data/events",
      toolTier: "proxied",
      status: "success",
      durationMs: Date.now() - start,
      inputParams: { event_type, title },
      outputSummary: `Created event ${data.id}`,
    });

    return NextResponse.json({ event: data }, { status: 201 });
  } catch (err: any) {
    await logInvocation({
      companyId: auth.companyId,
      toolName: "data/events",
      toolTier: "proxied",
      status: "error",
      errorMessage: err.message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
