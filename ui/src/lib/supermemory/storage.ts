const SUPERMEMORY_BASE = "https://api.supermemory.ai/v3";

export type PrimaryTag =
  | "profile"
  | "icp"
  | "campaign"
  | "research"
  | "asset"
  | "analysis";

export interface TagMetadata {
  primary: PrimaryTag | string;
  secondary: string[];
  vertical?: string;
  stage?: string;
}

export interface RelationshipMetadata {
  derived_from?: string[];
  related_to?: string[];
  used_in?: string[];
  replaces?: string;
  analysis_of?: string[];
}

export interface DocumentMetadata {
  project_id: string;
  company_id: string;
  tags: TagMetadata;
  relationships?: RelationshipMetadata;
  title: string;
  type: string;
  source: string;
  created_at: string;
  updated_at: string;
  version: number;
  execution_id?: string;
  skill_id?: string;
  confidence?: number;
  review_status?: string;
}

export interface StoreDocumentParams {
  content: string;
  containerTag: string;
  customId?: string;
  metadata: DocumentMetadata;
}

export interface SearchParams {
  query: string;
  containerTags: string[];
  filters?: {
    primaryTag?: string;
    secondaryTags?: string[];
    stage?: string;
    relationships?: {
      derivedFrom?: string;
      relatedTo?: string;
      usedIn?: string;
    };
  };
  limit?: number;
}

export interface SearchDocumentResult {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  score: number;
}

function buildSearchFilters(filters?: SearchParams["filters"]) {
  if (!filters) return undefined;

  const andFilters: Array<Record<string, any>> = [];

  if (filters.primaryTag) {
    andFilters.push({
      key: "tags.primary",
      value: filters.primaryTag,
      filterType: "string",
    });
  }

  if (filters.stage) {
    andFilters.push({
      key: "tags.stage",
      value: filters.stage,
      filterType: "string",
    });
  }

  if (filters.secondaryTags && filters.secondaryTags.length > 0) {
    for (const tag of filters.secondaryTags) {
      andFilters.push({
        key: "tags.secondary",
        value: tag,
        filterType: "array_contains",
      });
    }
  }

  if (filters.relationships?.derivedFrom) {
    andFilters.push({
      key: "relationships.derived_from",
      value: filters.relationships.derivedFrom,
      filterType: "array_contains",
    });
  }

  if (filters.relationships?.relatedTo) {
    andFilters.push({
      key: "relationships.related_to",
      value: filters.relationships.relatedTo,
      filterType: "array_contains",
    });
  }

  if (filters.relationships?.usedIn) {
    andFilters.push({
      key: "relationships.used_in",
      value: filters.relationships.usedIn,
      filterType: "array_contains",
    });
  }

  if (andFilters.length === 0) return undefined;
  return { AND: andFilters };
}

export async function storeDocument(
  apiKey: string,
  params: StoreDocumentParams
): Promise<{ id: string; success: boolean }> {
  try {
    const response = await fetch(`${SUPERMEMORY_BASE}/memories`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: params.content,
        containerTag: params.containerTag,
        ...(params.customId ? { customId: params.customId } : {}),
        metadata: params.metadata,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("[SupermemoryStorage] storeDocument failed:", response.status, details);
      return { id: "", success: false };
    }

    const data = await response.json();
    return { id: String(data?.id || ""), success: true };
  } catch (error) {
    console.error("[SupermemoryStorage] storeDocument error:", error);
    return { id: "", success: false };
  }
}

export async function searchDocuments(
  apiKey: string,
  params: SearchParams
): Promise<{ results: SearchDocumentResult[]; total: number }> {
  try {
    const response = await fetch(`${SUPERMEMORY_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: params.query,
        containerTags: params.containerTags,
        limit: params.limit || 10,
        filters: buildSearchFilters(params.filters),
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("[SupermemoryStorage] searchDocuments failed:", response.status, details);
      return { results: [], total: 0 };
    }

    const payload = await response.json();
    const mapped: SearchDocumentResult[] = Array.isArray(payload?.results)
      ? payload.results.map((row: any) => ({
          id: row.id,
          content: row.chunks?.[0]?.content || row.memory || "",
          metadata: (row.metadata || {}) as DocumentMetadata,
          score: Number(row.score || row.similarity || 0),
        }))
      : [];

    const total = Number(payload?.total || payload?.count || mapped.length || 0);
    return { results: mapped, total };
  } catch (error) {
    console.error("[SupermemoryStorage] searchDocuments error:", error);
    return { results: [], total: 0 };
  }
}

export async function updateDocument(
  apiKey: string,
  docId: string,
  updates: Partial<DocumentMetadata>
): Promise<boolean> {
  try {
    const response = await fetch(`${SUPERMEMORY_BASE}/memories/${encodeURIComponent(docId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metadata: {
          ...updates,
          updated_at: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("[SupermemoryStorage] updateDocument failed:", response.status, details);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[SupermemoryStorage] updateDocument error:", error);
    return false;
  }
}

export async function getDocument(
  apiKey: string,
  docId: string
): Promise<{ id: string; content: string; metadata: DocumentMetadata } | null> {
  try {
    const response = await fetch(`${SUPERMEMORY_BASE}/memories/${encodeURIComponent(docId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("[SupermemoryStorage] getDocument failed:", response.status, details);
      return null;
    }

    const data = await response.json();
    return {
      id: String(data?.id || ""),
      content: String(data?.content || data?.raw || ""),
      metadata: (data?.metadata || {}) as DocumentMetadata,
    };
  } catch (error) {
    console.error("[SupermemoryStorage] getDocument error:", error);
    return null;
  }
}

export async function getDocumentRelationships(
  apiKey: string,
  containerTag: string,
  docId: string
): Promise<{
  derived_from: Array<{ id: string; title: string }>;
  related_to: Array<{ id: string; title: string }>;
  used_in: Array<{ id: string; title: string }>;
}> {
  const empty = {
    derived_from: [] as Array<{ id: string; title: string }>,
    related_to: [] as Array<{ id: string; title: string }>,
    used_in: [] as Array<{ id: string; title: string }>,
  };

  const seedDoc = await getDocument(apiKey, docId);
  if (!seedDoc) return empty;

  const rel = seedDoc.metadata?.relationships || {};
  const ids = [
    ...(rel.derived_from || []),
    ...(rel.related_to || []),
    ...(rel.used_in || []),
  ];

  if (ids.length === 0) return empty;

  const uniqueIds = Array.from(new Set(ids));
  const matches: Record<string, { id: string; title: string }> = {};

  for (const relatedId of uniqueIds) {
    const found = await searchDocuments(apiKey, {
      query: relatedId,
      containerTags: [containerTag],
      limit: 1,
    });
    const top = found.results[0];
    if (top) {
      matches[relatedId] = {
        id: top.id,
        title: top.metadata?.title || top.id,
      };
    } else {
      matches[relatedId] = {
        id: relatedId,
        title: relatedId,
      };
    }
  }

  return {
    derived_from: (rel.derived_from || []).map((id) => matches[id]).filter(Boolean),
    related_to: (rel.related_to || []).map((id) => matches[id]).filter(Boolean),
    used_in: (rel.used_in || []).map((id) => matches[id]).filter(Boolean),
  };
}
