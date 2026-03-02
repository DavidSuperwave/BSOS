/**
 * BSOS Signal Pipeline
 * Normalizes raw events from PlusVibe / Instantly / Email Bison / Close / Calendly
 * into a unified CampaignSignal format. Writes to campaign_signals table.
 *
 * Proxy score: converts disparate signal types into a 0-1 quality score.
 */

import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import type {
  CampaignSignal,
  BounceEvent,
  SignalType,
  BounceClassification,
  SourcePlatform,
} from "./types";

function getAdmin() {
  return createClient(
    envConfig.supabase.url()!,
    envConfig.supabase.serviceRoleKey()!
  );
}

// ─── Proxy Score Mapping ───
const PROXY_SCORES: Record<SignalType, number> = {
  open: 0.1,
  click: 0.3,
  reply: 0.7, // base — adjusted by reply classification
  bounce: -0.5,
  unsubscribe: -0.3,
  meeting_booked: 1.0,
  meeting_cancelled: -0.2,
  deal_created: 0.9,
  deal_won: 1.0,
  deal_lost: -0.1,
  warmup_health: 0.0, // informational
  domain_health: 0.0, // informational
  spam_complaint: -1.0,
};

/**
 * Compute proxy score for a signal. Adjusts reply score based on classification.
 */
export function computeProxyScore(
  signalType: SignalType,
  signalValue?: Record<string, any>
): number {
  let base = PROXY_SCORES[signalType] ?? 0;

  // Adjust reply proxy score by classification
  if (signalType === "reply" && signalValue?.classification) {
    const cls = signalValue.classification;
    if (cls.startsWith("positive_")) base = 0.85;
    else if (cls.startsWith("neutral_")) base = 0.3;
    else if (cls.startsWith("negative_")) base = -0.2;
    else if (cls === "auto_reply") base = 0.05;
  }

  return Math.max(-1, Math.min(1, base));
}

/**
 * Write a batch of signals to Supabase.
 */
export async function writeSignals(signals: CampaignSignal[]): Promise<{
  inserted: number;
  errors: string[];
}> {
  if (signals.length === 0) return { inserted: 0, errors: [] };

  const db = getAdmin();
  const errors: string[] = [];
  let inserted = 0;

  // Batch in chunks of 100
  for (let i = 0; i < signals.length; i += 100) {
    const chunk = signals.slice(i, i + 100);
    const { error, count } = await db
      .from("campaign_signals")
      .insert(chunk)
      .select("id");

    if (error) {
      errors.push(`Batch ${Math.floor(i / 100)}: ${error.message}`);
    } else {
      inserted += count || chunk.length;
    }
  }

  return { inserted, errors };
}

/**
 * Write bounce events to Supabase.
 */
export async function writeBounceEvents(events: BounceEvent[]): Promise<{
  inserted: number;
  errors: string[];
}> {
  if (events.length === 0) return { inserted: 0, errors: [] };

  const db = getAdmin();
  const errors: string[] = [];
  let inserted = 0;

  for (let i = 0; i < events.length; i += 100) {
    const chunk = events.slice(i, i + 100);
    const { error, count } = await db
      .from("bounce_events")
      .insert(chunk)
      .select("id");

    if (error) {
      errors.push(`Batch ${Math.floor(i / 100)}: ${error.message}`);
    } else {
      inserted += count || chunk.length;
    }
  }

  return { inserted, errors };
}

/**
 * Classify a bounce based on SMTP code and message.
 */
export function classifyBounce(
  bounceCode: string,
  bounceMsg: string | null
): BounceClassification {
  const code = bounceCode || "";
  const msg = (bounceMsg || "").toLowerCase();

  // Hard bounce patterns
  if (code.startsWith("5.1.") || msg.includes("user unknown") || msg.includes("no such user")) {
    return "hard_bounce";
  }
  if (msg.includes("mailbox full") || msg.includes("over quota") || code === "4.2.2") {
    return "mailbox_full";
  }
  if (msg.includes("dns") || msg.includes("no mx") || code.startsWith("4.4.")) {
    return "dns_failure";
  }
  if (msg.includes("policy") || msg.includes("rejected") || code.startsWith("5.7.")) {
    return "policy_rejection";
  }
  if (msg.includes("spam") || msg.includes("blacklist") || msg.includes("blocked")) {
    return "spam_block";
  }
  if (code.startsWith("4.")) {
    return "soft_bounce";
  }
  if (code.startsWith("5.")) {
    return "hard_bounce";
  }

  return "unknown";
}

/**
 * Normalize a PlusVibe lead event into CampaignSignal(s).
 */
export function normalizePlusVibeEvent(
  companyId: string,
  campaignId: string,
  lead: Record<string, any>
): CampaignSignal[] {
  const signals: CampaignSignal[] = [];
  const now = new Date().toISOString();
  const base = {
    company_id: companyId,
    campaign_id: campaignId,
    source_platform: "plusvibe" as SourcePlatform,
  };

  if (lead.opened_at) {
    signals.push({
      ...base,
      signal_type: "open",
      signal_value: { opened_at: lead.opened_at, email: lead.email },
      proxy_score: computeProxyScore("open"),
      recorded_at: lead.opened_at || now,
    });
  }

  if (lead.replied_at || lead.status === "replied") {
    const val = { replied_at: lead.replied_at, email: lead.email, reply_text: lead.reply_text };
    signals.push({
      ...base,
      signal_type: "reply",
      signal_value: val,
      proxy_score: computeProxyScore("reply", val),
      recorded_at: lead.replied_at || now,
    });
  }

  if (lead.status === "bounced" || lead.is_bounced) {
    signals.push({
      ...base,
      signal_type: "bounce",
      signal_value: {
        email: lead.email,
        bounce_code: lead.bounce_code,
        bounce_msg: lead.bounce_msg,
      },
      proxy_score: computeProxyScore("bounce"),
      recorded_at: now,
    });
  }

  if (lead.clicked_at) {
    signals.push({
      ...base,
      signal_type: "click",
      signal_value: { clicked_at: lead.clicked_at, email: lead.email },
      proxy_score: computeProxyScore("click"),
      recorded_at: lead.clicked_at || now,
    });
  }

  return signals;
}
