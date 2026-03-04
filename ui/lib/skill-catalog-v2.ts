import * as fs from "fs/promises";
import * as path from "path";
import { getAdminClient } from "@/lib/bsos/db";
import { normalizeSkillSlug } from "@/lib/skills/common";
import { parseSkillFrontmatter } from "@/lib/skills/frontmatter";
import { syncSkillToAgents } from "@/lib/skills/skill-sync";
import type { CompanyAgentType } from "@/lib/skills/types";

type BuiltInCategory = "onboarding" | "daily" | "lifecycle";

type BuiltInSkill = {
  slug: string;
  category: BuiltInCategory;
  risk_level: "low" | "medium" | "high";
  level?: "L1" | "L2" | "L3";
  isDefault: true;
  metadata: {
    source: "built-in";
    category: BuiltInCategory;
    risk_level: "low" | "medium" | "high";
    core: true;
    removable: false;
    level?: "L1" | "L2" | "L3";
  };
};

export const BUILT_IN_SKILLS: BuiltInSkill[] = [
  { slug: "copy-analyzer", category: "onboarding", risk_level: "low", isDefault: true, metadata: { source: "built-in", category: "onboarding", risk_level: "low", core: true, removable: false, level: "L1" } },
  { slug: "reply-miner", category: "onboarding", risk_level: "low", isDefault: true, metadata: { source: "built-in", category: "onboarding", risk_level: "low", core: true, removable: false, level: "L1" } },
  { slug: "lead-profiler", category: "onboarding", risk_level: "medium", isDefault: true, metadata: { source: "built-in", category: "onboarding", risk_level: "medium", core: true, removable: false, level: "L1" } },
  { slug: "bounce-diagnostician", category: "onboarding", risk_level: "medium", isDefault: true, metadata: { source: "built-in", category: "onboarding", risk_level: "medium", core: true, removable: false, level: "L1" } },
  { slug: "deal-miner", category: "onboarding", risk_level: "medium", isDefault: true, metadata: { source: "built-in", category: "onboarding", risk_level: "medium", core: true, removable: false, level: "L1" } },
  { slug: "deliverability-assessor", category: "onboarding", risk_level: "high", isDefault: true, metadata: { source: "built-in", category: "onboarding", risk_level: "high", core: true, removable: false, level: "L1" } },

  { slug: "campaign-monitor", category: "daily", risk_level: "low", isDefault: true, metadata: { source: "built-in", category: "daily", risk_level: "low", core: true, removable: false, level: "L1" } },
  { slug: "deliverability-watchdog", category: "daily", risk_level: "high", isDefault: true, metadata: { source: "built-in", category: "daily", risk_level: "high", core: true, removable: false, level: "L1" } },
  { slug: "pipeline-tracker", category: "daily", risk_level: "medium", isDefault: true, metadata: { source: "built-in", category: "daily", risk_level: "medium", core: true, removable: false, level: "L1" } },
  { slug: "icp-validator", category: "daily", risk_level: "medium", isDefault: true, metadata: { source: "built-in", category: "daily", risk_level: "medium", core: true, removable: false, level: "L1" } },
  { slug: "intelligence-reporter", category: "daily", risk_level: "low", isDefault: true, metadata: { source: "built-in", category: "daily", risk_level: "low", core: true, removable: false, level: "L1" } },
  { slug: "profile-enricher", category: "daily", risk_level: "medium", isDefault: true, metadata: { source: "built-in", category: "daily", risk_level: "medium", core: true, removable: false, level: "L1" } },

  { slug: "campaign-researcher", category: "lifecycle", risk_level: "low", level: "L2", isDefault: true, metadata: { source: "built-in", category: "lifecycle", risk_level: "low", core: true, removable: false, level: "L2" } },
  { slug: "campaign-builder", category: "lifecycle", risk_level: "medium", level: "L3", isDefault: true, metadata: { source: "built-in", category: "lifecycle", risk_level: "medium", core: true, removable: false, level: "L3" } },
  { slug: "campaign-launcher", category: "lifecycle", risk_level: "high", level: "L3", isDefault: true, metadata: { source: "built-in", category: "lifecycle", risk_level: "high", core: true, removable: false, level: "L3" } },
];

