import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { projectContainerTag as buildProjectContainerTag } from "@/lib/supermemory-client";

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

/**
 * GET /api/knowledge/projects/[id]
 * 
 * Get single project details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID is required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    const { data: project, error } = await getSupabase()
      .from("knowledge_projects")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (error || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Get container tag
    const containerTag = await getProjectContainerTag(project.id);

    // Update last accessed
    await getSupabase()
      .from("knowledge_projects")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({
      project: {
        ...project,
        containerTag,
      },
    });
  } catch (err: any) {
    console.error("[Project API] GET error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch project" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/knowledge/projects/[id]
 * 
 * Update project
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { companyId, ...updates } = body;

    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID is required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    // Build update object
    const updateData: any = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.isShared !== undefined) updateData.is_shared = updates.isShared;
    if (updates.collaborators) updateData.collaborators = updates.collaborators;
    if (updates.folderStructure) updateData.folder_structure = updates.folderStructure;

    const { data: project, error } = await getSupabase()
      .from("knowledge_projects")
      .update(updateData)
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) {
      console.error("[Project API] Update error:", error);
      return NextResponse.json(
        { error: "Failed to update project" },
        { status: 500 }
      );
    }

    const containerTag = await getProjectContainerTag(project.id);

    return NextResponse.json({
      project: {
        ...project,
        containerTag,
      },
    });
  } catch (err: any) {
    console.error("[Project API] PATCH error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update project" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/knowledge/projects/[id]
 * 
 * Delete project and all its documents
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID is required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    // Get project details first
    const { data: project } = await getSupabase()
      .from("knowledge_projects")
      .select("container_tag_suffix")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // TODO: Delete all documents from Supermemory
    // This requires listing all docs and deleting them
    // For now, just delete the Supabase record

    const { error } = await getSupabase()
      .from("knowledge_projects")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      console.error("[Project API] Delete error:", error);
      return NextResponse.json(
        { error: "Failed to delete project" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Project API] DELETE error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete project" },
      { status: 500 }
    );
  }
}

/**
 * Get full container tag for a project
 */
async function getProjectContainerTag(projectId: string): Promise<string> {
  const { data } = await getSupabase()
    .from("knowledge_projects")
    .select(`
      container_tag_suffix,
      companies!inner(slug)
    `)
    .eq("id", projectId)
    .single();

  if (!data) return "";

  const companySlug = (data.companies as any)?.slug || "default";
  return buildProjectContainerTag(companySlug, data.container_tag_suffix);
}
