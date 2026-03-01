import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMessage } from "@/lib/openclaw-client";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const limiter = createRateLimiter({ limit: 60, window: 60 });

/**
 * POST /api/webhooks/calendly
 *
 * Receives booking notifications from Calendly.
 * 1. Stores event in Supabase (system of record)
 * 2. Forwards to OpenClaw agent for intelligent processing
 */
export async function POST(req: NextRequest) {
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  try {
    const body = await req.json();

    const event = body.event;
    const payload = body.payload;

    if (!event || !payload) {
      return NextResponse.json(
        { error: "Invalid Calendly webhook payload" },
        { status: 400 }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Extract invitee info
    const invitee = payload.invitee || payload;
    const inviteeName = invitee.name || invitee.invitee_name || "Unknown";
    const inviteeEmail = invitee.email || invitee.invitee_email || "";
    const eventType =
      payload.event_type?.name || payload.event_type_name || "Meeting";
    const scheduledAt =
      payload.event?.start_time || payload.scheduled_event?.start_time;

    // Resolve company
    let companyId: string | null = null;

    // Method 1: Tracking UTM
    const trackingParams = payload.tracking || {};
    if (trackingParams.utm_content) {
      companyId = trackingParams.utm_content;
    }

    // Method 2: Lookup by invitee email in inbox_messages
    if (!companyId && inviteeEmail) {
      const { data: match } = await admin
        .from("inbox_messages")
        .select("company_id")
        .eq("from_email", inviteeEmail)
        .limit(1)
        .single();

      companyId = match?.company_id || null;
    }

    // Method 3: Single-tenant fallback
    if (!companyId) {
      const { data: companies } = await admin
        .from("companies")
        .select("id")
        .limit(2);

      if (companies && companies.length === 1) {
        companyId = companies[0].id;
      }
    }

    if (!companyId) {
      console.warn(
        "[Webhook Calendly] Could not resolve company for:",
        inviteeEmail
      );
      return NextResponse.json(
        { success: true, warning: "Company not resolved" },
        { status: 200 }
      );
    }

    // Map Calendly events
    let eventTitle: string;
    let eventDescription: string;
    let eventTypeStr: string;
    let priority: "low" | "medium" | "high" | "urgent" = "medium";

    switch (event) {
      case "invitee.created":
        eventTitle = `Meeting booked: ${inviteeName}`;
        eventDescription = `${eventType} scheduled${
          scheduledAt
            ? ` for ${new Date(scheduledAt).toLocaleString()}`
            : ""
        }`;
        eventTypeStr = "meeting_booked";
        break;

      case "invitee.canceled":
        eventTitle = `Meeting canceled: ${inviteeName}`;
        eventDescription = `${eventType} was canceled`;
        eventTypeStr = "alert";
        priority = "high";
        break;

      default:
        eventTitle = `Calendly: ${event}`;
        eventDescription = `${inviteeName} — ${eventType}`;
        eventTypeStr = "status_update";
    }

    // Store event in Supabase (system of record)
    await admin.from("events").insert({
      company_id: companyId,
      event_type: eventTypeStr,
      title: eventTitle,
      description: eventDescription,
      priority,
      actions: [
        {
          type: "navigate",
          label: "Review in Inbox",
          href: `/inbox?q=${encodeURIComponent(inviteeEmail || inviteeName)}`,
        },
      ],
      status: "unread",
    } as any);

    // Update inbox message status if meeting booked
    if (event === "invitee.created" && inviteeEmail) {
      await admin
        .from("inbox_messages")
        .update({ status: "booked" } as any)
        .eq("company_id", companyId)
        .eq("from_email", inviteeEmail)
        .eq("status", "unread");
    }

    // Forward to OpenClaw agent for intelligent processing
    const { data: company } = await admin
      .from("companies")
      .select("agent_status, agent_config")
      .eq("id", companyId)
      .single();

    const agentConfig = (company as any)?.agent_config;
    const agentStatus = (company as any)?.agent_status;

    if (agentStatus === "active" && agentConfig?.agent_id) {
      // Create a chat session for this webhook
      const { data: session } = await admin
        .from("chat_sessions")
        .insert({
          company_id: companyId,
          session_type: "webhook",
          context_ref: `calendly:${event}:${inviteeEmail}`,
          title: eventTitle,
        } as any)
        .select("id")
        .single();

      if (session?.id) {
        const prompt = `Calendly webhook received — ${event}:

Invitee: ${inviteeName} (${inviteeEmail})
Event type: ${eventType}
${scheduledAt ? `Scheduled: ${new Date(scheduledAt).toLocaleString()}` : ""}
${event === "invitee.canceled" ? "The meeting was CANCELED." : ""}

Based on this event:
1. Check if this person is in our inbox (search by email: ${inviteeEmail})
2. If they're a prospect, assess ICP fit
3. Suggest next steps (prep notes, CRM update, follow-up sequence)
4. Store any insights to memory with appropriate category

${event === "invitee.canceled" ? "If canceled, check if we should re-engage or flag as lost." : ""}`;

        // Fire async — don't block webhook response
        sendMessage(agentConfig.agent_id, prompt, session.id).catch((err) =>
          console.error("[Webhook Calendly] Agent processing error:", err)
        );
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error("[Webhook Calendly] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
