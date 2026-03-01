import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMessage } from "@/lib/openclaw-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * POST /api/inbox/ai/suggest
 * AI-powered action suggestions for a message.
 * Tries OpenClaw first, falls back to templates.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message_id, type, companyId } = body;

    if (!message_id) {
      return NextResponse.json(
        { error: "message_id required" },
        { status: 400 }
      );
    }

    const admin = getAdmin();
    const { data: message } = await admin
      .from("inbox_messages")
      .select("*")
      .eq("id", message_id)
      .single();

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    const msg = message as any;

    if (type === "reply") {
      // Try OpenClaw for reply suggestions
      const cId = companyId || msg.company_id;
      const openClawReplies = cId
        ? await tryOpenClawSuggest(cId, msg)
        : null;

      const replies = openClawReplies || generateReplySuggestions(msg);

      await admin
        .from("inbox_messages")
        .update({ suggested_actions: { reply_suggestions: replies } })
        .eq("id", message_id);

      return NextResponse.json({ suggestions: replies });
    }

    if (type === "actions") {
      const actions = suggestActions(msg);
      return NextResponse.json({ suggestions: actions });
    }

    if (type === "template") {
      const templates = suggestTemplates(msg);
      return NextResponse.json({ suggestions: templates });
    }

    return NextResponse.json(
      { error: "Invalid suggestion type" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Suggestion failed" },
      { status: 500 }
    );
  }
}

async function tryOpenClawSuggest(
  companyId: string,
  message: any
): Promise<any[] | null> {
  try {
    const { data: company } = await getAdmin()
      .from("companies")
      .select("agent_config, agent_status")
      .eq("id", companyId)
      .single();

    if (
      (company as any)?.agent_status !== "active" ||
      !(company as any)?.agent_config?.agent_id
    ) {
      return null;
    }

    const prompt = `Suggest 2 reply drafts for this email. Return a JSON array of objects with keys: tone (string), subject (string), body (string).

From: ${message.from_name || message.from_email}
Subject: ${message.subject}
Body: ${(message.body_text || "").slice(0, 1500)}
Sentiment: ${message.sentiment || "unknown"}`;

    const response = await sendMessage(
      (company as any).agent_config.agent_id,
      prompt,
      `suggest-${message.id}`
    );

    if (!response?.response) return null;

    const jsonMatch = response.response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall through
  }
  return null;
}

function suggestActions(message: any) {
  const actions: {
    type: string;
    label: string;
    description: string;
    priority: string;
  }[] = [];

  if (message.sentiment === "positive") {
    actions.push({
      type: "check_calendly",
      label: "Check Calendly Availability",
      description: "Find open slots and suggest a meeting time",
      priority: "high",
    });
    actions.push({
      type: "draft_reply",
      label: "Draft Reply",
      description:
        "Generate a personalized reply to continue the conversation",
      priority: "high",
    });
  }

  if (message.intent === "meeting_request") {
    actions.push({
      type: "book_meeting",
      label: "Send Calendly Link",
      description: "Share your scheduling link to book a call",
      priority: "high",
    });
  }

  if (message.intent === "question") {
    actions.push({
      type: "suggest_template",
      label: "Answer with Template",
      description:
        "Use a pre-built response template to answer their question",
      priority: "medium",
    });
  }

  if (message.from_domain) {
    actions.push({
      type: "analyze_company",
      label: `Research ${message.from_domain}`,
      description:
        "Get company intelligence to personalize your follow-up",
      priority: "medium",
    });
  }

  if (message.sentiment === "negative") {
    actions.push({
      type: "archive",
      label: "Archive",
      description: "Mark as not interested and archive",
      priority: "low",
    });
  }

  if (message.sentiment === "ooo") {
    actions.push({
      type: "schedule_followup",
      label: "Schedule Follow-up",
      description: "Set a reminder to follow up when they return",
      priority: "medium",
    });
  }

  return actions;
}

function generateReplySuggestions(message: any) {
  const name = message.from_name || message.from_email.split("@")[0];
  const suggestions = [];

  if (
    message.sentiment === "positive" ||
    message.intent === "interested"
  ) {
    suggestions.push({
      tone: "professional",
      subject: `Re: ${message.subject}`,
      body: `Hi ${name},\n\nThanks for getting back to me! I'd love to walk you through how we can help.\n\nWould you have 15 minutes this week for a quick call? Here's my calendar: [CALENDLY_LINK]\n\nLooking forward to connecting!\n\nBest,\n[YOUR_NAME]`,
    });
    suggestions.push({
      tone: "casual",
      subject: `Re: ${message.subject}`,
      body: `Hey ${name},\n\nGreat to hear from you! Let's hop on a quick call this week and I'll show you exactly how this works.\n\nPick a time that works: [CALENDLY_LINK]\n\nCheers,\n[YOUR_NAME]`,
    });
  }

  if (message.intent === "question") {
    suggestions.push({
      tone: "informative",
      subject: `Re: ${message.subject}`,
      body: `Hi ${name},\n\nGreat question! Here's a quick overview:\n\n[ANSWER_PLACEHOLDER]\n\nWould it be helpful to jump on a 10-minute call so I can walk you through the specifics?\n\nBest,\n[YOUR_NAME]`,
    });
  }

  if (message.intent === "referral") {
    suggestions.push({
      tone: "professional",
      subject: `Re: ${message.subject}`,
      body: `Hi ${name},\n\nThanks for pointing me in the right direction! I'll reach out to them directly.\n\nIf anything comes up on your end in the future, don't hesitate to reach out.\n\nBest,\n[YOUR_NAME]`,
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      tone: "professional",
      subject: `Re: ${message.subject}`,
      body: `Hi ${name},\n\nThanks for your reply! I wanted to follow up and see if there's a good time to connect this week.\n\nBest,\n[YOUR_NAME]`,
    });
  }

  return suggestions;
}

function suggestTemplates(message: any) {
  const templates = [];

  if (message.sentiment === "positive") {
    templates.push({
      id: "soft_close",
      name: "Soft Close",
      description: "Suggest a brief intro call",
      match_score: 95,
    });
    templates.push({
      id: "audit_offer",
      name: "Audit Offer",
      description: "Offer a free deliverability audit",
      match_score: 85,
    });
    templates.push({
      id: "case_study",
      name: "Case Study",
      description: "Share relevant case study + CTA",
      match_score: 80,
    });
  }

  if (message.intent === "question") {
    templates.push({
      id: "faq_response",
      name: "FAQ Response",
      description: "Common question answer template",
      match_score: 90,
    });
  }

  return templates;
}
