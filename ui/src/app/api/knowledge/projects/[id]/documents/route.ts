import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { requireCompanyAccess } from "@/lib/api-auth";
import { autoTag } from "@/lib/knowledge/auto-tagger";
import { projectContainerTag } from "@/lib/supermemory-client";

let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase credentials not configured");
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const SUPERMEMORY_BASE = "https://api.supermemory.ai/v3";

function buildContainerTagVariants(companySlug: string, containerTagSuffix: string): string[] {
  // Use centralized function for the canonical tag
  const normalizedTag = projectContainerTag(companySlug, containerTagSuffix);
  return [normalizedTag];
}

async function fetchDocumentRefsFallback({
  companyId,
  projectId,
  limit,
  primaryTag,
  folder,
  containerTag,
}: {
  companyId: string;
  projectId: string;
  limit: number;
  primaryTag: string | null;
  folder: string | null;
  containerTag: string;
}) {
  let query = getSupabase()
    .from("knowledge_document_refs")
    .select(
      "supermemory_doc_id, title, tags_primary, tags_secondary, supermemory_container_tag, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (primaryTag) {
    query = query.eq("tags_primary", primaryTag);
  } else if (folder && folder !== "all") {
    // Legacy folder filtering maps to primary tag semantics in the new model.
    query = query.eq("tags_primary", folder);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => {
    const secondaryTags = Array.isArray(row.tags_secondary)
      ? row.tags_secondary.filter((tag) => typeof tag === "string")
      : [];
    const primary = row.tags_primary || "research";
    return {
      id: row.supermemory_doc_id,
      title: row.title || "Untitled",
      folder: primary,
      type: "document",
      // We only use refs as a visibility fallback, so content is intentionally lightweight.
      content: "",
      raw: null,
      metadata: {
        title: row.title || "Untitled",
        folder: primary,
        type: "document",
        tags: {
          primary,
          secondary: secondaryTags,
          stage: "draft",
        },
        source: "knowledge_document_refs",
      },
      containerTag: row.supermemory_container_tag || containerTag,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
    };
  });
}

