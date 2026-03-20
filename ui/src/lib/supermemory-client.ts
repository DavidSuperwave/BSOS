/**
 * Supermemory Client
 *
 * Wrapper for Supermemory v3 API with canonical project-scoped containerTags.
 * Replaces the old stub supermemory-namespace.ts.
 *
 * Canonical format: gtm_{companySlug}_project_{suffix}
 */

const SUPERMEMORY_BASE = "https://api.supermemory.ai/v3";

export type InsightCategory =
  | "company_profile"
  | "campaign_insight"
  | "icp_refinement"
  | "research_summary"
  | "reply_analysis"
  | "user_preference"
  | "tool_config"
  | "general";

export interface StoreInsightParams {
  content: string;
  category: InsightCategory;
  metadata?: Record<string, string | number | boolean>;
  /** Supabase reference for drill-back (e.g., batch_id, document_id) */
  sourceRef?: string;
  /** Custom ID for upsert behavior */
  customId?: string;
}

export interface SearchParams {
  query: string;
  category?: InsightCategory;
  limit?: number;
}

export interface SearchResult {
  id: string;
  content: string;
  similarity?: number;
  metadata?: Record<string, any>;
}

/**
 * Sanitize a string for use in Supermemory container tags.
 * Lowercases, strips non-alphanumeric (except underscore), collapses runs, trims.
 */
function sanitizeTagToken(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * @deprecated Use projectContainerTag() instead.
 * All Supermemory writes should use project-scoped containers.
 * This function produces gtm_{slug} which is a DIFFERENT container
 * from gtm_{slug}_project_general — they can't see each other's docs.
 */
export function companyContainerTag(slug: string): string {
  return `gtm_${sanitizeTagToken(slug)}`;
}

/**
 * Canonical container tag for all Supermemory operations.
 * Produces: gtm_{companySlug}_project_{suffix}
 *
 * This MUST match the DB function generate_project_container_tag()
 * and the knowledge_projects.container_tag_suffix values.
 *
 * @param companySlug - The company's slug (e.g., "blitzscale")
 * @param projectSuffix - The project suffix (e.g., "general", "icp", "campaigns")
 * @returns Container tag string (e.g., "gtm_blitzscale_project_general")
 */
export function projectContainerTag(
  companySlug: string,
  projectSuffix: string
): string {
  return `gtm_${sanitizeTagToken(companySlug)}_project_${sanitizeTagToken(projectSuffix)}`;
}

/**
 * Store an insight in Supermemory for a company.
 * Non-blocking — errors are logged but never thrown.
 */
export async function storeInsight(
  apiKey: string,
  containerTag: string,
  params: StoreInsightParams
): Promise<{ id: string } | null> {
  try {
    const metadata: Record<string, string | number | boolean> = {
      category: params.category,
      stored_at: new Date().toISOString(),
      ...params.metadata,
    };

    if (params.sourceRef) {
      metadata.source_ref = params.sourceRef;
    }

    const res = await fetch(`${SUPERMEMORY_BASE}/memories`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: params.content,
        containerTag,
        metadata,
        ...(params.customId ? { customId: params.customId } : {}),
      }),
    });

    if (!res.ok) {
      console.error(`[Supermemory] Store failed: ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("[Supermemory] Store error:", err);
    return null;
  }
}

/**
 * Search insights in Supermemory for a company.
 */
export async function searchInsights(
  apiKey: string,
  containerTag: string,
  params: SearchParams
): Promise<SearchResult[]> {
  try {
    const body: Record<string, any> = {
      q: params.query,
      containerTags: [containerTag],
      limit: params.limit || 10,
    };

    // Add metadata filter if category specified
    if (params.category) {
      body.filters = {
        AND: [
          {
            key: "category",
            value: params.category,
            filterType: "string",
          },
        ],
      };
    }

    const res = await fetch(`${SUPERMEMORY_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`[Supermemory] Search failed: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      id: r.id,
      content: r.chunks?.[0]?.content || r.memory || "",
      similarity: r.score || r.similarity,
      metadata: r.metadata,
    }));
  } catch (err) {
    console.error("[Supermemory] Search error:", err);
    return [];
  }
}

/**
 * Seed a company's Supermemory container with initial profile data.
 * Called during agent deployment.
 */
export async function seedCompanyProfile(
  apiKey: string,
  containerTag: string,
  profileContent: string,
  companyId: string
): Promise<void> {
  await storeInsight(apiKey, containerTag, {
    content: profileContent,
    category: "company_profile",
    customId: `company_profile_${companyId}`,
    metadata: {
      company_id: companyId,
      source: "onboarding",
    },
  });
}