const ALL_AGENT_TYPES: CompanyAgentType[] = ["main", "campaigns", "crm", "inbox"];

export function buildSkillMd(skill: BuiltInSkill): string {
  const useWhen = {
    "copy-analyzer": ["You need copy quality diagnostics.", "You are onboarding and need baseline messaging analysis."],
    "reply-miner": ["You need sentiment and objection extraction from replies.", "You want positive/negative reply pattern mining."],
    "lead-profiler": ["You need ICP-fit profiling for leads.", "Lead quality scoring is missing or stale."],
    "bounce-diagnostician": ["Bounce rates increased.", "You need domain/list-level bounce root-cause analysis."],
    "deal-miner": ["You need win/loss signal extraction.", "You want reasons for deal conversion outcomes."],
    "deliverability-assessor": ["You need mailbox/domain setup audit.", "Warmup/authentication posture must be assessed."],
    "campaign-monitor": ["You need hourly campaign anomaly checks.", "You need CTR/response drifts flagged quickly."],
    "deliverability-watchdog": ["You need ongoing inbox placement and sender health checks.", "Blocklist and authentication monitoring is required."],
    "pipeline-tracker": ["You need CRM stage movement summaries.", "Pipeline velocity and conversion changes need tracking."],
    "icp-validator": ["ICP assumptions need weekly validation.", "Segment performance divergence is suspected."],
    "intelligence-reporter": ["You need end-of-day GTM summary.", "Exec-ready highlights and risks are needed."],
    "profile-enricher": ["Contact/company records are sparse.", "You need enrichment for targeting precision."],
    "campaign-researcher": ["You need campaign angle and market research.", "You need supporting evidence before writing campaigns."],
    "campaign-builder": ["You need complete multi-step campaign drafts.", "Research is ready and campaign assets must be built."],
    "campaign-launcher": ["Campaign assets are approved and launch-ready.", "You need orchestration and launch checks executed."],
  } as Record<string, string[]>;

  const dontUseWhen = {
    "copy-analyzer": ["No campaign copy exists yet.", "You only need infrastructure diagnostics."],
    "reply-miner": ["There are no reply datasets yet.", "You only need pre-launch static analysis."],
    "lead-profiler": ["Lead records are unavailable.", "You need only campaign creative critique."],
    "bounce-diagnostician": ["Sending has not started yet.", "No bounce logs are available."],
    "deal-miner": ["No opportunity history exists.", "You only need top-of-funnel metrics."],
    "deliverability-assessor": ["You need reply sentiment analysis only.", "Mailbox and domain access is unavailable."],
    "campaign-monitor": ["Campaigns are inactive.", "You need deep onboarding audit, not monitoring."],
    "deliverability-watchdog": ["No active sending domain/mailbox exists.", "You need one-time onboarding assessment only."],
    "pipeline-tracker": ["CRM integration is not connected.", "No opportunity objects exist."],
    "icp-validator": ["There is insufficient volume for segmentation inference.", "You need immediate copy fixes, not ICP validation."],
    "intelligence-reporter": ["Upstream daily skills have not run.", "You need raw logs rather than executive summary."],
    "profile-enricher": ["Data providers are disconnected.", "Records are already fully enriched recently."],
    "campaign-researcher": ["You already have approved research and only need launch execution.", "No campaign initiative exists."],
    "campaign-builder": ["Research is missing.", "Compliance or brand approvals are incomplete."],
    "campaign-launcher": ["Campaign content is unapproved.", "Deliverability posture is unhealthy."],
  } as Record<string, string[]>;

  const title = skill.slug
    .split("-")
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");

  return `---
slug: ${skill.slug}
name: ${title}
category: ${skill.category}
risk_level: ${skill.risk_level}
metadata:
  source: built-in
  core: true
  removable: false
---

# ${title}

## Use when
${(useWhen[skill.slug] ?? ["Use when this skill's domain applies."]).map((s) => `- ${s}`).join("\n")}

## Don't use when
${(dontUseWhen[skill.slug] ?? ["Do not use when prerequisites are unavailable."]).map((s) => `- ${s}`).join("\n")}
`;
}