/**
 * GET /api/knowledge/projects/[id]/documents
 * 
 * List all documents in a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    const folder = searchParams.get("folder");
    const primaryTag = searchParams.get("primaryTag");
    const includeHistory = searchParams.get("history") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);

    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID is required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    // Get project and verify access
    const { data: project, error: projectError } = await getSupabase()
      .from("knowledge_projects")
      .select("container_tag_suffix, companies!inner(slug)")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const companySlug = (project.companies as any)?.slug || "default";
    const containerTags = buildContainerTagVariants(companySlug, project.container_tag_suffix);
    const primaryContainerTag = containerTags[0] || "";

    // Get Supermemory key
    const { data: company } = await getSupabase()
      .from("companies")
      .select("integration_credentials")
      .eq("id", companyId)
      .single();

    const smKey =
      company?.integration_credentials?.supermemory_api_key ||
      envConfig.supermemory.apiKey();

    // If Supermemory is unavailable, fall back to the refs cache so users can still
    // see recently created documents in Vault.
    if (!smKey) {
      const fallbackDocuments = await fetchDocumentRefsFallback({
        companyId,
        projectId,
        limit,
        primaryTag,
        folder,
        containerTag: primaryContainerTag,
      });
      return NextResponse.json(
        {
          documents: fallbackDocuments,
          containerTag: primaryContainerTag,
          containerTags,
          folder,
          count: fallbackDocuments.length,
          total: fallbackDocuments.length,
          source: "refs_fallback",
          warning: "Supermemory not configured; returning cached references.",
        },
        { status: 200 }
      );
    }

    // Search for documents in project container
    const searchBody: any = {
      q: "*",
      containerTags,
      limit,
    };

    // Add tag-based or folder filter
    const andFilters: any[] = [];

    if (primaryTag) {
      andFilters.push({
        key: "tags.primary",
        value: primaryTag,
        filterType: "string",
      });
    } else if (folder && folder !== "all") {
      andFilters.push({
        key: "folder",
        value: folder,
        filterType: "string",
      });
    }

    if (andFilters.length > 0) {
      searchBody.filters = { AND: andFilters };
    }

    const response = await fetch(`${SUPERMEMORY_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${smKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Project Documents API] Search error:", errorText);
      const fallbackDocuments = await fetchDocumentRefsFallback({
        companyId,
        projectId,
        limit,
        primaryTag,
        folder,
        containerTag: primaryContainerTag,
      });
      if (fallbackDocuments.length > 0) {
        return NextResponse.json(
          {
            documents: fallbackDocuments,
            containerTag: primaryContainerTag,
            containerTags,
            folder,
            count: fallbackDocuments.length,
            total: fallbackDocuments.length,
            source: "refs_fallback",
            warning: `Supermemory search failed; returning cached references (${response.status}).`,
          },
          { status: 200 }
        );
      }
      return NextResponse.json(
        { error: "Failed to fetch documents from Supermemory", details: errorText },
        { status: 502 }
      );
    }

    const data = await response.json();

    // Transform results
    let documents = (data.results || []).map((r: any) => ({
      id: r.id,
      title: r.metadata?.title || "Untitled",
      folder: r.metadata?.folder || "Unfiled",
      type: r.metadata?.type || "document",
      content: r.chunks?.[0]?.content || r.memory || "",
      raw: r.memory,
      metadata: r.metadata,
      containerTag: r.containerTag || r.containerTags?.[0] || primaryContainerTag,
      createdAt: r.metadata?.created_at || r.createdAt,
      updatedAt: r.metadata?.updated_at || r.updatedAt,
    }));

    // Filter out superseded documents unless history view requested
    if (!includeHistory) {
      documents = documents.filter((d: any) => 
        d.metadata?.status !== 'superseded'
      );
    }

    if (documents.length === 0) {
      const fallbackDocuments = await fetchDocumentRefsFallback({
        companyId,
        projectId,
        limit,
        primaryTag,
        folder,
        containerTag: primaryContainerTag,
      });
      if (fallbackDocuments.length > 0) {
        return NextResponse.json({
          documents: fallbackDocuments,
          containerTag: primaryContainerTag,
          containerTags,
          folder,
          count: fallbackDocuments.length,
          total: fallbackDocuments.length,
          source: "refs_fallback",
          warning: "Supermemory returned no results; returning cached references.",
        });
      }
    }

    return NextResponse.json({
      documents,
      containerTag: primaryContainerTag,
      containerTags,
      folder,
      count: documents.length,
      total: data.total || data.count || documents.length,
      source: "supermemory",
    });
  } catch (err: any) {
    console.error("[Project Documents API] GET error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/knowledge/projects/[id]/documents
 * 
 * Create a new document in the project
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await req.json();
    const { companyId, title, content, type = "note", metadata = {} } = body;
    const rawMetadata =
      metadata && typeof metadata === "object" ? (metadata as Record<string, any>) : {};
    // folder is optional now — derive from primary tag
    let { folder } = body;

    if (!companyId || !title || !content) {
      return NextResponse.json(
        { error: "Company ID, title, and content are required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    // Get project
    const { data: project, error: projectError } = await getSupabase()
      .from("knowledge_projects")
      .select("container_tag_suffix, companies!inner(slug)")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const companySlug = (project.companies as any)?.slug || "default";
    const containerTags = buildContainerTagVariants(companySlug, project.container_tag_suffix);

    // Get Supermemory key
    const { data: company } = await getSupabase()
      .from("companies")
      .select("integration_credentials")
      .eq("id", companyId)
      .single();

    const smKey =
      company?.integration_credentials?.supermemory_api_key ||
      envConfig.supermemory.apiKey();

    if (!smKey) {
      return NextResponse.json(
        { error: "Supermemory not configured" },
        { status: 400 }
      );
    }

    // Auto-tag if tags not provided in metadata
    let tags = rawMetadata.tags;
    if (!tags || !tags.primary) {
      const suggested = await autoTag({ title, content });
      tags = {
        primary: suggested.primary,
        secondary: suggested.secondary,
        stage: "draft",
        ...tags, // let caller override individual fields
      };
    }

    // Derive folder from primary tag if not provided
    if (!folder) {
      folder = tags.primary || "Unfiled";
    }

    const relationships = rawMetadata.relationships || {};
    const documentMetadata = {
      ...rawMetadata,
      project_id: projectId,
      title,
      folder,
      type,
      category: folder.toLowerCase().replace(/\s+/g, "_"),
      tags,
      relationships,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    };
    const minimalMetadata = {
      project_id: projectId,
      title,
      folder,
      type,
      category: folder.toLowerCase().replace(/\s+/g, "_"),
      // Keep simple flat tags for maximum compatibility if nested metadata is rejected.
      tag_primary: tags.primary,
      tag_secondary: Array.isArray(tags.secondary) ? tags.secondary.join(",") : "",
      source: "gtm_engine_ui",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Create document in Supermemory.
    // We try both containerTag styles because different accounts/projects can have
    // slightly different tag formatting constraints.
    let result: any = null;
    let usedContainerTag = containerTags[0] || "";
    let lastError:
      | { status: number; details: string; containerTag: string; mode: string }
      | null =
      null;

    for (const candidateTag of containerTags) {
      const payloads: Array<{
        mode:
          | "containerTag:full"
          | "containerTags:full"
          | "containerTag:minimal"
          | "containerTags:minimal";
        body: Record<string, any>;
      }> = [
        {
          mode: "containerTag:full",
          body: {
            content,
            containerTag: candidateTag,
            metadata: documentMetadata,
          },
        },
        {
          mode: "containerTags:full",
          body: {
            content,
            containerTags: [candidateTag],
            metadata: documentMetadata,
          },
        },
        {
          mode: "containerTag:minimal",
          body: {
            content,
            containerTag: candidateTag,
            metadata: minimalMetadata,
          },
        },
        {
          mode: "containerTags:minimal",
          body: {
            content,
            containerTags: [candidateTag],
            metadata: minimalMetadata,
          },
        },
      ];

      for (const payload of payloads) {
        const response = await fetch(`${SUPERMEMORY_BASE}/memories`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${smKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload.body),
        });

        if (response.ok) {
          result = await response.json();
          usedContainerTag = candidateTag;
          break;
        }

        const details = await response.text();
        lastError = {
          status: response.status,
          details,
          containerTag: candidateTag,
          mode: payload.mode,
        };
      }

      if (result) break;
    }

    if (!result) {
      console.error("[Project Documents API] Create error:", lastError);
      return NextResponse.json(
        {
          error: lastError
            ? `Failed to create document (${lastError.status}, ${lastError.mode}, ${lastError.containerTag})`
            : "Failed to create document",
          details: lastError
            ? `Supermemory ${lastError.status} (${lastError.mode}, ${lastError.containerTag}): ${lastError.details}`
            : "Supermemory create request failed",
        },
        { status: 502 }
      );
    }

    // Update project document count (async, non-blocking)
    updateProjectDocumentCount(projectId);

    // Sync document ref cache (non-blocking)
    void (async () => {
      try {
        await getSupabase()
          .from("knowledge_document_refs")
          .upsert(
            {
              company_id: companyId,
              project_id: projectId,
              supermemory_doc_id: result.id,
              supermemory_container_tag: usedContainerTag,
              title,
              tags_primary: tags.primary,
              tags_secondary: tags.secondary || [],
              relationships_derived_from: relationships.derived_from || [],
              updated_at: new Date().toISOString(),
            },
            { onConflict: "project_id,supermemory_doc_id" }
          );
      } catch {
        // Non-critical cache sync
      }
    })();

    return NextResponse.json(
      {
        document: {
          id: result.id,
          title,
          folder,
          type,
          content,
          containerTag: usedContainerTag,
          metadata: {
            project_id: projectId,
            tags,
            relationships,
            ...rawMetadata,
          },
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[Project Documents API] POST error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create document" },
      { status: 500 }
    );
  }
}

/**
 * Update cached document count for project
 */
async function updateProjectDocumentCount(projectId: string) {
  try {
    // This is a placeholder - in production, you'd count from Supermemory
    // or use a trigger-based approach
    await getSupabase()
      .from("knowledge_projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", projectId);
  } catch {
    // Non-critical
  }
}
