/**
 * BSOS Reply Classifier
 * Classifies email replies into quality categories.
 * Computes the three reasoning factors:
 *   Factor 1 = ICP fit
 *   Factor 2 = Timing / market
 *   Factor 3 = Offer strength
 *
 * Uses keyword matching + LLM fallback (OpenAI via OpenClaw).
 * All classifications labeled as INFERENCE — never taken as ground truth.
 */

import type { ReplyClassification, ReplyQualityBreakdown } from "./types";

export interface ClassificationResult {
  classification: ReplyClassification;
  confidence: number; // 0-1
  method: "keyword" | "llm" | "fallback";
  factor_1_icp_fit: number; // 0-100
  factor_2_timing: number; // 0-100
  factor_3_offer_strength: number; // 0-100
  reasoning: string;
  is_inference: true; // Always true — never assert ground truth
}

// ─── Keyword Patterns ───

const POSITIVE_INTERESTED_PATTERNS = [
  /interested/i,
  /tell me more/i,
  /sounds good/i,
  /let'?s (chat|talk|connect|discuss)/i,
  /schedule (a )?(call|demo|meeting)/i,
  /when are you (free|available)/i,
  /can we (hop on|get on|schedule)/i,
  /would love to/i,
  /please send/i,
  /great timing/i,
];

const POSITIVE_REFERRAL_PATTERNS = [
  /you (should|might want to) (contact|reach out to|talk to)/i,
  /better person to (talk|speak) to/i,
  /cc'?ing/i,
  /forwarding (you|this) to/i,
  /right person is/i,
];

const NEUTRAL_OOO_PATTERNS = [
  /out of (the )?office/i,
  /on (vacation|leave|holiday|pto)/i,
  /will be (back|returning)/i,
  /automatic reply/i,
  /auto.?reply/i,
  /away from (the )?office/i,
];

const NEUTRAL_INFO_PATTERNS = [
  /can you (send|share|provide)/i,
  /what is (the )?price/i,
  /how (much|does it cost)/i,
  /do you (have|offer)/i,
  /more information/i,
  /tell me about/i,
];

const NEGATIVE_UNSUBSCRIBE_PATTERNS = [
  /unsubscribe/i,
  /remove (me|my (email|address)) from/i,
  /stop (emailing|contacting|sending)/i,
  /do not (contact|email|send)/i,
  /opt.?out/i,
  /take me off/i,
];

const NEGATIVE_NOT_INTERESTED_PATTERNS = [
  /not interested/i,
  /no thank(s| you)/i,
  /don'?t (need|want|have a need)/i,
  /not (a good fit|relevant|looking)/i,
  /pass on this/i,
  /not (right|the right) (time|fit)/i,
];

const NEGATIVE_HOSTILE_PATTERNS = [
  /how did you get (my|this) (email|information)/i,
  /report (you|this|as spam)/i,
  /this is spam/i,
  /stop (spamming|harassing)/i,
  /do not (ever |)contact/i,
];

/**
 * Classify a reply using keyword pattern matching.
 * This is fast, deterministic, and transparent.
 * Returns null if no pattern matches (triggers LLM fallback).
 */
export function classifyByKeyword(text: string): ClassificationResult | null {
  if (!text || text.trim().length < 5) return null;

  const t = text.toLowerCase();

  // OOO first (often contains other words)
  if (NEUTRAL_OOO_PATTERNS.some((p) => p.test(t))) {
    return makeResult("neutral_ooo", 0.95, "keyword", 30, 20, 20, "Out-of-office pattern detected");
  }

  // Unsubscribe (high confidence, important to catch)
  if (NEGATIVE_UNSUBSCRIBE_PATTERNS.some((p) => p.test(t))) {
    return makeResult("negative_unsubscribe", 0.97, "keyword", 20, 20, 10, "Unsubscribe request detected");
  }

  // Hostile
  if (NEGATIVE_HOSTILE_PATTERNS.some((p) => p.test(t))) {
    return makeResult("negative_hostile", 0.92, "keyword", 10, 10, 5, "Hostile / spam complaint pattern detected");
  }

  // Positive interested
  if (POSITIVE_INTERESTED_PATTERNS.some((p) => p.test(t))) {
    return makeResult("positive_interested", 0.88, "keyword", 80, 70, 75, "Positive interest signals detected");
  }

  // Referral
  if (POSITIVE_REFERRAL_PATTERNS.some((p) => p.test(t))) {
    return makeResult("positive_referral", 0.85, "keyword", 65, 60, 60, "Referral to another contact detected");
  }

  // Not interested
  if (NEGATIVE_NOT_INTERESTED_PATTERNS.some((p) => p.test(t))) {
    return makeResult("negative_not_interested", 0.90, "keyword", 25, 30, 20, "Not interested signal detected");
  }

  // Info request
  if (NEUTRAL_INFO_PATTERNS.some((p) => p.test(t))) {
    return makeResult("neutral_info_request", 0.80, "keyword", 55, 50, 50, "Information request detected");
  }

  return null; // No pattern matched
}

