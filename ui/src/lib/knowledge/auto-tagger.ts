/**
 * Auto-Tagger Service
 *
 * Uses an LLM to suggest primary and secondary tags for documents
 * based on their title and content.
 */

import { envConfig } from "@/lib/env";
import type { PrimaryTag } from "@/lib/supermemory/storage";

const VALID_PRIMARY_TAGS: PrimaryTag[] = [
  "profile",
  "icp",
  "campaign",
  "research",
  "asset",
  "analysis",
];

interface AutoTagResult {
  primary: PrimaryTag;
  secondary: string[];
  confidence: number;
}

const SYSTEM_PROMPT = `You are a document classification engine for a GTM (go-to-market) knowledge base. Given a document title and content, return a JSON object with:

1. "primary" — exactly one of these tags:
   - "profile" — company profiles, org overviews, firmographics
   - "icp" — ideal customer profiles, buyer personas, targeting criteria
   - "campaign" — email campaigns, sequences, outbound content, campaign results
   - "research" — market research, competitive intel, industry analysis
   - "asset" — playbooks, templates, SOPs, reusable content
   - "analysis" — performance analysis, metrics reports, trend analysis

2. "secondary" — an array of 0-3 short descriptive tags (lowercase, no spaces, use hyphens). Examples: "case-study", "playbook", "competitor", "fintech", "series-a".

3. "confidence" — a number 0-1 indicating how confident you are.

Respond ONLY with valid JSON. No markdown, no explanation.`;

/**
 * Auto-tag a document based on its title and content.
 */
export async function autoTag({
  title,
  content,
}: {
  title: string;
  content: string;
}): Promise<AutoTagResult> {
  const truncatedContent = content.slice(0, 3000);
  const userPrompt = `Title: ${title}\n\nContent:\n${truncatedContent}`;

  // Try OpenRouter first, then Anthropic
  const openrouterKey = envConfig.openrouter.apiKey();
  const anthropicKey = envConfig.anthropic.apiKey();

  if (openrouterKey) {
    return callOpenRouter(openrouterKey, userPrompt);
  }
  if (anthropicKey) {
    return callAnthropic(anthropicKey, userPrompt);
  }

  // No LLM configured — use heuristic fallback
  return heuristicTag(title, content);
}

async function callOpenRouter(
  apiKey: string,
  userPrompt: string
): Promise<AutoTagResult> {
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "anthropic/claude-3.5-haiku",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 200,
          temperature: 0,
        }),
      }
    );

    if (!response.ok) {
      console.error("[AutoTagger] OpenRouter error:", response.status);
      return heuristicTag(userPrompt, "");
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    return parseTagResponse(text);
  } catch (err) {
    console.error("[AutoTagger] OpenRouter call failed:", err);
    return heuristicTag(userPrompt, "");
  }
}

async function callAnthropic(
  apiKey: string,
  userPrompt: string
): Promise<AutoTagResult> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      console.error("[AutoTagger] Anthropic error:", response.status);
      return heuristicTag(userPrompt, "");
    }

    const data = await response.json();
    const text =
      data.content?.[0]?.type === "text" ? data.content[0].text : "";
    return parseTagResponse(text);
  } catch (err) {
    console.error("[AutoTagger] Anthropic call failed:", err);
    return heuristicTag(userPrompt, "");
  }
}

function parseTagResponse(text: string): AutoTagResult {
  try {
    // Strip markdown fences if present
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const primary: PrimaryTag = VALID_PRIMARY_TAGS.includes(parsed.primary)
      ? parsed.primary
      : "research";

    const secondary: string[] = Array.isArray(parsed.secondary)
      ? parsed.secondary
          .filter((s: unknown) => typeof s === "string")
          .slice(0, 5)
      : [];

    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5;

    return { primary, secondary, confidence };
  } catch {
    return { primary: "research", secondary: [], confidence: 0 };
  }
}

/**
 * Keyword-based fallback when no LLM is available.
 */
function heuristicTag(title: string, content: string): AutoTagResult {
  const text = `${title} ${content}`.toLowerCase();

  if (/\b(persona|buyer|icp|ideal customer|targeting)\b/.test(text)) {
    return { primary: "icp", secondary: [], confidence: 0.4 };
  }
  if (/\b(campaign|sequence|outbound|email|subject line)\b/.test(text)) {
    return { primary: "campaign", secondary: [], confidence: 0.4 };
  }
  if (/\b(playbook|template|sop|checklist|guide)\b/.test(text)) {
    return { primary: "asset", secondary: [], confidence: 0.4 };
  }
  if (/\b(analysis|metric|performance|trend|report)\b/.test(text)) {
    return { primary: "analysis", secondary: [], confidence: 0.4 };
  }
  if (/\b(company|profile|overview|firmographic)\b/.test(text)) {
    return { primary: "profile", secondary: [], confidence: 0.4 };
  }

  return { primary: "research", secondary: [], confidence: 0.2 };
}