async function readSkillMdFromFs(slug: string): Promise<string | null> {
  const candidate = path.join(process.cwd(), "openclaw", "skills", slug, "SKILL.md");
  try {
    return await fs.readFile(candidate, "utf8");
  } catch {
    return null;
  }
}

export async function loadWorkspaceDefaultSkillBlueprints(): Promise<
  Array<{
    slug: string;
    name: string;
    description: string;
    version: string;
    content: string;
    frontmatter: Record<string, any>;
    metadata: Record<string, any>;
  }>
> {
  const rows: Array<{
    slug: string;
    name: string;
    description: string;
    version: string;
    content: string;
    frontmatter: Record<string, any>;
    metadata: Record<string, any>;
  }> = [];

  for (const skill of BUILT_IN_SKILLS) {
    const slug = normalizeSkillSlug(skill.slug);
    const fileContent = await readSkillMdFromFs(slug);
    const content = fileContent ?? buildSkillMd(skill);
    const frontmatter = parseSkillFrontmatter(content);
    const title = slug
      .split("-")
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join(" ");

    rows.push({
      slug,
      name: frontmatter.name || title,
      description: frontmatter.description || `${title} built-in skill.`,
      version: "1.0.0",
      content,
      frontmatter,
      metadata: {
        ...skill.metadata,
        from_filesystem: Boolean(fileContent),
      },
    });
  }

  return rows;
}

export async function ensureDefaultBlueprints(): Promise<void> {
  const supabase = getAdminClient();
  const blueprints = await loadWorkspaceDefaultSkillBlueprints();

  for (const bp of blueprints) {
    const { data: existing } = await supabase
      .from("company_skill_blueprints")
      .select("id")
      .is("company_id", null)
      .eq("slug", bp.slug)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("company_skill_blueprints")
        .update({
          slug: bp.slug,
          name: bp.name,
          description: bp.description,
          version: bp.version,
          skill_md: bp.content,
          metadata: bp.metadata,
          is_default: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("company_skill_blueprints").insert({
        company_id: null,
        slug: bp.slug,
        name: bp.name,
        description: bp.description,
        version: bp.version,
        skill_md: bp.content,
        metadata: bp.metadata,
        is_default: true,
      });
    }
  }
}

export async function applyDefaultSkillPackToCompany(companyId: string): Promise<void> {
  const supabase = getAdminClient();
  const defaults = await loadWorkspaceDefaultSkillBlueprints();

  for (const bp of defaults) {
    const { data: existing } = await supabase
      .from("company_skill_blueprints")
      .select("id")
      .eq("company_id", companyId)
      .eq("slug", bp.slug)
      .maybeSingle();

    if (!existing?.id) {
      await supabase.from("company_skill_blueprints").insert({
        company_id: companyId,
        slug: bp.slug,
        name: bp.name,
        description: bp.description,
        version: bp.version,
        skill_md: bp.content,
        metadata: bp.metadata,
        is_default: true,
      });
    }

    await syncSkillToAgents({
      admin: supabase,
      companyId,
      slug: bp.slug,
      content: bp.content,
      agentTypes: ALL_AGENT_TYPES,
    });
  }
}

export async function listSkillCatalogForCompany(companyId: string): Promise<any[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("company_skill_blueprints")
    .select("id, company_id, slug, name, description, version, is_default, metadata, updated_at")
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .order("slug", { ascending: true });

  if (error) {
    throw new Error(`Unable to list skill catalog: ${error.message}`);
  }

  return data ?? [];
}

export async function importBlueprintToCompany(params: {
  companyId: string;
  skillSlug: string;
  skillMd: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const supabase = getAdminClient();
  const slug = normalizeSkillSlug(params.skillSlug);
  const frontmatter = parseSkillFrontmatter(params.skillMd);
  const title = slug
    .split("-")
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");

  await supabase.from("company_skill_blueprints").upsert(
    {
      company_id: params.companyId,
      slug,
      name: frontmatter.name || title,
      description: frontmatter.description || `${title} imported skill.`,
      version: "1.0.0",
      skill_md: params.skillMd,
      metadata: {
        source: "import",
        ...(params.metadata ?? {}),
      },
      is_default: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,slug" },
  );
}