/**
 * Classify using OpenClaw LLM endpoint.
 * Falls back to 'unknown' if unavailable.
 */
export async function classifyByLLM(
  text: string,
  openclawUrl: string
): Promise<ClassificationResult> {
  try {
    const prompt = buildClassificationPrompt(text);
    const res = await fetch(`${openclawUrl}/classify/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, prompt }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`OpenClaw HTTP ${res.status}`);

    const data = await res.json();
    return {
      classification: data.classification as ReplyClassification,
      confidence: data.confidence ?? 0.7,
      method: "llm",
      factor_1_icp_fit: data.factor_1 ?? 50,
      factor_2_timing: data.factor_2 ?? 50,
      factor_3_offer_strength: data.factor_3 ?? 50,
      reasoning: data.reasoning ?? "LLM classification",
      is_inference: true,
    };
  } catch (err: any) {
    return makeResult("unknown", 0.1, "fallback", 50, 50, 50, `LLM unavailable: ${err.message}`);
  }
}

/**
 * Primary classification entry point.
 * Tries keyword first, falls back to LLM if needed.
 */
export async function classifyReply(
  text: string,
  openclawUrl?: string
): Promise<ClassificationResult> {
  // 1. Try keyword matching
  const keywordResult = classifyByKeyword(text);
  if (keywordResult && keywordResult.confidence >= 0.8) {
    return keywordResult;
  }

  // 2. Try LLM if available
  if (openclawUrl) {
    return classifyByLLM(text, openclawUrl);
  }

  // 3. Fallback
  return keywordResult ?? makeResult("unknown", 0.1, "fallback", 50, 50, 50, "No classifier available");
}

export function computeReplyQuality(
  items: Array<ReplyClassification | ClassificationResult | { classification?: ReplyClassification }>
): ReplyQualityBreakdown {
  const by: Record<ReplyClassification, number> = {
    positive_interested: 0,
    positive_referral: 0,
    neutral_info_request: 0,
    neutral_ooo: 0,
    negative_not_interested: 0,
    negative_unsubscribe: 0,
    negative_hostile: 0,
    auto_reply: 0,
    unknown: 0,
  };

  for (const item of items || []) {
    const cls = (typeof item === "string"
      ? item
      : (item as any)?.classification || "unknown") as ReplyClassification;
    by[cls] = (by[cls] || 0) + 1;
  }

  const total = Object.values(by).reduce((sum, n) => sum + n, 0);
  if (total === 0) {
    return {
      total_replies: 0,
      by_classification: by,
      quality_score: 0,
      factor_1_icp_fit: 0,
      factor_2_timing: 0,
      factor_3_offer_strength: 0,
    };
  }

  const positive = by.positive_interested + by.positive_referral;
  const negative = by.negative_not_interested + by.negative_unsubscribe + by.negative_hostile;
  const quality = Math.round(((positive * 1 + (total - positive - negative) * 0.3) / total) * 100);

  return {
    total_replies: total,
    by_classification: by,
    quality_score: Math.max(0, Math.min(100, quality)),
    factor_1_icp_fit: Math.max(0, Math.min(100, Math.round((positive / total) * 100))),
    factor_2_timing: 50,
    factor_3_offer_strength: 50,
  };
}

// ─── Internal helpers ───

function makeResult(
  classification: ReplyClassification,
  confidence: number,
  method: "keyword" | "llm" | "fallback",
  f1: number,
  f2: number,
  f3: number,
  reasoning: string
): ClassificationResult {
  return {
    classification,
    confidence,
    method,
    factor_1_icp_fit: f1,
    factor_2_timing: f2,
    factor_3_offer_strength: f3,
    reasoning,
    is_inference: true,
  };
}

function buildClassificationPrompt(text: string): string {
  return `Classify this email reply into exactly one of these categories:
- positive_interested: Shows buying intent, wants to connect
- positive_referral: Refers to another contact
- neutral_info_request: Asks for more information
- neutral_ooo: Out of office or auto-reply
- negative_not_interested: Politely declines
- negative_unsubscribe: Requests removal from list
- negative_hostile: Angry, spam complaint
- auto_reply: Automated system reply
- unknown: Cannot determine

Also estimate on a 0-100 scale:
- factor_1: ICP fit signals in the reply
- factor_2: Timing/market receptiveness signals
- factor_3: Offer strength signals

Reply: "${text.substring(0, 500)}"

Respond with JSON: { classification, confidence (0-1), factor_1, factor_2, factor_3, reasoning }`;
}
