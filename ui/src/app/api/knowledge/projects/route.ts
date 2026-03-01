import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { projectContainerTag as buildProjectContainerTag } from "@/lib/supermemory-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SUPERMEMORY_BASE = "https://api.supermemory.ai/v3";

// Project templates
const PROJECT_TEMPLATES = {
  vault: {
    name: "General Vault",
    description: "General purpose document storage",
    folderStructure: ["Documents", "Notes", "Reference"],
  },
  knowledge_base: {
    name: "Knowledge Base",
    description: "Organized knowledge with categories",
    folderStructure: ["ICP", "Campaigns", "Assets", "Analytics"],
  },
  deal_room: {
    name: "Deal Room",
    description: "M&A or transaction documents",
    folderStructure: ["Due Diligence", "Contracts", "Financials", "Legal", "Analysis"],
  },
  campaign: {
    name: "Campaign Project",
    description: "Marketing campaign workspace",
    folderStructure: ["Creative", "Copy", "Analytics", "Results", "Learnings"],
  },
  research: {
    name: "Research Project",
    description: "Market or competitor research",
    folderStructure: ["Sources", "Notes", "Analysis", "Reports"],
  },
};

/**
 * GET /api/knowledge/projects
 * 
 * List all projects for a company
 */
export async function GET(req: NextRequest) {
  try {
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

    const { data: projects, error } = await supabase
      .from("knowledge_projects")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[Projects API] Error fetching projects:", error);
      return NextResponse.json(
        { error: "Failed to fetch projects" },
        { status: 500 }
      );
    }

    // Get document counts from Supermemory for each project
    const projectsWithCounts = await Promise.all(
      (projects || []).map(async (project) => {
        const containerTag = await getProjectContainerTag(project.id);
        const count = await getDocumentCountFromSupermemory(project.company_id, containerTag);
        return {
          ...project,
          containerTag,
          document_count: count,
          documentCount: count,
        };
      })
    );

    return NextResponse.json({ projects: projectsWithCounts });
  } catch (err: any) {
    console.error("[Projects API] GET error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/knowledge/projects
 * 
 * Create a new project
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyId, name, type = "vault", description } = body;

    if (!companyId || !name) {
      return NextResponse.json(
        { error: "Company ID and name are required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    // Generate slug
    const slug = generateSlug(name);

    // Get template
    const template = PROJECT_TEMPLATES[type as keyof typeof PROJECT_TEMPLATES] || PROJECT_TEMPLATES.vault;

    // Create project in Supabase
    const { data: project, error } = await supabase
      .from("knowledge_projects")
      .insert({
        company_id: companyId,
        name,
        slug,
        description: description || template.description,
        type,
        container_tag_suffix: slug,
        created_by: access.auth.userId,
        folder_structure: template.folderStructure,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A project with this name already exists" },
          { status: 409 }
        );
      }
      console.error("[Projects API] Error creating project:", error);
      return NextResponse.json(
        { error: "Failed to create project" },
        { status: 500 }
      );
    }

    const containerTag = await getProjectContainerTag(project.id);

    return NextResponse.json(
      {
        project: {
          ...project,
          containerTag,
          documentCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[Projects API] POST error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create project" },
      { status: 500 }
    );
  }
}

/**
 * Generate URL-friendly slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

/**
 * Get full container tag for a project
 */
async function getProjectContainerTag(projectId: string): Promise<string> {
  const { data } = await supabase
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

/**
 * Get document count from Supermemory
 */
async function getDocumentCountFromSupermemory(
  companyId: string,
  containerTag: string
): Promise<number> {
  try {
    // Get company Supermemory key
    const { data: company } = await supabase
      .from("companies")
      .select("integration_credentials")
      .eq("id", companyId)
      .single();

    const smKey =
      company?.integration_credentials?.supermemory_api_key ||
      process.env.SUPERMEMORY_API_KEY;

    if (!smKey) return 0;

    // Search with limit 1 to get count info
    const response = await fetch(`${SUPERMEMORY_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${smKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: "*",
        containerTags: [containerTag],
        limit: 1,
      }),
    });

    if (!response.ok) return 0;

    const data = await response.json();
    return data.total || data.count || data.results?.length || 0;
  } catch {
    return 0;
  }
}
