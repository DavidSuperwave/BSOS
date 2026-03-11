/**
 * Knowledge Base Tools for Agents
 *
 * These tools allow agents to create, update, and manage documents
 * in the tag-based Knowledge Base.
 */

import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { companyContainerTag } from "@/lib/supermemory-client";
import { autoTag } from "@/lib/knowledge/auto-tagger";
import type { PrimaryTag, RelationshipMetadata } from "@/lib/supermemory/client";
import { getLinkedArtifacts } from "./linker";

const SUPERMEMORY_BASE = "https://api.supermemory.ai/v3";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
}

// Tool Context
interface ToolContext {
  companyId: string;
  companySlug: string;
  sessionKey: string;
  agentType: string;
  userId?: string;
}

// Tool Result
interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Get company Supermemory credentials
 */
async function getCompanyAuth(companyId: string) {
  const { data: company, error } = await getSupabase()
    .from("companies")
    .select("slug, integration_credentials")
    .eq("id", companyId)
    .single();

  if (error || !company) {
    return { error: "Company not found" };
  }

  const smKey =
    company.integration_credentials?.supermemory_api_key ||
    envConfig.supermemory.apiKey();

  if (!smKey) {
    return { error: "Supermemory not configured" };
  }

  return { smKey, slug: company.slug };
}

/**
 * Sync a document reference to the knowledge_document_refs cache table.
 */
