import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * GET /api/inbox/threads/:id
 * Get thread with all messages
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = getAdmin();

  try {
    const { data: messages, error: messagesError } = await admin
      .from("inbox_messages")
      .select("*")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;
    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const firstMessage = messages[0];
    const latestMessage = messages[messages.length - 1];
    let thread: any = null;

    const { data: existingThread } = await admin
      .from("email_threads")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    thread = existingThread || {
      id,
      thread_id: id,
      company_id: firstMessage.company_id,
      campaign_id: firstMessage.campaign_id,
      prospect_email: firstMessage.from_email,
      prospect_name: firstMessage.from_name,
      subject: firstMessage.subject,
      status: "active",
      message_count: messages.length,
      last_activity: latestMessage.created_at,
    };

    return NextResponse.json({
      thread,
      messages: messages || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch thread" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/inbox/threads/:id
 * Update thread status or AI analysis
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = getAdmin();

  try {
    const body = await req.json();
    const allowedFields = ["status", "ai_analysis"];
    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const { data, error } = await admin
      .from("email_threads")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Thread updates are unavailable for this thread record" },
        { status: 404 }
      );
    }

    return NextResponse.json({ thread: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update thread" },
      { status: 500 }
    );
  }
}
