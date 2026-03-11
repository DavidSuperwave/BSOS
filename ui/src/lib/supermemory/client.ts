import Supermemory from "supermemory";

type FlatMetadata = Record<string, string | number | boolean | string[]>;

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
  [key: string]: unknown;
}

export interface SearchDocumentResult {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  score: number;
}

interface LegacySearchFilters {
  primaryTag?: string;
  secondaryTags?: string[];
  stage?: string;
  relationships?: {
    derivedFrom?: string;
    relatedTo?: string;
    usedIn?: string;
  };
}

const instanceCache = new Map<string, BsosSupermemoryClient>();

export class BsosSupermemoryClient {
  private client: Supermemory;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new Supermemory({ apiKey });
  }

  static getInstance(apiKey?: string): BsosSupermemoryClient {
    const key = apiKey || process.env.SUPERMEMORY_API_KEY;
    if (!key) throw new Error("SUPERMEMORY_API_KEY is required");

    const cached = instanceCache.get(key);
    if (cached) return cached;

    const created = new BsosSupermemoryClient(key);
    instanceCache.set(key, created);
    return created;
  }

  get raw(): Supermemory {
    return this.client;
  }

  async addDocument(params: {
    content: string;
    containerTag: string;
    customId?: string;
    metadata?: Record<string, unknown>;
    entityContext?: string;
  }) {
    return this.client.add({
      content: params.content,
      containerTag: params.containerTag,
      customId: params.customId,
      metadata: normalizeMetadata(params.metadata),
      entityContext: params.entityContext,
    });
  }

  async updateDocument(
    docId: string,
    params: {
      content?: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    return this.client.documents.update(docId, {
      ...params,
      metadata: normalizeMetadata(params.metadata),
    });
  }

  async getDocument(docId: string) {
    const document = await this.client.documents.get(docId);
    return {
      ...document,
      metadata: denormalizeMetadata(document.metadata),
      content: String(document.content || document.raw || ""),
    };
  }

  async deleteDocument(docId: string) {
    return this.client.documents.delete(docId);
  }

  async bulkDelete(params: { ids?: string[]; containerTags?: string[] }) {
    return this.client.documents.deleteBulk(params);
  }

  async uploadFile(params: {
    file: Parameters<Supermemory["documents"]["uploadFile"]>[0]["file"];
    containerTag: string;
    metadata?: Record<string, unknown>;
    customId?: string;
    entityContext?: string;
  }) {
    return this.client.documents.uploadFile({
      file: params.file,
      containerTag: params.containerTag,
      metadata: normalizeMetadata(params.metadata),
      customId: params.customId,
      entityContext: params.entityContext,
    });
  }

  async batchAdd(params: {
    documents: Array<{
      content: string;
      containerTag: string;
      customId?: string;
      metadata?: Record<string, unknown>;
      entityContext?: string;
    }>;
  }) {
    if (typeof this.client.documents.batchAdd === "function") {
      return this.client.documents.batchAdd({
        documents: params.documents.map((document) => ({
          content: document.content,
          containerTag: document.containerTag,
          customId: document.customId,
          metadata: normalizeMetadata(document.metadata),
          entityContext: document.entityContext,
        })),
      });
    }

    const response = await fetch("https://api.supermemory.ai/v3/documents/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documents: params.documents.map((document) => ({
          content: document.content,
          containerTag: document.containerTag,
          customId: document.customId,
          metadata: normalizeMetadata(document.metadata),
          entityContext: document.entityContext,
        })),
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Batch add failed: ${response.status} ${details}`);
    }

    return response.json();
  }

  async searchDocuments(params: {
    q: string;
    containerTags?: string[];
    limit?: number;
    documentThreshold?: number;
    chunkThreshold?: number;
    rerank?: boolean;
    rewriteQuery?: boolean;
    includeFullDocs?: boolean;
    includeSummary?: boolean;
    onlyMatchingChunks?: boolean;
    filters?: LegacySearchFilters | Record<string, unknown>;
  }): Promise<{ results: SearchDocumentResult[]; total: number }> {
    const payload = await this.client.search.documents({
      q: params.q,
      containerTags: params.containerTags,
      limit: params.limit ?? 10,
      documentThreshold: params.documentThreshold,
      chunkThreshold: params.chunkThreshold,
      rerank: params.rerank ?? false,
      rewriteQuery: params.rewriteQuery ?? false,
      includeFullDocs: params.includeFullDocs,
      includeSummary: params.includeSummary,
      onlyMatchingChunks: params.onlyMatchingChunks,
      filters: buildSearchFilters(params.filters),
    });

    const results: SearchDocumentResult[] = Array.isArray(payload?.results)
      ? payload.results.map((row: any) => ({
          id: String(row.id || ""),
          content: String(row.chunks?.[0]?.content || row.memory || row.content || ""),
          metadata: denormalizeMetadata(row.metadata),
          score: Number(row.score || row.similarity || 0),
        }))
      : [];

    return {
      results,
      total: Number(payload?.total || payload?.count || results.length || 0),
    };
  }

  async searchMemories(params: {
    q: string;
    containerTag: string;
    limit?: number;
    threshold?: number;
    rerank?: boolean;
    rewriteQuery?: boolean;
    include?: {
      documents?: boolean;
      summaries?: boolean;
      relatedMemories?: boolean;
      forgottenMemories?: boolean;
    };
    filters?: any;
  }) {
    return this.client.search.memories({
      q: params.q,
      containerTag: params.containerTag,
      limit: params.limit ?? 10,
      threshold: params.threshold ?? 0.6,
      rerank: params.rerank ?? false,
      rewriteQuery: params.rewriteQuery ?? false,
      include: params.include,
      filters: params.filters,
    });
  }

  async getProfile(params: {
    containerTag: string;
    q?: string;
    threshold?: number;
    filters?: any;
  }) {
    return this.client.profile({
      containerTag: params.containerTag,
      q: params.q,
      threshold: params.threshold,
      filters: params.filters,
    });
  }

  async updateSettings(params: { shouldLLMFilter: boolean; filterPrompt: string }) {
    return this.client.settings.update(params);
  }

  async createConnection(
    provider:
      | "notion"
      | "google-drive"
      | "gmail"
      | "github"
      | "onedrive"
      | "web-crawler"
      | "s3",
    params: {
      redirectUrl: string;
      containerTags: string[];
      documentLimit?: number;
      metadata?: Record<string, string | number | boolean>;
    }
  ) {
    return this.client.connections.create(provider, params);
  }

  async listConnections(params: { containerTags?: string[] } = {}) {
    return this.client.connections.list(params);
  }

  async deleteConnection(connectionId: string) {
    return this.client.connections.deleteByID(connectionId);
  }
}

function normalizeMetadata(metadata?: Record<string, unknown>): FlatMetadata | undefined {
  if (!metadata) return undefined;

  const flat: FlatMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;

    if (key === "tags" && isRecord(value)) {
      const tags = value as Record<string, unknown>;
      if (typeof tags.primary === "string") flat["tags.primary"] = tags.primary;
      if (Array.isArray(tags.secondary)) {
        flat["tags.secondary"] = tags.secondary.filter(
          (item): item is string => typeof item === "string"
        );
      }
      if (typeof tags.vertical === "string") flat["tags.vertical"] = tags.vertical;
      if (typeof tags.stage === "string") flat["tags.stage"] = tags.stage;
      continue;
    }

    if (key === "relationships" && isRecord(value)) {
      const relationships = value as Record<string, unknown>;
      for (const [relationshipKey, relationshipValue] of Object.entries(relationships)) {
        if (typeof relationshipValue === "string") {
          flat[`relationships.${relationshipKey}`] = relationshipValue;
        } else if (Array.isArray(relationshipValue)) {
          flat[`relationships.${relationshipKey}`] = relationshipValue.filter(
            (item): item is string => typeof item === "string"
          );
        }
      }
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      flat[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      flat[key] = value.filter((item): item is string => typeof item === "string");
    }
  }

  return flat;
}

function buildSearchFilters(filters?: LegacySearchFilters | Record<string, unknown>) {
  if (!filters) return undefined;

  if ("AND" in filters || "OR" in filters) {
    return filters;
  }

  const legacy = filters as LegacySearchFilters;
  const andFilters: Array<Record<string, unknown>> = [];

  if (legacy.primaryTag) {
    andFilters.push({
      key: "tags.primary",
      value: legacy.primaryTag,
      filterType: "metadata",
    });
  }

  if (legacy.stage) {
    andFilters.push({
      key: "tags.stage",
      value: legacy.stage,
      filterType: "metadata",
    });
  }

  if (legacy.secondaryTags?.length) {
    for (const tag of legacy.secondaryTags) {
      andFilters.push({
        key: "tags.secondary",
        value: tag,
        filterType: "array_contains",
      });
    }
  }

  if (legacy.relationships?.derivedFrom) {
    andFilters.push({
      key: "relationships.derived_from",
      value: legacy.relationships.derivedFrom,
      filterType: "array_contains",
    });
  }

  if (legacy.relationships?.relatedTo) {
    andFilters.push({
      key: "relationships.related_to",
      value: legacy.relationships.relatedTo,
      filterType: "array_contains",
    });
  }

  if (legacy.relationships?.usedIn) {
    andFilters.push({
      key: "relationships.used_in",
      value: legacy.relationships.usedIn,
      filterType: "array_contains",
    });
  }

  return andFilters.length > 0 ? { AND: andFilters } : undefined;
}

function denormalizeMetadata(metadata?: Record<string, unknown>): DocumentMetadata {
  const normalized: Record<string, unknown> = {};
  const tags: Record<string, unknown> = isRecord(metadata?.tags)
    ? { ...(metadata?.tags as Record<string, unknown>) }
    : {};
  const relationships: Record<string, unknown> = isRecord(metadata?.relationships)
    ? { ...(metadata?.relationships as Record<string, unknown>) }
    : {};

  for (const [key, value] of Object.entries(metadata || {})) {
    if (key.startsWith("tags.")) {
      tags[key.replace("tags.", "")] = value;
      continue;
    }

    if (key.startsWith("relationships.")) {
      relationships[key.replace("relationships.", "")] = value;
      continue;
    }

    if (key !== "tags" && key !== "relationships") {
      normalized[key] = value;
    }
  }

  if (Object.keys(tags).length > 0) {
    normalized.tags = tags;
  }

  if (Object.keys(relationships).length > 0) {
    normalized.relationships = relationships;
  }

  return normalized as DocumentMetadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
