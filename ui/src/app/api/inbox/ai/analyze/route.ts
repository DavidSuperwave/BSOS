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
 * POST /api/inbox/ai/analyze
 * AI analysis of a thread or message.
 * Tries OpenClaw first, falls back to rule-based analysis.
 */
export async function POST(req: NextRequest) {
  const admin = getAdmin();
  try {
    const body = await req.json();
    const { message_id, thread_id, type, companyId } = body;

    if (!type) {
      return NextResponse.json(
        { error: "Analysis type required" },
        { status: 400 }
      );
    }

    if (type === "sentiment" && message_id) {
      const { data: message } = await admin
        .from("inbox_messages")
        .select("body_text, from_email, subject, company_id")
        .eq("id", message_id)
        .single();

      if (!message) {
        return NextResponse.json(
          { error: "Message not found" },
          { status: 404 }
        );
      }

      const cId = companyId || (message as any).company_id;
      let analysis: any = null;

      // Try OpenClaw if company has an active agent
      if (cId) {
        analysis = await tryOpenClawAnalysis(
          cId,
          message_id,
          (message as any).body_text || "",
          (message as any).subject || ""
        );
      }

      // Fall back to rule-based
      if (!analysis) {
        const text = ((message as any).body_text || "").toLowerCase();
        analysis = analyzeSentiment(text);
      }

      // Update the message with analysis
      await admin
        .from("inbox_messages")
        .update({
          sentiment: analysis.sentiment,
          intent: analysis.intent,
          ai_summary: analysis.summary,
        })
        .eq("id", message_id);

      return NextResponse.json({ analysis });
    }

    if (type === "company" && message_id) {
      const { data: message } = await admin
        .from("inbox_messages")
        .select("from_domain, from_email, from_name")
        .eq("id", message_id)
        .single();

      if (!(message as any)?.from_domain) {
        return NextResponse.json(
          { error: "No domain to analyze" },
          { status: 400 }
        );
      }

      const perplexityKey = process.env.PERPLEXITY_API_KEY;
      if (!perplexityKey) {
        return NextResponse.json({
          analysis: {
            domain: (message as any).from_domain,
            note: "Perplexity API key not configured for deep research",
          },
        });
      }

      const researchRes = await fetch(
        "https://api.perplexity.ai/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${perplexityKey}`,
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              {
                role: "user",
                content: `Research the company at domain ${(message as any).from_domain}. Provide: company name, industry, estimated size, tech stack if visible, recent news, and recommended sales angle for a cold email outreach agency. Keep it concise.`,
              },
            ],
          }),
        }
      );

      const researchData = await researchRes.json();
      const research =
        researchData.choices?.[0]?.message?.content || "Research unavailable";

      await admin
        .from("inbox_messages")
        .update({
          company_enrichment: {
            domain: (message as any).from_domain,
            research,
            analyzed_at: new Date().toISOString(),
          },
        })
        .eq("id", message_id);

      return NextResponse.json({
        analysis: {
          domain: (message as any).from_domain,
          research,
          citations: researchData.citations || [],
        },
      });
    }

    if (type === "thread_summary" && thread_id) {
      const { data: messages } = await admin
        .from("inbox_messages")
        .select("from_email, body_text, created_at, sentiment")
        .eq("thread_id", thread_id)
        .order("created_at", { ascending: true });

      if (!messages?.length) {
        return NextResponse.json(
          { error: "No messages in thread" },
          { status: 404 }
        );
      }

      const summary = summarizeThread(messages);

      await admin
        .from("email_threads")
        .update({ ai_analysis: summary })
        .eq("id", thread_id);

      return NextResponse.json({ analysis: summary });
    }

    return NextResponse.json(
      { error: "Invalid analysis request" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Analysis failed" },
      { status: 500 }
    );
  }
}

/**
 * Try to use OpenClaw agent for sentiment analysis.
 * Creates an inbox-type chat session for the analysis.
 */
