import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getProjectCredentials } from "@/lib/plusvibe-project";
import { requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

function sanitizeError(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 400);
}

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
      reply_to_id,
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
    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    const access = await requireCompanyAccess(company_id);
    if (access.error) return access.error;

    // Get PlusVibe credentials
    const credentials = await getProjectCredentials(company_id);
    if (!credentials) {
      return NextResponse.json(
        { error: "PlusVibe not configured", code: "MISSING_KEY" },
        { status: 503 }
      );
    }

    const { data: originalMessage } = message_id
      ? await admin
          .from("inbox_messages")
          .select("id, plusvibe_id, campaign_id, to_email, from_email, thread_id")
          .eq("id", message_id)
          .single()
      : { data: null as any };

    let resolvedReplyToId = String(reply_to_id || originalMessage?.plusvibe_id || "").trim();
    if (!resolvedReplyToId && originalMessage?.campaign_id) {
      const query = new URLSearchParams({
        workspace_id: credentials.workspaceId,
        lead: String(to).trim().toLowerCase(),
        campaign_id: String(originalMessage.campaign_id),
      });
      const lookupRes = await fetch(`${PLUSVIBE_BASE}/unibox/campaign-emails?${query.toString()}`, {
        headers: {
          "x-api-key": credentials.apiKey,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (lookupRes.ok) {
        const lookupPayload = await lookupRes.json();
        const lookupRows = Array.isArray(lookupPayload?.data)
          ? lookupPayload.data
          : Array.isArray(lookupPayload?.value)
            ? lookupPayload.value
            : [];
        resolvedReplyToId = String(lookupRows[0]?.id || "").trim();
      }
    }

    if (!resolvedReplyToId) {
      return NextResponse.json(
        { error: "reply_to_id is required to send a threaded reply" },
        { status: 400 }
      );
    }

    const fromEmail =
      String(from || originalMessage?.to_email || "").trim().toLowerCase() || undefined;

    // Send via PlusVibe unibox reply API
    const plusvibeRes = await fetch(
      `${PLUSVIBE_BASE}/unibox/emails/reply?workspace_id=${encodeURIComponent(credentials.workspaceId)}`,
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credentials.apiKey,
      },
      body: JSON.stringify({
        reply_to_id: resolvedReplyToId,
        subject,
        from: fromEmail,
        to,
        body: replyBody,
        ...(scheduled_for && { scheduled_at: scheduled_for }),
      }),
      signal: AbortSignal.timeout(15000),
    }
    );

    if (!plusvibeRes.ok) {
      const errorText = await plusvibeRes.text();
      return NextResponse.json(
        { error: `PlusVibe API error: ${plusvibeRes.status}`, details: sanitizeError(errorText) },
        { status: plusvibeRes.status }
      );
    }

    const plusvibeResult = await plusvibeRes.json();

    // Update message status to replied
    if (message_id) {
      await admin
        .from("inbox_messages")
        .update({ status: "replied", updated_at: new Date().toISOString() })
        .eq("id", message_id);
    }

    // Store outbound message in thread
    const normalizedFrom = String(fromEmail || "unknown@plusvibe.local");
    const from_domain = normalizedFrom.split("@")[1] || null;
    const campaignId = originalMessage?.campaign_id || body.campaign_id || "manual";
    await admin.from("inbox_messages").insert({
      company_id,
      campaign_id: campaignId,
      campaign_name: body.campaign_name || null,
      thread_id: thread_id || originalMessage?.thread_id || `thread_${to}_${campaignId}`,
      plusvibe_id: plusvibeResult?.id || null,
      from_email: normalizedFrom,
      from_name: "You",
      from_domain,
      to_email: String(to).trim().toLowerCase(),
      subject,
      body: replyBody,
      body_text: replyBody.replace(/<[^>]*>/g, ""),
      sentiment: "neutral",
      status: "replied",
      priority: "medium",
      last_reply_at: new Date().toISOString(),
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
