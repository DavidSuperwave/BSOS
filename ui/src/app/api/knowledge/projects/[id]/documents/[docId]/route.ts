import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { requireCompanyAccess } from "@/lib/api-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPERMEMORY_BASE = "https://api.supermemory.ai/v3";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type ProjectContext = {
  companySlug: string;
  containerTag: string;
  smKey: string;
};

async function getProjectContext(
  companyId: string,
  projectId: string
): Promise<ProjectContext | null> {
  const { data: project, error: projectError } = await supabase
    .from("knowledge_projects")
    .select("container_tag_suffix, companies!inner(slug)")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .single();

  if (projectError || !project) return null;

  const companySlug = (project.companies as any)?.slug || "default";
  const containerTag = `gtm_${companySlug}_project_${project.container_tag_suffix}`;

  const { data: company } = await supabase
    .from("companies")
    .select("integration_credentials")
    .eq("id", companyId)
    .single();

  const smKey =
    company?.integration_credentials?.supermemory_api_key ||
    envConfig.supermemory.apiKey();

  if (!smKey) return null;

  return {
    companySlug,
    containerTag,
    smKey,
  };
}

function mapDocument(raw: any, fallbackContainerTag: string) {
  return {
    id: raw?.id,
    title: raw?.title || raw?.metadata?.title || "Untitled",
    folder: raw?.metadata?.folder || "Unfiled",
    type: raw?.type || raw?.metadata?.type || "document",
    content: raw?.content || raw?.raw || "",
    raw: raw?.raw || null,
    metadata: raw?.metadata || {},
    containerTag:
      raw?.containerTag ||
      raw?.containerTags?.[0] ||
      fallbackContainerTag,
    createdAt: raw?.createdAt || raw?.metadata?.created_at || null,
    updatedAt: raw?.updatedAt || raw?.metadata?.updated_at || null,
  };
}

async function fetchMemory(smKey: string, docId: string) {
  const response = await fetch(`${SUPERMEMORY_BASE}/memories/${encodeURIComponent(docId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${smKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }
  return response.json();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id: projectId, docId } = await params;
    const body = await req.json();
    const { companyId, title, content, folder, metadata } = body ?? {};

    if (!companyId || !docId) {
      return NextResponse.json(
        { error: "Company ID and document ID are required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    const context = await getProjectContext(companyId, projectId);
    if (!context) {
      return NextResponse.json(
        { error: "Project not found or Supermemory is not configured" },
        { status: 404 }
      );
    }

    const currentDoc = await fetchMemory(context.smKey, docId);
    if (!currentDoc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (
      currentDoc?.metadata?.project_id &&
      String(currentDoc.metadata.project_id) !== String(projectId)
    ) {
      return NextResponse.json(
        { error: "Document does not belong to this project" },
        { status: 403 }
      );
    }

    const mergedMetadata = {
      ...(currentDoc?.metadata || {}),
      ...(metadata && typeof metadata === "object" ? metadata : {}),
      ...(typeof title === "string" ? { title } : {}),
      ...(typeof folder === "string" && folder.trim() ? { folder: folder.trim() } : {}),
      updated_at: new Date().toISOString(),
    };

    const patchBody: Record<string, any> = {
      metadata: mergedMetadata,
    };

    if (typeof content === "string") {
      patchBody.content = content;
    }

    const patchResponse = await fetch(
      `${SUPERMEMORY_BASE}/memories/${encodeURIComponent(docId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${context.smKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patchBody),
      }
    );

    if (!patchResponse.ok) {
      const details = await patchResponse.text();
      return NextResponse.json(
        { error: "Failed to update document", details },
        { status: 502 }
      );
    }

    const updated = await fetchMemory(context.smKey, docId);
    if (!updated) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({
      document: mapDocument(updated, context.containerTag),
    });
  } catch (err: any) {
    console.error("[Project Document API] PATCH error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update document" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id: projectId, docId } = await params;
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");

    if (!companyId || !docId) {
      return NextResponse.json(
        { error: "Company ID and document ID are required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    const context = await getProjectContext(companyId, projectId);
    if (!context) {
      return NextResponse.json(
        { error: "Project not found or Supermemory is not configured" },
        { status: 404 }
      );
    }

    const currentDoc = await fetchMemory(context.smKey, docId);
    if (currentDoc?.metadata?.project_id) {
      if (String(currentDoc.metadata.project_id) !== String(projectId)) {
        return NextResponse.json(
          { error: "Document does not belong to this project" },
          { status: 403 }
        );
      }
    }

    const deleteResponse = await fetch(
      `${SUPERMEMORY_BASE}/memories/${encodeURIComponent(docId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${context.smKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!deleteResponse.ok) {
      const details = await deleteResponse.text();
      return NextResponse.json(
        { error: "Failed to delete document", details },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Project Document API] DELETE error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete document" },
      { status: 500 }
    );
  }
}
