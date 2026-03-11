import fs from "fs";
import path from "path";
import { envConfig } from "@/lib/env";
import { BsosSupermemoryClient } from "@/lib/supermemory/client";
import { getSkillContext } from "@/lib/supermemory/profile-context";

// ── SOUL.md cache ────────────────────────────────────────────────
let soulMdCache: string | null = null;

function loadSoulMd(): string {
  if (soulMdCache !== null) return soulMdCache;
  try {
    const soulPath = path.join(process.cwd(), "src", "lib", "agents", "SOUL.md");
    soulMdCache = fs.readFileSync(soulPath, "utf8");
  } catch {
    soulMdCache = "";
  }
  return soulMdCache;
}

// ── Types ────────────────────────────────────────────────────────
interface PromptParams {
  agent: any;
  session: any;
  componentContext?: any;
  notesMarkdown?: string;
  /** Company data for profile injection */
  company?: {
    id: string;
    name: string;
    slug: string;
    industry?: string;
    onboarding_data?: Record<string, any>;
    integration_credentials?: Record<string, any>;
  } | null;
}

// ── Profile cache (per company, 5-min TTL) ───────────────────────
const profileCache = new Map<string, { text: string; ts: number }>();
const PROFILE_TTL_MS = 5 * 60 * 1000;

async function fetchCompanyProfile(slug: string): Promise<string> {
  const now = Date.now();
  const cached = profileCache.get(slug);
  if (cached && now - cached.ts < PROFILE_TTL_MS) return cached.text;
  return "";
}

// ── Prompt building blocks ───────────────────────────────────────

function baseContext(agent: any, company?: PromptParams["company"]): string {
  const agentName = agent?.agent_name || "Julian";
  const companyName = company?.name || "this company";

  const lines = [
    `You are ${agentName}, the AI Head of GTM Operations for ${companyName}.`,
    "",
    "Always scope recommendations to the active company context.",
  ];

  if (agent?.config?.supermemory_container) {
    lines.push(
      "",
      `Primary memory container: ${agent.config.supermemory_container}`,
      "Use knowledge search tools before making high-confidence recommendations."
    );
  }

  return lines.join("\n");
}

function mainAgentInstructions(): string {
  return [
    "## Main Agent Role",
    "- Optimize company-wide GTM outcomes.",
    "- Coordinate across campaigns, CRM, inbox, and knowledge.",
    "- Make strategic recommendations with clear trade-offs.",
  ].join("\n");
}

function campaignAgentInstructions(): string {
  return [
    "## Campaign Agent Role",
    "- Focus on campaign-level execution and optimization.",
    "- Prioritize sequence quality, targeting, and response rate improvements.",
    "- Avoid editing unrelated business context unless asked.",
  ].join("\n");
}

function inboxAgentInstructions(): string {
  return [
    "## Inbox Agent Role",
    "- Focus on reply interpretation and lead qualification.",
    "- Classify intent and recommend next-best follow-up action.",
    "- Highlight urgency and handoff requirements.",
  ].join("\n");
}

function sanitizeContextValue(value: unknown): string {
  const str = String(value || "").slice(0, 200);
  // Strip newlines and markdown heading markers to prevent prompt structure injection
  return str.replace(/[\n\r]/g, " ").replace(/^#+\s*/gm, "");
}

function contextBlock(componentContext?: any): string {
  if (!componentContext) return "";
  return [
    "## Current Context",
    `Component: ${sanitizeContextValue(componentContext.component || "unknown")}`,
    `Data: ${JSON.stringify(componentContext.data || {}, null, 2).slice(0, 4000)}`,
  ].join("\n");
}

function toolsBlock(agent: any): string {
  if (!Array.isArray(agent?.available_tools) || agent.available_tools.length === 0) return "";
  return ["## Available Tools", agent.available_tools.join(", ")].join("\n");
}

function companyProfileBlock(
  company?: PromptParams["company"],
  profileContent?: string
): string {
  if (!company) return "";

  // If we have a Supermemory profile, use that
  if (profileContent) {
    return [
      "## Company Profile (from Knowledge Base)",
      profileContent.slice(0, 3000),
    ].join("\n");
  }

  // Fallback: build a minimal profile from DB data
  const od = company.onboarding_data;
  if (!od) {
    return [
      "## Company Context",
      `Company: ${company.name}`,
      company.industry ? `Industry: ${company.industry}` : "",
      `Slug: ${company.slug}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "## Company Context",
    `Company: ${od.company_name || company.name}`,
    od.industry ? `Industry: ${od.industry}` : "",
    od.domain ? `Domain: ${od.domain}` : "",
    od.product_description ? `Product: ${od.product_description.slice(0, 300)}` : "",
    od.value_proposition ? `Value Prop: ${od.value_proposition.slice(0, 300)}` : "",
    od.icp_titles?.length ? `Target Titles: ${od.icp_titles.join(", ")}` : "",
    od.icp_verticals?.length ? `Target Verticals: ${od.icp_verticals.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Main export ──────────────────────────────────────────────────

export async function buildAgentSystemPrompt(params: PromptParams): Promise<string> {
  const agentType = String(
    params?.agent?.agent_type || params?.session?.session_type || "main"
  ).toLowerCase();

  // Load SOUL.md identity (cached from disk)
  const soulMd = loadSoulMd();

  // Fetch company profile from Supermemory (cached, non-blocking)
  let profileContent = "";
  if (params.company?.slug) {
    try {
      const apiKey =
        params.company.integration_credentials?.supermemory_api_key ||
        envConfig.supermemory.apiKey();

      if (apiKey) {
        const context = await getSkillContext({
          companySlug: params.company.slug,
          skillCategory: "agent",
          query: "company profile, ICP, onboarding summary, GTM strategy",
          supermemoryClient: BsosSupermemoryClient.getInstance(apiKey),
        });
        profileContent = context.systemPromptBlock;
        profileCache.set(params.company.slug, { text: profileContent, ts: Date.now() });
      } else {
        profileContent = await fetchCompanyProfile(params.company.slug);
      }
    } catch {
      // Non-blocking — fall back to DB data
      profileContent = await fetchCompanyProfile(params.company.slug);
    }
  }

  const roleBlock =
    agentType === "campaign" || agentType === "campaigns"
      ? campaignAgentInstructions()
      : agentType === "inbox"
      ? inboxAgentInstructions()
      : mainAgentInstructions();

  const notesBlock = params.notesMarkdown
    ? ["## Working Memory (NOTES.md)", params.notesMarkdown].join("\n")
    : "";

  return [
    // Identity first — SOUL.md defines who Julian is
    soulMd,
    // Then company-specific base context
    baseContext(params.agent, params.company),
    // Company profile from Supermemory or DB fallback
    companyProfileBlock(params.company, profileContent),
    // Role-specific instructions
    roleBlock,
    // Component context if in a specific UI view
    contextBlock(params.componentContext),
    // Available tools
    toolsBlock(params.agent),
    // Working memory
    notesBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}