async function tryOpenClawAnalysis(
  companyId: string,
  messageId: string,
  bodyText: string,
  subject: string
): Promise<{ sentiment: string; intent: string | null; summary: string } | null> {
  const admin = getAdmin();
  try {
    const { data: company } = await admin
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

    // Create an inbox-type session for this analysis
    const { data: session } = await admin
      .from("chat_sessions")
      .insert({
        company_id: companyId,
        session_type: "inbox",
        title: `Analyze: ${subject.slice(0, 50)}`,
        context_ref: messageId,
        status: "active",
      })
      .select("id")
      .single();

    const sessionKey = session
      ? `inbox-${(session as any).id}`
      : `inbox-${messageId}`;

    const prompt = `Analyze this email reply for sentiment and intent. Return ONLY a JSON object with keys: sentiment (positive|neutral|negative|ooo|auto_reply), intent (interested|not_interested|meeting_request|question|referral or null), summary (1-2 sentences).

Subject: ${subject}
Body: ${bodyText.slice(0, 2000)}`;

    const response = await sendMessage(
      (company as any).agent_config.agent_id,
      prompt,
      sessionKey
    );

    if (!response?.response) return null;

    // Try to parse JSON from the response
    const jsonMatch = response.response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        sentiment: parsed.sentiment || "neutral",
        intent: parsed.intent || null,
        summary: parsed.summary || "",
      };
    }
  } catch {
    // Fall through to rule-based
  }

  return null;
}

// ============================================================
// RULE-BASED FALLBACKS
// ============================================================

function analyzeSentiment(text: string) {
  const positiveSignals = [
    "interested",
    "tell me more",
    "sounds great",
    "love to",
    "set up a call",
    "book",
    "schedule",
    "meeting",
    "demo",
    "pricing",
    "let's chat",
    "reach out",
  ];
  const negativeSignals = [
    "unsubscribe",
    "not interested",
    "remove me",
    "stop emailing",
    "do not contact",
    "no thanks",
    "wrong person",
    "opt out",
  ];
  const oooSignals = [
    "out of office",
    "ooo",
    "on vacation",
    "be back on",
    "limited access",
    "auto-reply",
    "automatic reply",
  ];
  const meetingSignals = [
    "calendar",
    "availability",
    "free on",
    "works for me",
    "book a time",
    "calendly",
    "schedule a call",
  ];
  const questionSignals = [
    "how much",
    "pricing",
    "what does",
    "can you",
    "tell me about",
    "how does",
  ];
  const referralSignals = [
    "forward",
    "cc'd",
    "connect you with",
    "reach out to",
    "better person",
    "talk to my",
  ];

  let sentiment: string = "neutral";
  let intent: string | null = null;
  let summary = "";

  if (oooSignals.some((s) => text.includes(s))) {
    sentiment = "ooo";
    summary = "Out of office / auto-reply detected";
  } else if (negativeSignals.some((s) => text.includes(s))) {
    sentiment = "negative";
    intent = "not_interested";
    summary = "Prospect not interested or requesting removal";
  } else if (positiveSignals.some((s) => text.includes(s))) {
    sentiment = "positive";
    if (meetingSignals.some((s) => text.includes(s))) {
      intent = "meeting_request";
      summary = "Positive response with meeting interest";
    } else {
      intent = "interested";
      summary = "Positive response, prospect is interested";
    }
  } else if (questionSignals.some((s) => text.includes(s))) {
    sentiment = "neutral";
    intent = "question";
    summary = "Prospect asking questions - engagement signal";
  } else if (referralSignals.some((s) => text.includes(s))) {
    sentiment = "positive";
    intent = "referral";
    summary = "Referral to another contact detected";
  }

  return { sentiment, intent, summary };
}

function summarizeThread(messages: any[]) {
  const total = messages.length;
  const sentiments = messages.map((m) => m.sentiment);
  const latestSentiment = sentiments[sentiments.length - 1];
  const hasPositive = sentiments.includes("positive");
  const hasNegative = sentiments.includes("negative");

  let status = "active";
  let recommendation = "Continue engagement";

  if (hasNegative && !hasPositive) {
    status = "cold";
    recommendation = "Consider pausing outreach";
  } else if (hasPositive) {
    status = "warm";
    recommendation = "Push for meeting booking";
  }

  return {
    message_count: total,
    latest_sentiment: latestSentiment,
    overall_status: status,
    recommendation,
    analyzed_at: new Date().toISOString(),
  };
}
