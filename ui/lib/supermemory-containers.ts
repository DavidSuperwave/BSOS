// Supermemory container helpers for BSOS
import { searchInsights, addInsight, companyContainerTag } from "@/lib/supermemory-client";

const CONTAINER_DOMAINS = {
  "campaigns-copy": true,
  "replies-positive": true,
  "replies-negative": true,
  "icp-refinements": true,
  "deals-won": true,
  "deals-lost": true,
  "bounce-patterns": true,
  "infrastructure-health": true,
  "campaign-research": true,
} as const;

type DomainKey = keyof typeof CONTAINER_DOMAINS;

const SHARED_BENCHMARKS_CONTAINER = "shared:gtm:benchmarks";
const AGENT_NAME = "julian";

function normalizeSlug(slug: string): string {
  return (slug || "").trim().toLowerCase();
}

function normalizeDomain(domain: string): string {
  return (domain || "").trim().toLowerCase();
}

function isKnownDomain(domain: string): domain is DomainKey {
  return Object.prototype.hasOwnProperty.call(CONTAINER_DOMAINS, domain);
}

export function getContainerTag(companySlug: string, domain: string): string {
  const slug = normalizeSlug(companySlug);
  const normalizedDomain = normalizeDomain(domain);

  if (!slug) {
    throw new Error("companySlug is required");
  }

  if (normalizedDomain === "company" || normalizedDomain === "tenant") {
    return companyContainerTag(slug);
  }

  if (normalizedDomain === "agent" || normalizedDomain === "agent-memory") {
    return `agent:${AGENT_NAME}:${slug}`;
  }

  if (normalizedDomain === "benchmarks" || normalizedDomain === "shared:gtm:benchmarks") {
    return SHARED_BENCHMARKS_CONTAINER;
  }

  if (isKnownDomain(normalizedDomain)) {
    return `${slug}-${normalizedDomain}`;
  }

  // Safe fallback: route unknown domains into company tenant container.
  return companyContainerTag(slug);
}

export async function storeSkillOutput(params: {
  companySlug: string;
  domain: string;
  content: string;
  category?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const { companySlug, domain, content, category, metadata } = params;
  const containerTag = getContainerTag(companySlug, domain);

  if (!content?.trim()) {
    return;
  }

  await addInsight({
    content,
    containerTags: [containerTag],
    metadata: {
      company_slug: normalizeSlug(companySlug),
      domain: normalizeDomain(domain),
      category: category ?? normalizeDomain(domain),
      stored_at: new Date().toISOString(),
      ...(metadata ?? {}),
    },
  });
}

export async function retrieveContext(params: {
  companySlug: string;
  domain: string;
  query: string;
  limit?: number;
}): Promise<any[]> {
  const { companySlug, domain, query, limit = 8 } = params;
  const containerTag = getContainerTag(companySlug, domain);

  const result = await searchInsights({
    query,
    containerTags: [containerTag],
    limit,
  });

  if (Array.isArray(result)) {
    return result;
  }

  if (result && Array.isArray((result as any).data)) {
    return (result as any).data;
  }

  if (result && Array.isArray((result as any).results)) {
    return (result as any).results;
  }

  return [];
}

export async function storeBenchmark(params: {
  content: string;
  category: string;
}): Promise<void> {
  const { content, category } = params;

  if (!content?.trim()) {
    return;
  }

  await addInsight({
    content,
    containerTags: [SHARED_BENCHMARKS_CONTAINER],
    metadata: {
      category,
      source: "benchmark",
      stored_at: new Date().toISOString(),
    },
  });
}

export async function retrieveBenchmarks(query: string, limit = 8): Promise<any[]> {
  const result = await searchInsights({
    query,
    containerTags: [SHARED_BENCHMARKS_CONTAINER],
    limit,
  });

  if (Array.isArray(result)) {
    return result;
  }

  if (result && Array.isArray((result as any).data)) {
    return (result as any).data;
  }

  if (result && Array.isArray((result as any).results)) {
    return (result as any).results;
  }

  return [];
}

export function isUserFolder(containerTag: string): boolean {
  const tag = (containerTag || "").toLowerCase();

  // System-managed container patterns.
  if (tag.startsWith("company:")) return false;
  if (tag.startsWith("agent:julian:")) return false;
  if (tag === SHARED_BENCHMARKS_CONTAINER) return false;
  if (tag.endsWith("-campaigns-copy")) return false;
  if (tag.endsWith("-replies-positive")) return false;
  if (tag.endsWith("-replies-negative")) return false;
  if (tag.endsWith("-icp-refinements")) return false;
  if (tag.endsWith("-deals-won")) return false;
  if (tag.endsWith("-deals-lost")) return false;
  if (tag.endsWith("-bounce-patterns")) return false;
  if (tag.endsWith("-infrastructure-health")) return false;
  if (tag.endsWith("-campaign-research")) return false;

  return true;
}

export function listCompanyContainers(companySlug: string): string[] {
  const slug = normalizeSlug(companySlug);
  if (!slug) return [];

  const domainContainers = Object.keys(CONTAINER_DOMAINS).map((domain) => `${slug}-${domain}`);

  return [
    companyContainerTag(slug),
    `agent:${AGENT_NAME}:${slug}`,
    ...domainContainers,
  ];
}
