import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getProjectCredentials } from "@/lib/plusvibe-project";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const PLUSVIBE_BASE = "https://server.plusvibe.com/api/v3";

/**
 * POST /api/inbox/reply
 * Send reply via PlusVibe and track in database
 */
export async function POST(req: NextRequest) {
  const admin = getAdmin();
  try {
    const body = await req.json();
    const {
      thread_id,
      message_id,
      to,
      subject,
      body: replyBody,
      from,
      company_id,
      scheduled_for,
    } = body;

    if (!to || !subject || !replyBody) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, body" },
        { status: 400 }
      );
    }

    // Get PlusVibe credentials
    const credentials = await getProjectCredentials(company_id);
    if (!credentials) {
      return NextResponse.json(
        { error: "PlusVibe not configured", code: "MISSING_KEY" },
        { status: 503 }
      );
    }

    // Send via PlusVibe unibox reply API
    const plusvibeRes = await fetch(`${PLUSVIBE_BASE}/unibox/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credentials.apiKey,
      },
      body: JSON.stringify({
        workspace_id: credentials.workspaceId,
        to_email: to,
        subject,
        body: replyBody,
        from_email: from,
        ...(scheduled_for && { scheduled_at: scheduled_for }),
      }),
    });

    let plusvibeResult = null;
    if (plusvibeRes.ok) {
      plusvibeResult = await plusvibeRes.json();
    }

    // Update message status to replied
    if (message_id) {
      await admin
        .from("inbox_messages")
        .update({ status: "replied" })
        .eq("id", message_id);
    }

    // Store outbound message in thread
    const from_domain = (from || "").split("@")[1] || null;
    await admin.from("inbox_messages").insert({
      company_id,
      campaign_id: body.campaign_id || "manual",
      thread_id: thread_id || `thread_${to}_manual`,
      from_email: from || "system",
      from_name: "Outbound",
      from_domain,
      to_email: to,
      subject,
      body: replyBody,
      body_text: replyBody.replace(/<[^>]*>/g, ""),
      sentiment: "neutral",
      status: "replied",
      priority: "medium",
    });

    return NextResponse.json({
      success: true,
      plusvibe: plusvibeResult,
      message: "Reply sent successfully",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to send reply" },
      { status: 500 }
    );
  }
}