async function syncDocumentRef(opts: {
  companyId: string;
  projectId?: string;
  smDocId: string;
  title: string;
  primaryTag: string;
  secondaryTags: string[];
  relationships?: RelationshipMetadata;
}) {
  try {
    await getSupabase()
      .from("knowledge_document_refs")
      .upsert(
        {
          company_id: opts.companyId,
          project_id: opts.projectId || null,
          supermemory_doc_id: opts.smDocId,
          supermemory_container_tag: "",
          title: opts.title,
          tags_primary: opts.primaryTag,
          tags_secondary: opts.secondaryTags,
          relationships_derived_from: opts.relationships?.derived_from || [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,supermemory_doc_id" }
      );
  } catch {
    // Non-blocking cache sync
  }
}

async function getDocumentRelationships(params: {
  companyId: string;
  docId: string;
}): Promise<{
  derived_from: Array<{ id: string; title: string }>;
  related_to: Array<{ id: string; title: string }>;
  used_in: Array<{ id: string; title: string }>;
}> {
  const empty = {
    derived_from: [] as Array<{ id: string; title: string }>,
    related_to: [] as Array<{ id: string; title: string }>,
    used_in: [] as Array<{ id: string; title: string }>,
  };

  const linked = await getLinkedArtifacts({
    companyId: params.companyId,
    artifactType: "document",
    artifactId: params.docId,
    direction: "both",
    supabase: getSupabase(),
  });

  if (linked.length === 0) return empty;

  const ids = linked.map((item) => item.id);
  const { data } = await getSupabase()
    .from("knowledge_document_refs")
    .select("supermemory_doc_id, title")
    .in("supermemory_doc_id", ids);

  const titleMap = new Map<string, string>(
    (data || []).map((row: any) => [row.supermemory_doc_id, row.title || row.supermemory_doc_id])
  );

  for (const item of linked) {
    const entry = {
      id: item.id,
      title: titleMap.get(item.id) || item.id,
    };

    if (item.relation === "derived_from") {
      empty.derived_from.push(entry);
    } else if (item.relation === "references" || item.relation === "supersedes") {
      empty.related_to.push(entry);
    } else {
      empty.used_in.push(entry);
    }
  }

  return empty;
}

/**
 * TOOL: create_document
 * Create a new document with tag-based organization
 */
export async function createDocumentTool(
  params: {
    title: string;
    content: string;
    primary_tag?: PrimaryTag;
    secondary_tags?: string[];
    type?: "note" | "analysis" | "playbook" | "insight" | "research";
    auto_tag?: boolean;
    derived_from?: string[];
    related_to?: string[];
    // Legacy support
    folder?: string;
    relatedCampaignIds?: string[];
    relatedLeadIds?: string[];
  },
  context: ToolContext
): Promise<ToolResult> {
  try {
    const auth = await getCompanyAuth(context.companyId);
    if (auth.error) return { success: false, error: auth.error };

    const containerTag = companyContainerTag(auth.slug);
    const docType = params.type || "note";

    // Resolve tags — use provided, auto-tag, or derive from legacy folder
    let primaryTag: PrimaryTag = params.primary_tag || "research";
    let secondaryTags: string[] = params.secondary_tags || [];

    if (!params.primary_tag && (params.auto_tag !== false)) {
      const suggested = await autoTag({
        title: params.title,
        content: params.content,
      });
      primaryTag = suggested.primary;
      if (secondaryTags.length === 0) {
        secondaryTags = suggested.secondary;
      }
    }

    // Build relationships
    const relationships: RelationshipMetadata = {};
    if (params.derived_from?.length) relationships.derived_from = params.derived_from;
    if (params.related_to?.length) relationships.related_to = params.related_to;

    // Legacy folder for backward compat
    const folder = params.folder || primaryTag;

    const response = await fetch(`${SUPERMEMORY_BASE}/memories`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.smKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: params.content,
        containerTag,
        metadata: {
          title: params.title,
          folder,
          type: docType,
          category: folder.toLowerCase().replace(/\s+/g, "_"),
          tags: {
            primary: primaryTag,
            secondary: secondaryTags,
            stage: "draft",
          },
          relationships,
          created_by: "agent",
          created_by_agent: context.agentType,
          source: "chat",
          source_session_key: context.sessionKey,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
          ...(params.relatedCampaignIds?.length && {
            related_campaign_ids: params.relatedCampaignIds,
          }),
          ...(params.relatedLeadIds?.length && {
            related_lead_ids: params.relatedLeadIds,
          }),
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Supermemory error: ${errorText}` };
    }

    const result = await response.json();

    // Log tool execution
    await logToolExecution(context, "create_document", params, result);

    // Sync to document refs cache
    syncDocumentRef({
      companyId: context.companyId,
      smDocId: result.id,
      title: params.title,
      primaryTag,
      secondaryTags,
      relationships,
    });

    return {
      success: true,
      data: {
        documentId: result.id,
        title: params.title,
        folder,
        tags: { primary: primaryTag, secondary: secondaryTags, stage: "draft" },
        relationships,
        url: `/knowledge?doc=${result.id}`,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * TOOL: update_document
 * Update an existing document
 */
export async function updateDocumentTool(
  params: {
    document_id: string;
    content?: string;
    title?: string;
    primary_tag?: PrimaryTag;
    secondary_tags?: string[];
    derived_from?: string[];
    related_to?: string[];
    // Legacy
    folder?: string;
  },
  context: ToolContext
): Promise<ToolResult> {
  try {
    const auth = await getCompanyAuth(context.companyId);
    if (auth.error) return { success: false, error: auth.error };

    // First, get the existing document
    const getResponse = await fetch(
      `${SUPERMEMORY_BASE}/memories/${encodeURIComponent(params.document_id)}`,
      {
        headers: {
          Authorization: `Bearer ${auth.smKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!getResponse.ok) {
      return { success: false, error: "Document not found" };
    }

    const existingDoc = await getResponse.json();
    const existingMetadata = existingDoc.metadata || {};

    // Build update payload
    const updateBody: any = {};
    const newMetadata: any = { ...existingMetadata };

    if (params.content) {
      updateBody.content = params.content;
    }

    if (params.title) {
      newMetadata.title = params.title;
    }

    if (params.folder) {
      newMetadata.folder = params.folder;
      newMetadata.category = params.folder.toLowerCase().replace(/\s+/g, "_");
    }

    // Update tags if provided
    if (params.primary_tag || params.secondary_tags) {
      const existingTags = existingMetadata.tags || {};
      newMetadata.tags = {
        ...existingTags,
        ...(params.primary_tag && { primary: params.primary_tag }),
        ...(params.secondary_tags && { secondary: params.secondary_tags }),
      };
      // Keep folder in sync with primary tag
      if (params.primary_tag && !params.folder) {
        newMetadata.folder = params.primary_tag;
      }
    }

    // Update relationships if provided
    if (params.derived_from || params.related_to) {
      const existingRel = existingMetadata.relationships || {};
      newMetadata.relationships = {
        ...existingRel,
        ...(params.derived_from && { derived_from: params.derived_from }),
        ...(params.related_to && { related_to: params.related_to }),
      };
    }

    // Always update these fields
    newMetadata.updated_at = new Date().toISOString();
    newMetadata.version = (existingMetadata.version || 1) + 1;
    newMetadata.last_updated_by = context.agentType;
    newMetadata.update_history = [
      ...(existingMetadata.update_history || []),
      {
        timestamp: new Date().toISOString(),
        agent: context.agentType,
        session_key: context.sessionKey,
        changes: Object.keys(params).filter((k) => k !== "document_id"),
      },
    ];

    updateBody.metadata = newMetadata;

    const response = await fetch(
      `${SUPERMEMORY_BASE}/memories/${encodeURIComponent(params.document_id)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${auth.smKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Update failed: ${errorText}` };
    }

    const result = await response.json();

    await logToolExecution(context, "update_document", params, result);

    const tags = newMetadata.tags || existingMetadata.tags;
    const relationships = newMetadata.relationships || existingMetadata.relationships;

    // Sync to document refs cache
    syncDocumentRef({
      companyId: context.companyId,
      smDocId: params.document_id,
      title: newMetadata.title || existingMetadata.title,
      primaryTag: tags?.primary || "research",
      secondaryTags: tags?.secondary || [],
      relationships,
    });

    return {
      success: true,
      data: {
        documentId: params.document_id,
        title: newMetadata.title || existingMetadata.title,
        folder: newMetadata.folder || existingMetadata.folder,
        tags,
        relationships,
        version: newMetadata.version,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * TOOL: search_documents
 * Search for documents by content, primary tag, or secondary tags
 */
export async function searchDocumentsTool(
  params: {
    query: string;
    primary_tag?: PrimaryTag;
    secondary_tags?: string[];
    // Legacy
    folder?: string;
    limit?: number;
  },
  context: ToolContext
): Promise<ToolResult> {
  try {
    const auth = await getCompanyAuth(context.companyId);
    if (auth.error) return { success: false, error: auth.error };

    const containerTag = companyContainerTag(auth.slug);
    const limit = params.limit || 5;

    // Build search body
    const searchBody: any = {
      q: params.query,
      containerTags: [containerTag],
      limit,
    };

    // Build filters
    const andFilters: any[] = [];

    // Tag-based filtering (preferred)
    if (params.primary_tag) {
      andFilters.push({
        key: "tags.primary",
        value: params.primary_tag,
        filterType: "string",
      });
    }

    if (params.secondary_tags?.length) {
      for (const tag of params.secondary_tags) {
        andFilters.push({
          key: "tags.secondary",
          value: tag,
          filterType: "array_contains",
        });
      }
    }

    // Legacy folder filter fallback
    if (!params.primary_tag && params.folder && params.folder !== "All Documents") {
      andFilters.push({
        key: "folder",
        value: params.folder,
        filterType: "string",
      });
    }

    if (andFilters.length > 0) {
      searchBody.filters = { AND: andFilters };
    }

    const response = await fetch(`${SUPERMEMORY_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.smKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Search failed: ${errorText}` };
    }

    const data = await response.json();

    // Transform results
    const results = (data.results || []).map((r: any) => ({
      id: r.id,
      title: r.metadata?.title || "Untitled",
      folder: r.metadata?.folder || "Unfiled",
      type: r.metadata?.type || "document",
      tags: r.metadata?.tags || null,
      relationships: r.metadata?.relationships || null,
      content: r.chunks?.[0]?.content || r.memory || "",
      preview: (r.chunks?.[0]?.content || r.memory || "").slice(0, 200) + "...",
      relevance: r.score || r.similarity || 0,
      updatedAt: r.metadata?.updated_at || r.metadata?.created_at,
    }));

    return {
      success: true,
      data: {
        query: params.query,
        primary_tag: params.primary_tag,
        folder: params.folder,
        count: results.length,
        results,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * TOOL: get_document
 * Get full document content
 */
export async function getDocumentTool(
  params: {
    document_id: string;
  },
  context: ToolContext
): Promise<ToolResult> {
  try {
    const auth = await getCompanyAuth(context.companyId);
    if (auth.error) return { success: false, error: auth.error };

    const response = await fetch(
      `${SUPERMEMORY_BASE}/memories/${encodeURIComponent(params.document_id)}`,
      {
        headers: {
          Authorization: `Bearer ${auth.smKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return { success: false, error: "Document not found" };
    }

    const doc = await response.json();

    return {
      success: true,
      data: {
        id: doc.id,
        title: doc.metadata?.title || "Untitled",
        folder: doc.metadata?.folder || "Unfiled",
        type: doc.metadata?.type || "document",
        tags: doc.metadata?.tags || null,
        relationships: doc.metadata?.relationships || null,
        content: doc.content || doc.raw || "",
        metadata: doc.metadata,
        createdAt: doc.metadata?.created_at,
        updatedAt: doc.metadata?.updated_at,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * TOOL: get_document_with_context
 * Fetch a document along with its resolved relationships
 */
export async function getDocumentWithContextTool(
  params: {
    document_id: string;
  },
  context: ToolContext
): Promise<ToolResult> {
  try {
    const auth = await getCompanyAuth(context.companyId);
    if (auth.error) return { success: false, error: auth.error };

    const containerTag = companyContainerTag(auth.slug);

    // Fetch document
    const response = await fetch(
      `${SUPERMEMORY_BASE}/memories/${encodeURIComponent(params.document_id)}`,
      {
        headers: {
          Authorization: `Bearer ${auth.smKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return { success: false, error: "Document not found" };
    }

    const doc = await response.json();

    // Resolve relationships
    const relationships = await getDocumentRelationships({
      companyId: context.companyId,
      docId: params.document_id,
    });

    return {
      success: true,
      data: {
        id: doc.id,
        title: doc.metadata?.title || "Untitled",
        folder: doc.metadata?.folder || "Unfiled",
        type: doc.metadata?.type || "document",
        tags: doc.metadata?.tags || null,
        content: doc.content || doc.raw || "",
        metadata: doc.metadata,
        relationships,
        createdAt: doc.metadata?.created_at,
        updatedAt: doc.metadata?.updated_at,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * TOOL: list_tags (replaces list_folders)
 * List primary tags with document counts, plus secondary tag aggregates
 */
export async function listTagsTool(
  _params: {},
  context: ToolContext
): Promise<ToolResult> {
  try {
    const auth = await getCompanyAuth(context.companyId);
    if (auth.error) return { success: false, error: auth.error };

    const containerTag = companyContainerTag(auth.slug);

    // Search for all documents
    const response = await fetch(`${SUPERMEMORY_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.smKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: "*",
        containerTags: [containerTag],
        limit: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `List failed: ${errorText}` };
    }

    const data = await response.json();
    const results = data.results || [];

    // Aggregate by primary tag
    const tagCounts: Record<string, { count: number; types: Set<string> }> = {};
    const secondaryTagCounts: Record<string, number> = {};

    // Also track legacy folders for backward compat
    const folderCounts: Record<string, { count: number; types: Set<string> }> = {};

    for (const doc of results) {
      const primary = doc.metadata?.tags?.primary || null;
      const secondary: string[] = doc.metadata?.tags?.secondary || [];
      const folder = doc.metadata?.folder || "Unfiled";
      const docType = doc.metadata?.type || "document";

      if (primary) {
        if (!tagCounts[primary]) {
          tagCounts[primary] = { count: 0, types: new Set() };
        }
        tagCounts[primary].count++;
        tagCounts[primary].types.add(docType);
      }

      for (const tag of secondary) {
        secondaryTagCounts[tag] = (secondaryTagCounts[tag] || 0) + 1;
      }

      if (!folderCounts[folder]) {
        folderCounts[folder] = { count: 0, types: new Set() };
      }
      folderCounts[folder].count++;
      folderCounts[folder].types.add(docType);
    }

    const primaryTags = Object.entries(tagCounts).map(([name, d]) => ({
      name,
      documentCount: d.count,
      types: Array.from(d.types),
    }));

    const secondaryTags = Object.entries(secondaryTagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Legacy folders
    const folders = Object.entries(folderCounts).map(([name, d]) => ({
      name,
      documentCount: d.count,
      types: Array.from(d.types),
    }));
    folders.sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      data: {
        totalDocuments: results.length,
        primaryTags,
        secondaryTags,
        folders, // kept for backward compatibility
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Log tool execution for debugging/auditing
 */
async function logToolExecution(
  context: ToolContext,
  tool: string,
  params: any,
  result: any
) {
  try {
    await getSupabase().from("knowledge_tool_executions").insert({
      company_id: context.companyId,
      tool,
      params,
      result: result.id ? { id: result.id } : result,
      agent_type: context.agentType,
      session_key: context.sessionKey,
      executed_at: new Date().toISOString(),
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Execute a knowledge tool by name
 */
export async function executeKnowledgeTool(
  toolName: string,
  params: any,
  context: ToolContext
): Promise<ToolResult> {
  switch (toolName) {
    case "create_document":
      return createDocumentTool(params, context);
    case "update_document":
      return updateDocumentTool(params, context);
    case "search_documents":
      return searchDocumentsTool(params, context);
    case "get_document":
      return getDocumentTool(params, context);
    case "get_document_with_context":
      return getDocumentWithContextTool(params, context);
    case "list_tags":
      return listTagsTool(params, context);
    // Backward-compat alias
    case "list_folders":
      return listTagsTool(params, context);
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// Tool definitions for agent system prompts
export const knowledgeToolDefinitions = [
  {
    name: "create_document",
    description:
      "Create a new document in the Knowledge Base. Use this to save analysis, insights, playbooks, or research findings. Documents are organized by tags.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Document title (clear and descriptive)",
        },
        content: {
          type: "string",
          description: "Full document content in Markdown format",
        },
        primary_tag: {
          type: "string",
          enum: ["profile", "icp", "campaign", "research", "asset", "analysis"],
          description:
            "Primary tag for categorization. If omitted, auto-tagging will suggest one.",
        },
        secondary_tags: {
          type: "array",
          items: { type: "string" },
          description:
            'Optional secondary tags for cross-cutting classification (e.g., "playbook", "fintech", "case-study")',
        },
        type: {
          type: "string",
          enum: ["note", "analysis", "playbook", "insight", "research"],
          description: "Document type for categorization",
        },
        auto_tag: {
          type: "boolean",
          description:
            "Set to false to skip auto-tagging when primary_tag is not provided. Defaults to true.",
        },
        derived_from: {
          type: "array",
          items: { type: "string" },
          description:
            "Document IDs this document is derived from (e.g., analysis derived from a research doc)",
        },
        related_to: {
          type: "array",
          items: { type: "string" },
          description:
            "Document IDs this document is related to (cross-reference)",
        },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_document",
    description:
      "Update an existing document's content, title, tags, or relationships.",
    parameters: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "The ID of the document to update",
        },
        content: {
          type: "string",
          description: "New content (only provide if changing)",
        },
        title: {
          type: "string",
          description: "New title (optional)",
        },
        primary_tag: {
          type: "string",
          enum: ["profile", "icp", "campaign", "research", "asset", "analysis"],
          description: "New primary tag (optional)",
        },
        secondary_tags: {
          type: "array",
          items: { type: "string" },
          description: "New secondary tags (replaces existing, optional)",
        },
        derived_from: {
          type: "array",
          items: { type: "string" },
          description: "Updated derived_from relationship IDs",
        },
        related_to: {
          type: "array",
          items: { type: "string" },
          description: "Updated related_to relationship IDs",
        },
      },
      required: ["document_id"],
    },
  },
  {
    name: "search_documents",
    description:
      "Search the Knowledge Base for documents by content. Can filter by primary tag or secondary tags.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - can be keywords or natural language",
        },
        primary_tag: {
          type: "string",
          enum: ["profile", "icp", "campaign", "research", "asset", "analysis"],
          description: "Optional: restrict search to a specific primary tag",
        },
        secondary_tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional: restrict search to documents with these secondary tags",
        },
        limit: {
          type: "number",
          default: 5,
          description: "Number of results to return (max 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_document",
    description: "Retrieve the full content of a specific document by ID.",
    parameters: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "The document ID",
        },
      },
      required: ["document_id"],
    },
  },
  {
    name: "get_document_with_context",
    description:
      "Retrieve a document along with its resolved relationships (derived_from, related_to, used_in) including titles of linked documents.",
    parameters: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "The document ID",
        },
      },
      required: ["document_id"],
    },
  },
  {
    name: "list_tags",
    description:
      "Get a list of all primary and secondary tags in the Knowledge Base with document counts.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];
