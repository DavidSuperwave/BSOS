import { BsosSkillCategory, BsosSearchConfig } from "../knowledge/types";
import { BsosSupermemoryClient } from "./client";
import {
  bsosCampaignContainerTag,
  bsosCompanyContainerTag,
  bsosLeadContainerTag,
} from "./bsos-tags";

const SEARCH_CONFIGS: Record<BsosSkillCategory, BsosSearchConfig> = {
  onboarding: { threshold: 0.4, rerank: false, rewriteQuery: false },
  daily_ops: { threshold: 0.6, rerank: true, rewriteQuery: false },
  lifecycle: { threshold: 0.7, rerank: true, rewriteQuery: true },
  agent: { threshold: 0.55, rerank: true, rewriteQuery: false },
};

const DEFAULT_FILTERS = {
  AND: [
    { key: "contamination_check_passed", value: "true" },
    { key: "confidence_status", value: "archived", negate: true },
  ],
};

export interface SkillContextResult {
  systemPromptBlock: string;
  staticFacts: string[];
  dynamicContext: string[];
  relevantMemories: string[];
  raw: unknown;
}

export async function getSkillContext(params: {
  companySlug: string;
  campaignId?: string;
  leadId?: string;
  skillCategory: BsosSkillCategory;
  query: string;
  supermemoryClient: BsosSupermemoryClient;
}): Promise<SkillContextResult> {
  const config = SEARCH_CONFIGS[params.skillCategory];

  let containerTag = bsosCompanyContainerTag(params.companySlug);
  if (params.campaignId) {
    containerTag = bsosCampaignContainerTag(params.companySlug, params.campaignId);
  } else if (params.leadId) {
    containerTag = bsosLeadContainerTag(params.companySlug, params.leadId);
  }

  const result = await params.supermemoryClient.getProfile({
    containerTag,
    q: params.query,
    threshold: config.threshold,
    filters: DEFAULT_FILTERS,
  });

  const staticFacts = result.profile?.static || [];
  const dynamicContext = result.profile?.dynamic || [];
  const relevantMemories =
    result.searchResults?.results?.map((row: any) => row.memory || row.content || "") || [];

  const systemPromptBlock = [
    "## Entity Context (from memory):",
    staticFacts.length > 0
      ? staticFacts.map((fact) => `- ${fact}`).join("\n")
      : "- No established facts yet.",
    "",
    "## Recent Activity:",
    dynamicContext.length > 0
      ? dynamicContext.map((item) => `- ${item}`).join("\n")
      : "- No recent context available.",
    "",
    "## Relevant Retrieved Context:",
    relevantMemories.length > 0
      ? relevantMemories.map((item) => `- ${item}`).join("\n")
      : "- No relevant memories found for this query.",
  ].join("\n");

  return {
    systemPromptBlock,
    staticFacts,
    dynamicContext,
    relevantMemories,
    raw: result,
  };
}
