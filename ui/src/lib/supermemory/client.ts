import Supermemory from "supermemory";

type FlatMetadata = Record<string, string | number | boolean | string[]>;

const instanceCache = new Map<string, BsosSupermemoryClient>();

export class BsosSupermemoryClient {
  private client: Supermemory;

  constructor(apiKey: string) {
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
    metadata?: FlatMetadata;
    entityContext?: string;
  }) {
    return this.client.add({
      content: params.content,
      containerTag: params.containerTag,
      customId: params.customId,
      metadata: params.metadata,
      entityContext: params.entityContext,
    });
  }

  async updateDocument(
    docId: string,
    params: {
      content?: string;
      metadata?: FlatMetadata;
    }
  ) {
    return this.client.documents.update(docId, params);
  }

  async getDocument(docId: string) {
    return this.client.documents.get(docId);
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
    metadata?: FlatMetadata;
    customId?: string;
    entityContext?: string;
  }) {
    return this.client.documents.uploadFile({
      file: params.file,
      containerTag: params.containerTag,
      metadata: params.metadata,
      customId: params.customId,
      entityContext: params.entityContext,
    });
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
    filters?: any;
  }) {
    return this.client.search.documents({
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
      filters: params.filters,
    });
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
