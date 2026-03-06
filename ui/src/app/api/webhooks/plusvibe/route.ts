import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { sendMessage } from "@/lib/openclaw-client";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const limiter = createRateLimiter({ limit: 60, window: 60 });

/**
 * POST /api/webhooks/plusvibe
 *
 * Receives reply callbacks from PlusVibe when a prospect responds to an outbound email.
 * - Inserts or upserts the reply into inbox_messages
 * - Creates an event for the company
 * - If company has auto_analyze enabled, spawns an OpenClaw inbox session
 */
export async function POST(req: NextRequest) {
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  try {
    const body = await req.json();

    // Validate required fields
    const {
      campaign_id,
      from_email,
      to_email,
      subject,
      body: emailBody,
    } = body;

    if (!campaign_id || !from_email || !to_email || !subject || !emailBody) {
      return NextResponse.json(
        { error: "Missing required fields: campaign_id, from_email, to_email, subject, body" },
        { status: 400 }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve company from campaign_id or explicit company_id
    let companyId = body.company_id;

    if (!companyId) {
      // Try to find company by looking up which company owns this campaign
      const { data: existing } = await admin
        .from("inbox_messages")
        .select("company_id")
        .eq("campaign_id", campaign_id)
        .limit(1)
        .single();

      companyId = existing?.company_id;
    }

    if (!companyId) {
      return NextResponse.json(
        { error: "Could not resolve company for this campaign" },
        { status: 400 }
      );
    }

    // Build message record
    const fromDomain = from_email.split("@")[1] || "";
    const messageData = {
      company_id: companyId,
      campaign_id,
      campaign_name: body.campaign_name || null,
      thread_id: body.thread_id || null,
      plusvibe_id: body.plusvibe_id || null,
      from_email,
      from_name: body.from_name || null,
      from_domain: fromDomain,
      to_email,
      subject,
      body: emailBody,
      body_text: body.body_text || null,
      sentiment: body.sentiment || null,
      intent: body.intent || null,
      tags: body.tags || [],
      status: "unread",
      priority: body.priority || "medium",
    };

    // Upsert into inbox_messages
    const { data: message, error: insertError } = await admin
      .from("inbox_messages")
      .upsert(messageData as any, {
        onConflict: "plusvibe_id",
        ignoreDuplicates: false,
      })
      .select("id")
      .single();

    let messageId: string | undefined;
    if (insertError) {
      // If upsert fails (e.g. no plusvibe_id), try insert
      const { data: inserted, error: fallbackError } = await admin
        .from("inbox_messages")
        .insert(messageData as any)
        .select("id")
        .single();

      if (fallbackError) {
        console.error("[Webhook PlusVibe] Insert error:", fallbackError);
        return NextResponse.json(
          { error: "Failed to save message" },
          { status: 500 }
        );
      }

      messageId = inserted?.id;
    } else {
      messageId = message?.id;
    }

    // Update email thread if thread_id exists
    if (body.thread_id) {
      await admin
        .from("email_threads")
        .upsert(
          {
            thread_id: body.thread_id,
            company_id: companyId,
            prospect_email: from_email,
            prospect_name: body.from_name || null,
            subject,
            last_message_body: emailBody,
            last_activity: new Date().toISOString(),
            status: "active",
          } as any,
          { onConflict: "thread_id" }
        )
        .then(() => {
          // Increment message count
          admin.rpc("increment_thread_message_count", {
            tid: body.thread_id,
          }).then(() => {});
        });
    }

    // Create event for the company
    await admin.from("events").insert({
      company_id: companyId,
      event_type: "email_reply",
      title: `New reply from ${body.from_name || from_email}`,
      description: `Re: ${subject}`,
      priority: "medium",
      actions: [
        {
          type: "navigate",
          label: "Open in Inbox",
          href: `/inbox?messageId=${encodeURIComponent(messageId || "")}&campaignId=${encodeURIComponent(campaign_id)}`,
        },
      ],
      status: "unread",
    } as any);

    // Check if company has auto_analyze enabled
    const { data: company } = await admin
      .from("companies")
      .select("settings, agent_status, agent_config")
      .eq("id", companyId)
      .single();

    const settings = (company as any)?.settings || {};
    const agentStatus = (company as any)?.agent_status;

    if (settings.auto_analyze && agentStatus === "active" && messageId) {
      // Spawn async OpenClaw inbox session for analysis
      spawnAnalysis(admin, companyId, messageId, from_email, subject, emailBody).catch(
        (err) => console.error("[Webhook PlusVibe] Auto-analyze error:", err)
      );
    }

    // Auto-move matching pipeline entries based on reply sentiment/intent rules.
    autoMovePipelineEntries(admin, {
      companyId,
      fromEmail: from_email,
      sentiment: body.sentiment,
      intent: body.intent,
      tags: body.tags,
    }).catch((err) =>
      console.error("[Webhook PlusVibe] Pipeline auto-move error:", err)
    );

    return NextResponse.json(
      { success: true, message_id: messageId },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[Webhook PlusVibe] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Spawns an async OpenClaw inbox session to analyze the received message.
 * Non-blocking — errors are logged but don't affect the webhook response.
 */
async function spawnAnalysis(
  admin: any,
  companyId: string,
  messageId: string,
  fromEmail: string,
  subject: string,
  body: string
) {
  const openclawUrl = envConfig.openclaw.url();
  if (!openclawUrl) return;

  // Create inbox-type chat session
  const { data: session } = await admin
    .from("chat_sessions")
    .insert({
      company_id: companyId,
      session_type: "inbox",
      context_ref: messageId,
      title: `Analyze: ${subject}`,
    } as any)
    .select("id")
    .single();

  if (!session?.id) return;

  const prompt = `Analyze this inbound email reply and provide:
1. Sentiment (positive, neutral, negative, ooo, auto_reply)
2. Intent (interested, not_interested, meeting_request, question, referral)
3. A brief summary (1-2 sentences)
4. Suggested next action

From: ${fromEmail}
Subject: ${subject}
Body:
${body}`;

  try {
    const result = await sendMessage(companyId, prompt, session.id);
    if (!result) return;

    // Parse result and update inbox_messages
    const sentiment = extractField(result.response, "sentiment");
    const intent = extractField(result.response, "intent");
    const summary = extractSummary(result.response);

    const updates: Record<string, string> = {};
    if (sentiment) updates.sentiment = sentiment;
    if (intent) updates.intent = intent;
    if (summary) updates.ai_summary = summary;

    if (Object.keys(updates).length > 0) {
      await admin
        .from("inbox_messages")
        .update(updates)
        .eq("id", messageId);
    }
  } catch (err) {
    console.error("[Auto-analyze] OpenClaw error:", err);
  }
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).toLowerCase());
  if (typeof value === "string") return [value.toLowerCase()];
  return [];
}

function matchesAutoMoveRule(
  rule: any,
  sentiment?: string,
  intent?: string,
  tags?: string[]
) {
  if (!rule || typeof rule !== "object") return false;
  const normalizedSentiment = String(sentiment || "").toLowerCase();
  const normalizedIntent = String(intent || "").toLowerCase();
  const normalizedTags = (tags || []).map((t) => t.toLowerCase());

  const allowedSentiments = toArray(rule.sentiment);
  const allowedIntents = toArray(rule.intent);
  const requiredTags = toArray(rule.tags);

  if (allowedSentiments.length > 0 && !allowedSentiments.includes(normalizedSentiment)) {
    return false;
  }
  if (allowedIntents.length > 0 && !allowedIntents.includes(normalizedIntent)) {
    return false;
  }
  if (requiredTags.length > 0 && !requiredTags.some((t) => normalizedTags.includes(t))) {
    return false;
  }

  if (
    allowedSentiments.length === 0 &&
    allowedIntents.length === 0 &&
    requiredTags.length === 0
  ) {
    return false;
  }

  return true;
}

async function autoMovePipelineEntries(
  admin: any,
  {
    companyId,
    fromEmail,
    sentiment,
    intent,
    tags,
  }: {
    companyId: string;
    fromEmail: string;
    sentiment?: string;
    intent?: string;
    tags?: string[];
  }
) {
  const normalizedEmail = fromEmail.trim().toLowerCase();
  if (!normalizedEmail) return;

  const { data: entries, error: entriesError } = await admin
    .from("pipeline_entries")
    .select("id, pipeline_id, stage_id")
    .eq("company_id", companyId)
    .ilike("contact_email", normalizedEmail);

  if (entriesError || !entries || entries.length === 0) return;

  const pipelineIds = Array.from(new Set(entries.map((e: any) => e.pipeline_id)));
  const { data: stages, error: stagesError } = await admin
    .from("pipeline_stages")
    .select("id, pipeline_id, position, auto_move_on, name")
    .in("pipeline_id", pipelineIds)
    .order("position", { ascending: true });

  if (stagesError || !stages) return;

  const stageMap = new Map<string, any[]>();
  for (const stage of stages) {
    const list = stageMap.get(stage.pipeline_id) || [];
    list.push(stage);
    stageMap.set(stage.pipeline_id, list);
  }

  for (const entry of entries) {
    const candidates = stageMap.get(entry.pipeline_id) || [];
    const destination = candidates.find(
      (stage) =>
        stage.id !== entry.stage_id &&
        matchesAutoMoveRule(stage.auto_move_on, sentiment, intent, tags)
    );
    if (!destination) continue;

    const { data: existingPositions } = await admin
      .from("pipeline_entries")
      .select("position")
      .eq("stage_id", destination.id)
      .order("position", { ascending: false })
      .limit(1);

    const nextPosition =
      existingPositions && existingPositions.length > 0
        ? Number(existingPositions[0].position || 0) + 1
        : 0;

    await admin
      .from("pipeline_entries")
      .update({
        stage_id: destination.id,
        position: nextPosition,
        moved_at: new Date().toISOString(),
      })
      .eq("id", entry.id)
      .eq("company_id", companyId);
  }
}

function extractField(text: string, field: string): string | null {
  const pattern = new RegExp(`${field}[:\\s]+([\\w_]+)`, "i");
  const match = text.match(pattern);
  return match ? match[1].toLowerCase() : null;
}

function extractSummary(text: string): string | null {
  const pattern = /summary[:\s]+(.+?)(?:\n|$)/i;
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}
