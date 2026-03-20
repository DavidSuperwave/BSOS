import { createClient } from "@supabase/supabase-js";
import { BsosKnowledgeProject, BsosProjectKey } from "./types";

const PROJECT_TYPE_MAP: Record<BsosProjectKey, string> = {
  "company-playbook": "knowledge_base",
  research: "research",
  campaigns: "campaign",
  intelligence: "knowledge_base",
  leads: "knowledge_base",
  imports: "vault",
};

export const SEED_PROJECTS: BsosKnowledgeProject[] = [
  {
    project_key: "company-playbook",
    name: "Company Playbook",
    description: "Evergreen org strategy, ICP, SOPs, positioning",
    icon: "📋",
    display_order: 1,
    is_locked: true,
  },
  {
    project_key: "research",
    name: "Research",
    description: "Research docs, source analysis, pre-campaign studies",
    icon: "🔬",
    display_order: 2,
    is_locked: true,
  },
  {
    project_key: "campaigns",
    name: "Campaigns",
    description: "Campaign-bound artifacts, drafts, research summaries, launch plans",
    icon: "📊",
    display_order: 3,
    is_locked: true,
  },
  {
    project_key: "intelligence",
    name: "Intelligence",
    description: "Daily intelligence reports, anomaly briefs, summaries",
    icon: "📈",
    display_order: 4,
    is_locked: true,
  },
  {
    project_key: "leads",
    name: "Leads",
    description: "Lead/account intelligence, enrichment, ICP fit assessments",
    icon: "🎯",
    display_order: 5,
    is_locked: true,
  },
  {
    project_key: "imports",
    name: "Imports",
    description: "Baseline onboarding imports and synced source material",
    icon: "📦",
    display_order: 6,
    is_locked: true,
  },
];

export async function seedCompanyProjects(
  companyId: string,
  supabase: ReturnType<typeof createClient>,
  createdBy: string
): Promise<void> {
  for (const project of SEED_PROJECTS) {
    const { error } = await supabase.from("knowledge_projects").upsert(
      {
        company_id: companyId,
        project_key: project.project_key,
        name: project.name,
        slug: project.project_key,
        description: project.description,
        type: PROJECT_TYPE_MAP[project.project_key],
        container_tag_suffix: project.project_key,
        created_by: createdBy,
        folder_structure: [],
        system_seeded: true,
        display_order: project.display_order,
        icon: project.icon,
        is_locked: project.is_locked,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,project_key" }
    );

    if (error) {
      throw new Error(
        `Failed to seed project ${project.project_key} for company ${companyId}: ${error.message}`
      );
    }
  }
}

export async function ensureProjectExists(
  projectKey: BsosProjectKey,
  companyId: string,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const { data, error } = await supabase
    .from("knowledge_projects")
    .select("id")
    .eq("company_id", companyId)
    .eq("project_key", projectKey)
    .single();

  if (error || !data) {
    throw new Error(
      `Project ${projectKey} not found for company ${companyId}. Run seedCompanyProjects first.`
    );
  }

  return data.id;
}
